const port = process.env.PORT || 8100;

// Init variables and server

const fs = require('fs');
const moment = require('moment');
const express = require('express');
const app = require('express')();
const path = require('path');
const credentials = require(path.join(__dirname, 'secure', 'credentials.json')); // secure credentials

const levenshtein = require('js-levenshtein');
const tabletop = require('tabletop');
const session = require('express-session');
const sharedsession = require("express-socket.io-session");
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

const http = require('http').Server(app);
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.printf(info => `${moment(new Date()).format('M/DD HH:mm:ss')}: ${info.level}: ${info.message}`)
    }),
    new winston.transports.File({
      filename: path.join(__dirname, 'logs', 'error.log'),
      level: 'error',
      format: winston.format.printf(info => `${moment(new Date()).format('YYYY-MM-DD HH:mm:ss')}: ${info.level}: ${info.message}`)
    }),
    new winston.transports.File({
      filename: path.join(__dirname, 'logs', 'combined.log'),
      format: winston.format.printf(info => `${moment(new Date()).format('YYYY-MM-DD HH:mm:ss')}: ${info.level}: ${info.message}`)
    })
  ]
});

const MongoClient = require('mongodb').MongoClient;
const MongoURL = credentials.database;
const dbName = 'opentrivia';
const dbClient = new MongoClient(MongoURL, {useNewUrlParser: true, useUnifiedTopology: true}); 
let mdb; 
dbClient.connect((e) => {
  if(e){logger.error('Failed to connect to local MongoDB server', e); require('process').exit()}
  logger.info('Connected to local MongoDB server.')
  mdb = dbClient.db(dbName);
  scoreDB = mdb.collection('scores');
})  

let sess_MongoStore = require('connect-mongo')(session); 
let sess = {
  secret: credentials.sessionKey,
  store: new sess_MongoStore({
    url: credentials.database, 
    autoRemove: 'interval', 
    autoRemoveInterval: 5
  }),
  saveUninitialized: false, 
  resave: false,
  cookie: {
    maxAge: 28800000
  }
}
 
if (app.get('env') === 'production' || fs.existsSync(path.join(__dirname, 'production.cfg'))) {
  logger.info('Production environment detected.')
  app.set('trust proxy', 1) // trust first proxy
  // sess.cookie.secure = true // serve secure cookies (currently not working)
}

app.use(session(sess));

const io = require('socket.io')(http);
io.use(sharedsession(session(sess))); 

// End of init
// Loading UserDB

let userdb = []; 
let questiondb = []; 
function loadSheets(){
  tabletop.init({
    key: 'https://docs.google.com/spreadsheets/d/1PhWNoPC0itS4ZB0HVV_Y3vEcZFtw3vBEk2OiR0OpjbI/pubhtml', 
    simpleSheet: true
  }).then((dt) => {
    userdb = dt; 
    logger.info(`Loaded UserDB (${dt.length} entries)`)
  });
  tabletop.init({
    key: 'https://docs.google.com/spreadsheets/u/1/d/1cYaUC73QE8gvE-dotdOg_fS--dJhVQ3nO21ZnfndT5Q/pubhtml', 
    simpleSheet: true
  }).then((dt) => {
    questiondb = dt; 
    logger.info(`Loaded QuestionDB (${dt.length} entries)`); 
  }); 
}
loadSheets(); 


function lookupUser(teamID){
  let out = userdb.filter(obj => {return obj.TeamID === teamID}); 
  if(out.length > 0){
    return out[0]; 
  } else{
    return false; 
  }
}

// End of UserDB
// Scoring management

let scoreDB; 
function saveScores(round, question, data){
  scoreDB.findOne({
    r: round,
    q: question
  }).then(r => {
    if(r){
      scoreDB.updateOne({
        r: round, 
        q: question
      }, {
        $set: {
          d: data
        }
      }).then(() => {
        logger.info(`[Scores] Updated: R${round} Q${question}`);
      })
    } else{
      scoreDB.insertOne({
        r: round, 
        q: question, 
        d: data
      }).then(() => {
        logger.info(`[Scores] Saved: R${round} Q${question}`);
      })
    }
  })
}

async function getScores(round){
  let res = await scoreDB.find({
    r: round
  }).toArray();
  console.log(res);  
  return res; 
}

// End of scoring management
// Question management

let question = {
  active: false, // whether answers can be submitted or not 
  timer: {
    interval: null,  
    end: 0
  }, 
  current: {}, 
  curIndex: -1, 
  scores: {}, // actual scores of each team (TeamID: 0/1)
  selections: {} // only used in SA questions to record answers
}
function getCurrentQuestion(full){
  let obj = question.current; 
  try {
    let out = {
      type: obj.Type.toLowerCase(), 
      active: question.active, 
      num: obj.Q
    }
    if(obj.Type === 'MC'){
      out.options = [obj.OptA, obj.OptB, obj.OptC, obj.OptD, obj.OptE]
    }
    else if(obj.Type === 'SP'){
      out.url = obj.Question; 
    }
    if(full){
      out.round = obj.Round; 
      out.question = obj.Question; 
      out.image = obj.Image; 
      out.media = obj.Media;
      out.answer = obj.Answer;
      out.category = obj.Category;
      out.subcategory = obj.Subcategory  
    }
    return out; 
  } catch (e) {
    io.of('secure').emit('question-error', e); 
    return {
      type: 'sa', 
      num: -1
    }
  }
}
function loadQuestion(index){
  question.current = questiondb[index]; 
  question.curIndex = index; 
  question.timestamp = Date.now(); 
  io.emit('question', getCurrentQuestion()); 
  io.of('secure').emit('question-full', getCurrentQuestion(1)); 
}

function processAnswer(team, ans, socket){
  if(!question.active){
    socket.emit('answer-ack', {ok: false, msg: 'Question not active'})
    return; 
  }

  let q = getCurrentQuestion(1); 
  if(typeof ans !== 'string' || !team.TeamID){
    socket.emit('answer-ack', {ok: false, msg: 'No answer provided'})
    logger.warn('Unable to process answer: Missing data'); 
    io.of('secure').emit('update', 'processAnswer error: missing required data'); 
    return false;
  }
  else if(!q.answer){
    logger.warn('Unable to process answer: No question selected'); 
    socket.emit('answer-ack', {ok: false, msg: 'No question active'})
    io.of('secure').emit('update', 'processAnswer error: no question selected server-side'); 
    return false;
  }
  socket.emit('answer-ack', {ok: true})
  let tid = team.TeamID; 
  if(q.type === 'mc'){
    question.selections[tid] = ans.toLowerCase(); 
    if(ans.toLowerCase() === q.answer.toLowerCase()){
      question.scores[tid] = 1; 
      return true; 
    } else{
      question.scores[tid] = 0; 
      return false; 
    }
  } else if(q.type === 'sa'){
    ans = ans.toLowerCase().trim(); 
    let cor = q.answer.toLowerCase().trim(); // correct answer
    if(ans.slice(0, 1) !== cor.slice(0, 1)){
      question.scores[tid] = 0; // first letter must match
      return false; 
    } else if(levenshtein(ans, cor) < 3  || levenshtein(ans, cor) === 3 && cor.length > 11){
      question.scores[tid] = 1;
      return true; 
    } else{
      question.scores[tid] = 0;
      return true; 
    }
  }
}

function getAnswerStats(){
  if(question.current.Type === 'MC'){
    let resp = Object.values(question.selections);
    let t = resp.length; 
    return {
      type: 'mc', 
      ans: question.current.Answer.toLowerCase(), 
      correct: Object.values(question.scores).filter(r => r==1).length, 
      total: Object.values(question.scores).length, 
      a: Math.round(resp.filter(i => i=='a').length/t*1000)/1000, 
      b: Math.round(resp.filter(i => i=='b').length/t*1000)/1000, 
      c: Math.round(resp.filter(i => i=='c').length/t*1000)/1000, 
      d: Math.round(resp.filter(i => i=='d').length/t*1000)/1000, 
      e: Math.round(resp.filter(i => i=='e').length/t*1000)/1000, 
    }
  } else if(question.current.Type === 'SA'){
    return {
      type: 'sa', 
      ans: question.current.Answer, 
      correct: Object.values(question.scores).filter(r => r==1).length, 
      total: Object.values(question.scores).length
    }
  }
  return false
}

function startTimer(s){
  question.timer.end = Date.now() + (1000 * s); 
  question.timer.interval = setInterval(() => {
    let t = Math.round((question.timer.end - Date.now())/1000); 
    io.of('secure').emit('timer', t); 
    if(t <= 0){
      clearInterval(question.timer.interval); 
      question.active = false; 
      io.emit('stop'); 
    }
  }, 1000); 
  io.of('secure').emit('timer', s); 
}

function stopTimer(){
  clearInterval(question.timer.interval); 
}

// End question management
// Socket.io

const nsp = io.of('/secure');
nsp.use(sharedsession(session(sess))).use(function(socket, next){
  if (socket.handshake.session && socket.handshake.session.host){ // hosts only!
    logger.info('[sec] authenticated: '+socket.id)
    next(); 
  } else {
    logger.info('[sec] rejected: '+socket.id)
      next(new Error('Authentication error'));
  }    
}).on('connection', function(socket){
  logger.info('[sec] connected: '+socket.id);

  socket.on('test', function(param){
    logger.info('[sec] recieved command: test ['+param+']')
    switch(param){
      case 'mc': 
        io.emit('question', {
          type: 'mc', 
          num: 1, 
          options: ['Apple', 'Banana', 'Carrot', 'Dragonfruit', 'Eggplant'], 
          canChange: true
        })
        break; 
      case 'sa': 
        io.emit('question', {
          type: 'sa', 
          num: 2
        })
        break; 
      case 'sp': 
        io.emit('question', {
          type: 'sp', 
          url: 'https://docs.google.com/forms/d/e/1FAIpQLSdjHuRngsHN1kXuf-Sq_-c_NdAY09MkEvXmRfCLmmICQkibEg/viewform'
        })
        break; 
    }
  })

  socket.on('status', function(){
    if(question.curIndex !== -1){
      socket.emit('question-full', getCurrentQuestion(1))}
  })

  socket.on('load-question', function(q){
    question.active = true; 
    loadQuestion(q); 
  })

  socket.on('start-timer', function(t){
    startTimer(t); 
  })

  socket.on('show-answer', function(){
    if(question.active){
      io.emit('stop'); // stop accepting answers in case it wasn't already turned off
      question.active = false; 
    }
    io.of('secure').emit('answer-stats', getAnswerStats());
    io.emit('answer', question.current.Answer.toLowerCase());
  })

  socket.on('get-questionList', function(){
    socket.emit('question-list', questiondb.map(r => {return {r: r.Round, q: r.Q}}))
  }); 

  socket.on('scores-save', function(){
    let r = getCurrentQuestion(true).round; 
    let n = getCurrentQuestion(true).num; 
    saveScores(question.round, question.num, question.scores); 
  })

});

io.use(function(socket, next){
  if (socket.handshake.session && (socket.handshake.session.user || socket.handshake.session.host)){ // hosts only!
    logger.info('[std] authenticated: '+socket.id);
    socket.join('users'); 
    next(); 
  } else {
    logger.info('[std] rejected: '+socket.id)
      next(new Error('Authentication error'));
  }    
}).on('connection', function(socket){
  logger.info('[std] connected: '+socket.id);  
  socket.on('status', function(){
    if(socket.handshake.session.user){
      socket.emit('status', {valid: true, user: socket.handshake.session.user}); 
      if(question.curIndex !== -1){
        socket.emit('question', getCurrentQuestion())}
    } else{
      socket.emit('status', {valid: false}); 
    }
  })

  socket.on('disconnect', function(){
    logger.info('user disconnected');
  });

  socket.on('sec-login', function(){
    if(socket.handshake.session.host){
      logger.info('[sec] authenticated: '+socket.id); 
      socket.join('users'); 
      socket.join('hosts'); 
      socket.emit('status', {valid: true}); 
    }
    else{
      socket.emit('status', {valid: false}); 
    }
  })


  socket.on('answer', function(ans){
    if(socket.handshake.session.user){
      logger.info('[std] recieved answer: '+ans);  
      processAnswer(socket.handshake.session.user, ans, socket);
      io.of('secure').emit('ans-update', question.scores);  
    } else{
      socket.emit('status', {valid: false});
    }
  })
});

// End of Socket.io

app.get('/contestant', (req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'public', 'contestant.html'))
})

app.get('/host', (req, res) => {
  if(req.session.host){
    res.status(200).sendFile(path.join(__dirname, 'host', 'index.html'))
  } else{
    res.status(302).redirect('/?403')
  }
})

app.get('/host/*', (req, res) => {
  let reqPath = req.path.slice(1).split('/').slice(1);
  reqPath = path.join(__dirname, 'host', ...reqPath);
  if(req.session.host){
    if(fs.existsSync(reqPath)){
      res.status(200).sendFile(reqPath);
    }
    else if(fs.existsSync(reqPath + '.html')){
      res.status(200).sendFile(reqPath + '.html');
    }
    else{
      res.status(404).json({success: false, msg: '[404] File not found'}); 
    }
  }
  else{
    if(fs.existsSync(reqPath + '.html')){
      res.status(302).redirect('./?403'); 
      return
    }
    res.status(404).json({success: false, msg: '[403] Authorization required'}); 
  }
})

app.use(express.static('public')); 

app.post('/auth', (req, res) => {
  if(typeof req.body.id !== 'string'){
    res.status(302).redirect('/?failedLogin'); 
  }
  else{
    if(req.body.id === credentials.hostPassword){
      req.session.regenerate((err) => {
        if(err) {
          res.status(302).redirect('/?failedLogin'); 
          return; 
        }
        req.session.host = true; 
        res.status(302).redirect('/host'); 
      }); 
      return; 
    }
    
    let user = lookupUser(req.body.id); 
    if(!user){
      res.status(302).redirect('/?failedLogin'); 
      return; 
    }
    else{
      req.session.regenerate((err) => {
        if(err) {
          res.status(302).redirect('/?failedLogin'); 
          return; 
        }
        req.session.user = user; 
        res.status(302).redirect('/contestant'); 
      })
    }
  }
})

http.listen(port, function () {
  logger.info('Starting server...');
  logger.info('Now listening on localhost:' + port);
});