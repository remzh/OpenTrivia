const port = process.env.PORT || 8100;

// Init variables and server

const fs = require('fs');
const moment = require('moment');
const express = require('express');
const app = require('express')();
const path = require('path');
const credentials = require(path.join(__dirname, 'secure', 'credentials.json')); // secure credentials

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
  cookie: {}
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

app.use(express.static('public')); 

const nsp = io.of('/secure');
nsp.use(function(socket, next){
  if (socket.handshake.query && socket.handshake.query.token){
    if(socket.handshake.query.token === 'potato'){
      next(); 
    } else{
      next(new Error('Authentication error'));
    }
  } else {
      next(new Error('Authentication error'));
  }    
}).on('connection', function(socket){
  console.log('[secure] user connected: '+socket.id);
});

io.on('connection', function(socket){
  console.log('[std] user connected: '+socket.id);  
  socket.on('auth', function(team) {
    socket.handshake.session.team = team;
    socket.handshake.session.save();
  });
  socket.on('status', function(){
    console.log('status for: '+socket.id);
    console.log(socket.handshake.session)
    socket.emit(socket.handshake.session); 
  })
  socket.on('chat', function(msg){
    console.log('chat: ' + msg); 
    io.emit('chat', msg);
  });
  socket.on('disconnect', function(){
    console.log('user disconnected');
  });
});

http.listen(port, function () {
  logger.info('Starting server...');
  logger.info('Now listening on localhost:' + port);
});