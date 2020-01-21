const port = process.env.PORT || 8100;

// Init variables and server

const fs = require('fs');
const moment = require('moment');
const express = require('express');
const app = require('express')();
const path = require('path');
const credentials = require(path.join(__dirname, 'secure', 'credentials.json')); // secure credentials

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
    maxAge: 7200000
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
function loadUsers(){
  tabletop.init({
    key: 'https://docs.google.com/spreadsheets/d/1PhWNoPC0itS4ZB0HVV_Y3vEcZFtw3vBEk2OiR0OpjbI/pubhtml', 
    simpleSheet: true
  }).then((dt) => {
    userdb = dt; 
    console.log(userdb); 
  }); 
}
loadUsers(); 

function lookupUser(teamID){
  let out = userdb.filter(obj => {return obj.TeamID === teamID}); 
  if(out.length > 0){
    return out[0]; 
  } else{
    return false; 
  }
}

// End of UserDB
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
        io.in('users').emit('question', {
          type: 'mc', 
          num: 1, 
          options: ['Apple', 'Banana', 'Carrot', 'Dragonfruit', 'Eggplant'], 
          canChange: true
        })
        break; 
      case 'sa': 
        io.in('users').emit('question', {
          type: 'sa', 
          num: 2
        })
        break; 
      case 'sp': 
        io.in('users').emit('question', {
          type: 'sp', 
          url: 'https://docs.google.com/forms/d/e/1FAIpQLSdjHuRngsHN1kXuf-Sq_-c_NdAY09MkEvXmRfCLmmICQkibEg/viewform'
        })
        break; 
    }
  })
});

io.on('connection', function(socket){
  logger.info('[std] connected: '+socket.id);  
  socket.on('login', function(){
    console.log('[std] status for: '+socket.id);
    console.log(socket.handshake.session)
    if(socket.handshake.session.user){
      socket.join('users'); 
      socket.emit('status', {valid: true, user: socket.handshake.session.user}); 
    } else{
      socket.emit('status', {valid: false}); 
    }
  })

  socket.on('chat', function(msg){
    logger.info('chat: ' + msg); 
    io.emit('chat', msg);
  });
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
    else{
      res.status(404).json({success: false, msg: '[404] File not found'}); 
    }
  }
  else{
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