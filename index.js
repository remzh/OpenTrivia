/**
 * Open Trivia 
 * (C) 2020 Ryan Zhang
 * 
 * See license.md for legal information.
 */

require('dotenv').config(); 
const port = process.env.PORT || 8100;

// Init variables and server

const fs = require('fs');
const moment = require('moment');
const express = require('express');
const app = require('express')();
const path = require('path');
const colors = require('colors');
// const credentials = require(path.join(__dirname, 'secure', 'credentials.json')); // secure credentials
// const scoring = require(path.join(__dirname, 'secure', 'scoring.json')); 
let scoring = {
  countedRounds: process.env.OT_SCORING_ROUNDS.split(',').map(r => parseInt(r)), 
  roundMultiplier: process.env.OT_SCORING_MULT?process.env.OT_SCORING_MULT.split(',').map(r => parseFloat(r)):process.env.SCORING_ROUNDS.split(',').fill(1)
}

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
const logger_color = function(s) {
  switch (s) {
    case 'info': 
      return 'info'.cyan; 
    case 'warn': 
      return 'warn'.yellow; 
    case 'error': 
      return 'error'.magenta
    case 'debug': 
      return 'debug'.green
    default: 
      return s
  }
}
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.printf(info => `${moment(new Date()).format('M/DD HH:mm:ss')}: ${logger_color(info.level)}: ${info.message}`)
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

if(!scoring || !scoring.countedRounds){
  logger.error('(critical) missing: scoring.countedRounds'); 
  process.exit()
}

const MongoClient = require('mongodb').MongoClient;
const MongoURL = process.env.DB_URL;
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
  secret: process.env.SESSION_KEY,
  store: new sess_MongoStore({
    url: process.env.DB_URL, 
    autoRemove: 'interval', 
    autoRemoveInterval: 5
  }),
  saveUninitialized: false, 
  resave: false,
  cookie: {
    maxAge: 172800000
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
    key: process.env.OT_USERS, 
    simpleSheet: true
  }).then((dt) => {
    userdb = dt; 
    logger.info(`Loaded UserDB (${dt.length} entries)`)
  });
  tabletop.init({
    key: process.env.OT_QUESTIONS, 
    simpleSheet: true
  }).then((dt) => {
    questiondb = dt; 
    logger.info(`Loaded QuestionDB (${dt.length} entries)`); 
  }); 
}
loadSheets(); 


function lookupUser(teamPIN){
  let out = userdb.find(obj => {
    return String(obj.TeamPIN) === teamPIN
  }); 
  return out; 
}

// End of UserDB
// Scoring management

let scoreDB; 
function saveScores(round, question, data, tb){
  let dt = {d: data}
    if(tb) dt.tb = tb; 
  scoreDB.findOne({
    r: round,
    q: question
  }).then(r => {
    if(r){
      scoreDB.updateOne({
        r: round, 
        q: question
      }, {
        $set: dt
      }).then(() => {
        logger.info(`[Scores] Updated: R${round} Q${question}`);
      })
    } else{
      dt.r = round; 
      dt.q = question; 
      scoreDB.insertOne(dt).then(() => {
        logger.info(`[Scores] Saved: R${round} Q${question}`);
      })
    }
  })
}

async function loadScores(round){
  let res = await scoreDB.find({
    r: round
  }).toArray();  
  return res; 
}

async function tallyScores(round){
  let raw = await loadScores(round); 
  let out = {}; 
  for(let i of raw){
    for(let j in i.d){
      if(!out[j]) out[j] = {tb: 0}; 
      if(i.d[j] === 1){
        if(out[j].s){
          out[j].s ++; 
        } else{
          out[j].s = 1; 
        }
      }
    }
    for(let j in i.tb){
      if(!out[j]) out[j] = {}; 
      if(i.tb[j]){
        if(out[j].tb){
          out[j].tb += i.tb[j]; 
        } else{
          out[j].tb = i.tb[j]; 
        }
      }
    }
  }
  return out; 
}

async function rankScores(round){
  let scores = await tallyScores(round); 
  let out = []; 
  for(let team in scores){
    out.push({
      t: team, 
      s: scores[team]
    })
  }
  try {
    out = out.sort((a, b) => {
      if(a.s.s !== b.s.s){
        return b.s.s - a.s.s; 
      } else{
        return b.s.tb - a.s.tb
      }
    })
  } catch(e) {
    logger.error(`[crit] rankScores failure: ${e}`); 
    io.of('secure').emit('question-error', `[crit] unable to sort ranks: ${e}`); 
  }

  for(let i = 0; i < out.length; i++){
    out[i].r = (i+1); 
  }

  return {
    round, 
    ranks: out
  }; 
}

/**
 * Calculates the overall score by taking the sum of the points in all the rounds specified. 
 * Only teams that have answered at least one question in the first round will be counted. 
 * @param {string} input - rounds to be used, separated with commas 
 * @returns {object} {ok: (boolean), data: (array)}
 */
async function computeOverallScores(input, showTeamID=true){
  try {
    let scores = [];
    let rounds = input ? input.split(',').map(r => parseInt(r)) : scoring.countedRounds; 
    for(let i of rounds){
      scores.push(await rankScores(i))
    }

    if (scores.length < 1) {
      return {ok: false, error: 'No scores to report'}
    }

    let allTeams = userdb.map(r => r.TeamID); 

    let totalScores = []; 
    for (let team of allTeams) {
      let points=0, correct=0, tb = 0, indiv=[]; // accumulation of score and tie-breaker respectively
      for (let round of scores) {
        let i = round.ranks, roundNum = round.round; 
        let selTeam = i.find(r => r.t === team); 
        if (selTeam) {
          let numCorrect = selTeam.s.s ? selTeam.s.s : 0; 
          let multiplier = scoring.roundMultiplier[scoring.countedRounds.indexOf(roundNum)]; 
          if (isNaN(multiplier)) multiplier = 1; 
          points += numCorrect * multiplier; 
          correct += numCorrect; 
          tb += (selTeam.s.tb ? selTeam.s.tb : 0);
          indiv.push({
            s: numCorrect*multiplier, 
            c: numCorrect, 
            m: multiplier, 
            tb: selTeam.s.tb ? Math.round(selTeam.s.tb*1000)/1000 : 0,
            r: selTeam.r ? selTeam.r : -1
          });
        } else {
          indiv.push({
            s: 0, 
            c: 0, 
            tb: 0, 
            r: -1
          })
        }
      }
      totalScores.push({
        t: showTeamID ? team : team.slice(0, 1), 
        tn: userdb.find(r => r.TeamID === team).TeamName, 
        s: { // scores
          c: correct,
          s: points, 
          tb: Math.round(tb*1000)/1000
        }, 
        i: indiv
      })
    }

    totalScores = totalScores.sort((a, b) => {
      if(a.s.s !== b.s.s){
        return b.s.s - a.s.s; 
      } else{
        return b.s.tb - a.s.tb
      }
    })
    for(let i = 0; i < totalScores.length; i++){
      if (i > 0 && totalScores[i-1].s.s === totalScores[i].s.s && totalScores[i-1].s.tb === totalScores[i].s.tb) {
        totalScores[i].r = totalScores[i-1].r; // in the event of a tie
        continue; 
      }
      totalScores[i].r = (i+1); 
    }
    return {ok: true, rounds, data: totalScores}
  } catch (e) {
    return {ok: false, error: e}
  }
}

// End of scoring management
// Question management

let question = {
  active: false, // whether answers can be submitted or not
  timer: {
    interval: null,  
    end: 0
  }, 
  current: {}, // current question taken from array
  curIndex: -1, // index of question in array
  scores: {}, // actual scores of each team (TeamID: 0/1)
  scoresSaved: false, // whether the scores for this question have been saved or not
  tb: {}, // tiebreak values (each timed question can gie up to 10.00 of TB)
  selections: {} // only used in SA questions to record answers
}

/**
 * Calculates a user's tiebreaker score for a question based on how much time they took to correctly answer it
 * Uses a quadratic bezier curve to (hopefully) fairly give scores based on a relatively normal distribution
 * t (time, seconds) | v (value of tiebreaker)
 * 3 | 10
 * 9.5 | 8
 * 15.4 | 5
 * 19.7 | 3
 * 26.7 | 1
 * @returns {number} tiebreaker score, v (0 < v <= 10)
 */
function tbCalc(){
  let cur = Date.now(); 
  let st = question.timestamp; 
  if(!st) return 0; // invalid, no question
  let time = cur - st; // time taken
  let v = Math.round(10000 / (Math.pow(1.06, (time/16000)*(time - 3000)/1000))) / 1000; 
  if(v > 10) return 10; 
  return v; 
}

function getCurrentQuestion(full){
  let obj = question.current; 
  try {
    let out = {
      type: obj.type.toLowerCase(), 
      active: question.active, 
      num: obj.num
    }
    if(obj.type === 'MC'){
      out.options = [obj.optA, obj.optB, obj.optC, obj.optD, obj.optE]
    }
    else if(obj.type === 'SP'){
      out.url = obj.question; 
    }
    if(full){
      out.scoresSaved = question.scoresSaved; 
      out.round = obj.round; 
      out.question = obj.question; 
      out.image = obj.image; 
      out.media = obj.media;
      out.answer = obj.answer;
      out.category = obj.category;
      out.timed = obj.timed; 
      out.index = question.curIndex; 
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

function mapQuestionEntry(inp){
  return {
    round: inp.Round, 
    num: parseInt(inp.Q), 
    type: inp.Type, 
    timed: inp.Timed === 'TRUE' ? true : false, 
    category: inp.Category, 
    question: inp.Question,
    answer: inp.Answer,  
    image: inp.Image, 
    media: inp.Media, 
    optA: inp.OptA, 
    optB: inp.OptB, 
    optC: inp.OptC, 
    optD: inp.OptD, 
    optE: inp.OptE
  }
}

function loadQuestion(index, socket){
  if (!questiondb[index]) {
    socket.emit('update', {type: 'question', msg: `Question index ${index} does not exist`}); 
    return; 
  }
  question.active = true; 
  question.current = mapQuestionEntry(questiondb[index]);
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
    io.of('secure').emit('update', `processAnswer error: no question selected server-side [${team.TeamID}]`); 
    return false;
  }
  let sentAck = false; 
  let tid = team.TeamID; 
  if(q.type === 'mc'){
    if (['a', 'b', 'c', 'd', 'e'].indexOf(ans.toLowerCase()) === -1) {
      socket.emit('answer-ack', {ok: false, msg: 'Invalid multiple choice option'})
      io.of('secure').emit('update', `processAnswer error: invalid MC option (${ans.toLowerCase()}) [${team.TeamID}]`); 
      return; 
    }
    question.selections[tid] = ans.toLowerCase(); 
    teamBroadcast(socket, 'answer-ack', {ok: true, selected: ans.toLowerCase()});
    if(ans.toLowerCase() === q.answer.toLowerCase()){
      question.scores[tid] = 1; 
      return true; 
    } else{
      question.scores[tid] = 0; 
      return false; 
    }
  } else if(q.type === 'sa' || q.type === 'bz'){
    ans = ans.toLowerCase().trim(); 
    let cor = q.answer.toLowerCase().trim(); // correct answer
    if(!q.timed) {
        socket.emit('answer-ack', {ok: true})}
    if(ans.slice(0, 1) !== cor.slice(0, 1)){
      question.scores[tid] = 0; // first letter must match
      if(q.timed){
        sentAck = true; 
        socket.emit('answer-time', {time: Date.now() - question.timestamp, correct: false})}
      return false; 
    } else if(levenshtein(ans, cor) < 3  || levenshtein(ans, cor) === 3 && cor.length > 11){
      question.scores[tid] = 1;
      if(q.timed){
        sentAck = true; 
        teamBroadcast(socket, 'answer-time', {time: Date.now() - question.timestamp, correct: true, tb: tbCalc(), answer: q.answer})
        question.tb[tid] = tbCalc()}
      return true; 
    } else{
      question.scores[tid] = 0;
      if(q.timed){
        sentAck = true; 
        socket.emit('answer-time', {time: Date.now() - question.timestamp, correct: false})}
      return false; 
    }
  }
  if(!sentAck){
    socket.emit('answer-ack', {ok: false, msg: `We couldn't understand your answer. Please contact a dev.`})}
}

function getAnswerStats(){
  if(question.current.type === 'MC'){
    let resp = Object.values(question.selections);
    let t = resp.length; 
    return {
      type: 'mc', 
      ans: question.current.answer.toLowerCase(), 
      correct: Object.values(question.scores).filter(r => r==1).length, 
      total: Object.values(question.scores).length, 
      a: Math.round(resp.filter(i => i=='a').length/t*1000)/1000, 
      b: Math.round(resp.filter(i => i=='b').length/t*1000)/1000, 
      c: Math.round(resp.filter(i => i=='c').length/t*1000)/1000, 
      d: Math.round(resp.filter(i => i=='d').length/t*1000)/1000, 
      e: Math.round(resp.filter(i => i=='e').length/t*1000)/1000, 
      scoresSaved: question.scoresSaved
    }
  } else if(question.current.type === 'SA' || question.current.type === 'BZ'){
    return {
      type: question.current.type.toLowerCase(), 
      ans: question.current.answer, 
      correct: Object.values(question.scores).filter(r => r>0).length, 
      total: Object.values(question.scores).length, 
      scoresSaved: question.scoresSaved
    }
  }
  return false
}

function startTimer(s){
  if (question.timer.interval) {
    clearInterval(question.timer.interval); 
  }
  question.timer.end = Date.now() + (1000 * s); 
  question.timer.interval = setInterval(() => {
    let t = Math.round((question.timer.end - Date.now())/1000); 
    io.emit('timer', t); 
    if(t <= 0){
      clearInterval(question.timer.interval); 
      question.active = false; 
      io.emit('stop'); 
    }
  }, 1000); 
  io.emit('timer', s); 
}

function stopTimer(){
  clearInterval(question.timer.interval); 
  question.timer.interval = false; 
  io.emit('timer', -1); 
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
      next(new Error('authentication error'));
  }    
}).on('connection', function(socket){
  logger.info('[sec] connected: '+socket.id);

  socket.on('action-nextQuestion', () => {
    loadQuestion(question.curIndex + 1, socket); 
  }); 

  socket.on('status', function(){
    if(question.curIndex !== -1){
      socket.emit('question-full', getCurrentQuestion(1))}
  })

  socket.on('load-question', function(q){
    loadQuestion(q, socket); 
  })

  socket.on('start-timer', function(t){
    if (t) {
      startTimer(t); 
    } else {
      let type = getCurrentQuestion().type; 
      switch (type) {
        case 'sa': 
          startTimer(20); 
          break; 
        default: 
          startTimer(10); 
          break; 
      }
    }
  })

  socket.on('stop-timer', function() {
    stopTimer(); 
  })

  socket.on('show-answer', function(saveScores){
    if(!question.current || !question.current.answer){
      io.of('secure').emit('update', 'processAnswer error: no question selected server-side'); 
      return; 
    }
    if(question.active){
      io.emit('stop'); // stop accepting answers in case it wasn't already turned off
      question.active = false; 
    }
    if (saveScores) {
      question.scoresSaved = true; 
      let r = parseInt(getCurrentQuestion(true).round), n = parseInt(getCurrentQuestion(true).num); 
      if(scoring.countedRounds.indexOf(r) !== -1){
        socket.emit('update', `Scores saved for R${r} Q${n}`);
        saveScores(r, n, question.scores, question.tb); 
      }
    }
    io.of('secure').emit('answer-stats', getAnswerStats());
    io.emit('answer', question.current.answer.toLowerCase());
  })

  socket.on('host-firstConnect', async function(){
    socket.emit('question-list', questiondb.map(r => {return {r: r.Round, q: r.Q}}))
    let curScores = await scoreDB.findOne({
      published: true
    }); 
    if (curScores) {
      socket.emit('scores-publish', {ok: true, ts: curScores.ts}); 
    }
  }); 

  socket.on('scores-save', function(){
    let r = parseInt(getCurrentQuestion(true).round); 
    let n = parseInt(getCurrentQuestion(true).num); 
    question.scoresSaved = true; 
    if(scoring.countedRounds.indexOf(r) !== -1){
      saveScores(r, n, question.scores, question.tb); 
      socket.emit('update', `Scores saved for R${r} Q${n}`);
    } else{
      socket.emit('update', `Round (R${r}) not counted; no scores saved`);
    }
  })

  // socket.on('scores-load', function(r){
  //   loadScores(r).then(res => {
  //     socket.emit('update', res); 
  //   })
  // })

  // socket.on('scores-rank', function(r){
  //   rankScores(r).then(res => {
  //     socket.emit('update', res); 
  //   })
  // })

  socket.on('scores-compute', function(r){
    computeOverallScores(r?r:false, true).then(res => {
      socket.emit('scores-host', res); 
    })
  })

  socket.on('scores-publish', async function(){
    let scores = await computeOverallScores(); 
    if (!scores.ok) {
      socket.emit({type: 'scores-publish', ok: false, error: scores.error}); 
      return; 
    }
    // scores w/o team IDs or teams' individual scores
    let scores_clean = Object.assign({}, scores); 
    // remove individual scores
    scores_clean.data = scores_clean.data.map(input => { 
      return {
        t: input.t.slice(0, 1), 
        tn: input.tn, 
        s: {s: input.s.s},
        i: input.i.map(r => {return {r: r.r}}),
        r: input.r
      }
    }); 
    let ts = new Date(); 
    let curEntry = await scoreDB.findOne({
      published: true
    }); 
    if (curEntry) {
      await scoreDB.updateOne({
        published: true
      }, {
        $set: {
          ts, 
          scores, 
          scores_clean
        }
      }); 
    } else {
      await scoreDB.insertOne({
        ts, 
        scores,
        score_clean, 
        published: true
      }); 
    }
    io.of('secure').emit('update', {type: 'scores-publish', ok: true, ts}); 
  })

  // socket.on('scores-tally', function(r){
  //   tallyScores(r).then(res => {
  //     socket.emit('update', res); 
  //   })
  // })
});

/**
 * Identifies the team the current socket is in, and broadcasts a message to all other members on the team. 
 * @param {object} socket - socket.io instance
 * @param {string} message - message to broadcast
 * @param {object} [payload] - payload to send alongside the message
 */
function teamBroadcast(socket, message, payload={}) {
  if (!socket.handshake.session.user) return false; 
  let teamID = socket.handshake.session.user.TeamID; 
  if (socket.rooms.has(`team-${teamID}`)) { 
    socket.to(`team-${teamID}`).emit(message, payload); 
    payload.sender = true;
    socket.emit(message, payload); 
    return true; 
  }
  else {
    return false; 
  }
}

io.of('/').use(function(socket, next){
  if (socket.handshake.session && (socket.handshake.session.user || socket.handshake.session.host)){ // authorized users only
    logger.info('[std] authenticated: '+socket.id);
    if (socket.handshake.session.user && socket.handshake.session.user.TeamID) {
      socket.join(`team-${socket.handshake.session.user.TeamID}`); 
    }
    socket.join('users'); 
    next(); 
  } else {
    logger.info('[std] rejected: '+socket.id); 
    socket.emit('status', {valid: false}); 
      next(new Error('authentication error'));
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

  socket.on('tn-ping', function(){
    socket.emit('pong'); 
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

app.get('/scores', (req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'public', 'scores.html'))
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
  if(typeof req.body.creds !== 'string'){
    res.status(302).redirect('/?failedLogin'); 
  }
  else{
    if(req.body.creds === process.env.HOST_KEY){
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
    
    let user = lookupUser(req.body.creds); 
    if(!user){
      res.status(302).redirect('/?failedLogin'); 
      return; 
    }
    else{
      req.session.regenerate((err) => {
        if(err) {
          logger.error(err); 
          res.status(302).redirect('/?failedLogin'); 
          return; 
        }
        req.session.user = user; 
        if (req.headers.referer && req.headers.referer.indexOf('continue=scores') !== -1) {
          res.status(302).redirect('/scores'); 
        } else {
          res.status(302).redirect('/contestant'); 
        }
      })
    }
  }
})

// Scoreboard
app.get('/scores/data', async function(req, res) {
  let scores = await scoreDB.findOne({
    published: true
  }); 
  if (!scores) {
    res.status(200).json({
      ok: true, 
      scores: false, 
      team: false
    })
  } else {
    if (req.session.user) {
      let tid = req.session.user.TeamID; 
      try {
        let teamIndex = scores.scores.data.findIndex(r => r.t === tid); 
        if (teamIndex !== -1) {
          let input = scores.scores.data[teamIndex]; 
          input.t = input.t.slice(0, 1); 
          input.hl = true; 
          scores.scores_clean.data.splice(teamIndex, 1, input); 
        } 
        res.status(200).json({
          ok: true, 
          scores: scores.scores_clean, 
          team: req.session.user
        })
      } catch (err) {
        res.status(500).json({
          ok: false, 
          error: err, 
          team: req.session.user
        })
      }
    } else {
      res.status(200).json({
        ok: true, 
        scores: scores.scores_clean, 
        team: false
      })
    }
  }
})

http.listen(port, function () {
  logger.info('Starting server...');
  logger.info('Now listening on localhost:' + port);
});