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
// let scoring = {
//   countedRounds: process.env.OT_SCORING_ROUNDS.split(',').map(r => parseInt(r)), 
//   // roundMultiplier: process.env.OT_SCORING_MULT?process.env.OT_SCORING_MULT.split(',').map(r => parseFloat(r)):process.env.SCORING_ROUNDS.split(',').fill(1)
// }

const levenshtein = require('js-levenshtein');
const tabletop = require('tabletop');
const session = require('express-session');
const sharedsession = require("express-socket.io-session");
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

const scoring = require('./lib/scoring.js');
const scoringPolicy = require('./lib/scoringPolicy.json');
const brackets = require('./lib/brackets.js');
app.use('/brackets/*', brackets.appHook); 

let bracketSet = brackets.generateNewBrackets(5); 
app.get('/brackets/data', (req, res) => {
  res.json(bracketSet); 
})
app.get('/brackets/data/matches', (req, res) => {
  res.json(brackets.listRoundMatchups(bracketSet)); 
})
app.get('/brackets/data/test', (req, res) => {
  res.json(brackets.generateBrackets(5, brackets.listRoundMatchups(bracketSet))); 
})

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
    totalTeams = dt.length; 
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

let scoreDB, bracketDB; 
function saveScores(roundNum, questionNum, data, tb){
  let dt = {d: data}
    if(tb) dt.tb = tb; 
  scoreDB.findOne({
    r: roundNum,
    q: questionNum
  }).then(r => {
    if(r){
      scoreDB.updateOne({
        r: roundNum, 
        q: questionNum
      }, {
        $set: dt
      }).then(() => {
        logger.info(`[Scores] Updated: R${roundNum} Q${questionNum}`);
      })
    } else{
      dt.r = roundNum; 
      dt.q = questionNum; 
      scoreDB.insertOne(dt).then(() => {
        logger.info(`[Scores] Saved: R${roundNum} Q${questionNum}`);
      })
    }
  }); 

  if (round.brackets.active) {
    brackets.updateScores(io, mdb.collection('brackets'), round.brackets.round, question.scores); 
  }
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
      if(i.d[j] > 0){
        if(out[j].s){
          out[j].s += i.d[j]; // score
          out[j].c ++; // number correct
        } else{
          out[j].s = i.d[j]; 
          out[j].c = 1; 
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
    if (i > 0 && out[i-1].s.s === out[i].s.s && out[i-1].s.tb === out[i].s.tb) {
      out[i].r = out[i-1].r; // in the event of a tie
      continue; 
    }
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
 * @param {boolean} showAllInfo - whether to also list members and team IDs
 * @returns {object} {ok: (boolean), data: (array)}
 */
async function computeOverallScores(input, showAllInfo=true){
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
          let scoreRaw = selTeam.s.s ? selTeam.s.s : 0; 
          let numCorrect = selTeam.s.c ? selTeam.s.c : 0; 
          let multiplier = scoring.getMultiplier(roundNum); 
          points += scoreRaw * multiplier; 
          correct += numCorrect; 
          tb += (selTeam.s.tb ? selTeam.s.tb : 0);
          indiv.push({
            s: Math.round(scoreRaw * multiplier), 
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
        t: showAllInfo ? team : team.slice(0, 1), 
        tn: userdb.find(r => r.TeamID === team).TeamName, 
        ...(showAllInfo && {tm: userdb.find(r => r.TeamID === team).Members}),
        s: { // scores
          c: correct,
          s: Math.round(100*points)/100, 
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
// Messages

let currentMessage = {
  title: 'Welcome!', 
  body: `We'll begin the competition shortly.`
}; 

let currentTopScores = {
  title: '', 
  scores: {}
}

let round = {
  background: {
    slides: 'nature.jpg', 
    users: 'bk.jpg'
  }, 
  brackets: {
    active: false
  }, 
}; 

let totalTeams = 0; 

// End of messages
// Question management

/**
 * The question object stores all the information about the current question being presented. Scalable? Absolutely not. However, it works well for what it's used for (running one game on one server w/o any load balancing), so it's being kept like this. 
 * Each key is commented with what that key represents/does. 
 * 
 * Information on Custom (Negative) Question Indexes
 * - Negative question indexes represent special states
 * - Here's a list of them and what they mean: 
 * 
 * -1 (default): Announcement
 * -2: Top Teams (but scoreboard not published yet)
 * -3: Top Teams (and scoreboard is published)
 */
let question = {
  active: false, // whether answers can be submitted or not
  canChangeAnswer: true, // whether teams can change their answer after their initial submission or not
  timer: {
    interval: null, // value returned by setInterval function so that it can be cleared if needed
    end: 0 // what time (js timestamp) that the question's timer will hit zero
  }, 
  current: {}, // current question taken from array
  curIndex: -1, // index of question in array
  numAnswered: 0, // only used on buzzer ("BZ") rounds to determine scoring
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

/**
 * Fetches information on the current active question. 
 * @param {boolean} full - 1 to include all question data, 0 to only include question data presented to contestants
 * @returns {object} question
 */
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
      if (obj.answer.length > 1) {
        out.selectMultiple = true; 
      }
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

/**
 * Maps a raw question entry (from a row in Sheets) to one that follows camel case.
 * 
 * Is this good code? No. Was it easier to do this than to redo the Google Sheets that was all set up? Yes. 
 * Plus, this function can be easily edited to accomodate different types column names in your own spreadsheet. 
 * @param {object} inp - input object
 * @returns {object} formatted question object
 */
function mapQuestionEntry(inp){
  return {
    round: inp.Round, // (string)
    num: parseInt(inp.Q), 
    type: inp.Type, 
    timed: inp.Timed === 'TRUE' ? true : false, 
    instantFeedback: inp.InstantFeedback === 'TRUE' ? true : false, 
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

/**
 * Loads a new question and broadcasts it to everyone. 
 * @param {number} index - index of question in array of questions to load
 * @param {object} socket - socket.io object of sender
 * @returns {undefined}
 */
function loadQuestion(index, socket){
  stopTimer(); // if currently active
  if (!questiondb[index]) {
    socket.emit('update', {type: 'question', msg: `Question index ${index} does not exist`}); 
    return; 
  }

  question.firstCorrectTaken = false; // SA only - first correct answer is announced to everyone
  question.active = true; 
  question.current = mapQuestionEntry(questiondb[index]);
  question.curIndex = index; 
  question.timestamp = Date.now(); 
  question.numAnswered = 0; 

  // Clear scores
  question.scores = {}; 
  question.tb = {}; 
  question.selections = {}; 

  io.emit('question', getCurrentQuestion()); 
  io.of('secure').emit('question-full', getCurrentQuestion(1)); 

  if (getCurrentQuestion().type === 'bz') {
    startTimer(60); 
  }
}

/**
 * Adds an ordinal suffix to a number. Used for buzzer questions.
 * @param {number} n - number to add an ordinal to
 */
function getNumberWithOrdinal(n) {
  var s = ["th", "st", "nd", "rd"],
      v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Calculates 
 * @param {string} tid - Team ID, used during bracket rounds to see if the team answered first
 */
async function calcPoints(tid) {
  if (round.brackets) {
    // 10 points for first to answer correctly, 4 points for second to answer correctly
    let matchData = await brackets.findMatch(mdb.collection('brackets'), {
      tid, 
      round: round.brackets.round
    }); 
    if (matchData.opponent) {
      let opponentTID = matchData.opponent.t; 
      if (question.scores[opponentTID] === 10) {
        return 4; 
      }
    }
    return 10; 
  }
  return 10; 
}

/**
 * Processes a contestant's answer by scoring it and sending feedback
 * @param {object} team - team object from client session
 * @param {*} submission - the answer a contestant selected
 * @param {*} socket - the socket.io instance of the contestant
 */
async function processAnswer(team, submission, socket){
  // Validate that a question is active and the submission is readable before processing the answer
  if(!question.active){
    socket.emit('answer-ack', {ok: false, msg: 'Question not active'})
    return; 
  } else if (typeof submission !== 'string' || !team.TeamID){
    socket.emit('answer-ack', {ok: false, msg: 'No answer provided'})
    // logger.warn('Unable to process answer: Missing data'); 
    // io.of('secure').emit('update', 'processAnswer error: missing required data'); 
    return; 
  } 

  // Process the answer
  let q = getCurrentQuestion(1), tid = team.TeamID; 
  let canChangeAnswer = question.canChangeAnswer || q.timed; // if timed=true, teams can always change their answer (due to its design)

  // Make sure it's not an answer change if answer changes are disabled
  if (!canChangeAnswer && typeof question.scores[tid] !== 'undefined') {
    socket.emit('answer-ack', {ok: false, msg: 'Answer already submitted, cannot change'}); 
    return; 
  }
  let firstSubmission = (typeof question.scores[tid] === 'undefined'); 

  // Score and process the answer
  let {valid, correct, msg} = scoring.isCorrect(submission, q); 
  if (valid) {
    question.selections[tid] = submission; 
  } else {
    socket.emit('answer-ack', {ok: false, msg: 'Invalid/malformed answer. Try reloading the page.'})
  }

  let response = {
    ok: true, 
    selected: submission, 
    canChangeAnswer, 
    firstSubmission
  }

  if (correct) {
    question.scores[tid] = await calcPoints(tid); 
    console.log('gave score: ', question.scores[tid])
  } else {
    question.scores[tid] = 0; 
  }

  if (q.instantFeedback || q.timed) {
    response.correct = correct; 
  } 
  
  if (q.timed) {
    if (correct) {
      let tb = tbCalc(); 
      question.tb[tid] = tb; 
      Object.assign(response, {
        time: Date.now() - question.timestamp, 
        tb
      });

      // Announce which team got the correct answer first on the slides
      if (!question.firstCorrectTaken) {
        question.firstCorrectTaken = true; 
        let user = socket.handshake.session.user; 
        io.of('/secure').emit('answer-firstCorrect', user.name?`${user.name} from ${user.TeamName}` : user.TeamName); 
      }
    }
    if (msg) {
      response.message = msg; 
    }
    teamBroadcast(socket, 'answer-time', response);
  } else {
    teamBroadcast(socket, 'answer-ack', response);
  }

  return {
    ok: true, 
    correct
  }; 
  if(typeof submission !== 'string' || !team.TeamID){
    socket.emit('answer-ack', {ok: false, msg: 'No answer provided'})
    logger.warn('Unable to process answer: Missing data'); 
    io.of('secure').emit('update', 'processAnswer error: missing required data'); 
    return false;
  }
  else if(!q.answer || q.type === 'md'){
    if (q.type === 'md') { // "are you ready" screen
      if (submission.toLowerCase() === 'r') {
        question.scores[tid] = 1; 
        question.selections[tid] = 'r'; 
        teamBroadcast(socket, 'answer-ack', {ok: true, selected: 'r'});
        return true; 
      }
      return false; 
    }
    logger.warn('Unable to process answer: No question selected'); 
    socket.emit('answer-ack', {ok: false, msg: 'No question active'})
    io.of('secure').emit('update', `processAnswer error: no question selected server-side [${tid}]`); 
    return false;
  }
  if(q.type === 'mc'){
    if (['a', 'b', 'c', 'd', 'e'].indexOf(submission.toLowerCase()) === -1) {
      socket.emit('answer-ack', {ok: false, msg: 'Invalid multiple choice option'})
      io.of('secure').emit('update', `processAnswer error: invalid MC option (${submission.toLowerCase()}) [${tid}]`); 
      return; 
    }
    question.selections[tid] = submission.toLowerCase(); 
    teamBroadcast(socket, 'answer-ack', {ok: true, selected: submission.toLowerCase()});
    if(submission.toLowerCase() === q.answer.toLowerCase()){
      question.scores[tid] = 1; 
      return true; 
    } else{
      question.scores[tid] = 0; 
      return false; 
    }
  } else if(q.type === 'sa' || q.type === 'bz'){
    question.selections[tid] = submission; 
    submission = submission.toLowerCase().trim(); 
    let cor = q.answer.toLowerCase().trim(); // correct answer
    if(!q.timed) {
        socket.emit('answer-ack', {ok: true})}
    else if (question.scores[tid] > 0) { // already answered
      socket.emit('answer-time', {correct: true, answer: q.answer}); 
      return true; 
    }

    if(parseFloat(cor).toString() === cor) { // numerical answer
      let input = parseFloat(submission.replace(/,/g, '')), actual = parseFloat(cor); 
      if (input === actual) {
        sentAck = true; 
        if (q.timed) {
          teamBroadcast(socket, 'answer-time', {time: Date.now() - question.timestamp, correct: true, tb: tbCalc(), answer: q.answer}); 
          question.tb[tid] = tbCalc(); 

          if (!question.firstCorrectTaken) {
            question.firstCorrectTaken = true; 
            let user = socket.handshake.session.user; 
            io.of('/secure').emit('answer-firstCorrect', user.name?`${user.name} from ${user.TeamName}` : user.TeamName); 
          }
        }
        question.scores[tid] = 1;
        return true; 
      } 
      sentAck = true; 
      question.scores[tid] = 0;
      if (input < actual) {
        socket.emit('answer-time', {time: Date.now() - question.timestamp, correct: false, message: 'too low'}); 
      } else if (input > actual) {
        socket.emit('answer-time', {time: Date.now() - question.timestamp, correct: false, message: 'too high'}); 
      } else {
        socket.emit('answer-time', {time: Date.now() - question.timestamp, correct: false, message: 'should be a number'}); 
      }
    } else {
      if(submission.slice(0, 1) !== cor.slice(0, 1)){ // non-numerical answer
        question.scores[tid] = 0; // first letter must match
        sentAck = true; 
        socket.emit('answer-time', {time: Date.now() - question.timestamp, correct: false}); 
        return false; 
      } else if(levenshtein(submission, cor) < 3  || levenshtein(submission, cor) === 3 && cor.length > 11){
        sentAck = true; 
        if (q.type === 'bz') {
          question.scores[tid] = Math.max(Math.round(100*(1-0.065*Math.pow(question.numAnswered, 0.8)))/100, 0.25); // where question.numAnswered is the number of teams who correctly answered before your team
          question.numAnswered ++; 

          // let mult = scoring.roundMultiplier[scoring.countedRounds.indexOf(parseInt(q.round))]; 

          teamBroadcast(socket, 'answer-time', {time: Date.now() - question.timestamp, correct: true, answer: q.answer}); 
          teamBroadcast(socket, 'answer-buzzer', {
            message: `Your team was ${getNumberWithOrdinal(question.numAnswered)} to answer correctly${question.numAnswered > 5 ? '.':'!'}`, 
            points: question.scores[tid]
          }); 
          // teamBroadcast(socket, 'answer-buzzer', {
          //   message: `Your team was ${getNumberWithOrdinal(question.numAnswered)} to answer correctly${question.numAnswered > 5 ? '.':'!'}`, 
          //   points: mult ? Math.round(mult*question.scores[tid]) : question.scores[tid]
          // }); 

          if (!question.firstCorrectTaken) {
            question.firstCorrectTaken = true; 
            let user = socket.handshake.session.user; 
            io.of('/secure').emit('answer-firstCorrect', user.name?`${user.name} from ${user.TeamName}` : user.TeamName); 
          }

          if (!question.timer.interval || question.timer.end > Date.now() + 10000) {
            startTimer(10); 
          }
        } else {
          question.scores[tid] = 1;
          if (q.timed) {
            teamBroadcast(socket, 'answer-time', {time: Date.now() - question.timestamp, correct: true, tb: tbCalc(), answer: q.answer}); 
            question.tb[tid] = tbCalc(); 

            if (!question.firstCorrectTaken) {
              question.firstCorrectTaken = true; 
              let user = socket.handshake.session.user; 
              io.of('/secure').emit('answer-firstCorrect', user.name?`${user.name} from ${user.TeamName}` : user.TeamName); 
            }
          }
        }
        return true; 
      } else{
        question.scores[tid] = 0;
        sentAck = true; 
        if (q.timed) {
          socket.emit('answer-time', {time: Date.now() - question.timestamp, correct: false}); 
        }
        return false; 
      }
    }

  }
  if(!sentAck){
    socket.emit('answer-ack', {ok: false, msg: `We couldn't understand your answer. Please contact a dev.`})}
}

function emitAnswerUpdate(){
  io.of('secure').emit('answer-update', {
    attempted: Object.keys(question.scores).length, 
    correct: Object.values(question.scores).filter(r => r>0).length, 
    total: totalTeams
  });  
}

function getAnswerStats(){
  if(question.current.type === 'MC'){
    let resp = Object.values(question.selections);
    let t = resp.length; 
    if (question.current.answer.length === 1) {
      return {
        type: 'mc', 
        ans: question.current.answer.toLowerCase(), 
        correct: Object.values(question.scores).filter(r => r>=1).length, 
        total: Object.values(question.scores).length, 
        a: Math.round(resp.filter(i => i=='a').length/t*1000)/1000, 
        b: Math.round(resp.filter(i => i=='b').length/t*1000)/1000, 
        c: Math.round(resp.filter(i => i=='c').length/t*1000)/1000, 
        d: Math.round(resp.filter(i => i=='d').length/t*1000)/1000, 
        e: Math.round(resp.filter(i => i=='e').length/t*1000)/1000, 
        scoresSaved: question.scoresSaved
      }
    } else {
      return {
        type: 'mc', 
        ans: question.current.answer.toLowerCase(), 
        correct: Object.values(question.scores).filter(r => r>=1).length, 
        total: Object.values(question.scores).length, 
        a: Math.round(resp.filter(i => i.indexOf('a')!==-1).length/t*1000)/1000, 
        b: Math.round(resp.filter(i => i.indexOf('b')!==-1).length/t*1000)/1000, 
        c: Math.round(resp.filter(i => i.indexOf('c')!==-1).length/t*1000)/1000, 
        d: Math.round(resp.filter(i => i.indexOf('d')!==-1).length/t*1000)/1000, 
        e: Math.round(resp.filter(i => i.indexOf('e')!==-1).length/t*1000)/1000, 
        scoresSaved: question.scoresSaved
      }
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
      question.timer.interval = false; 
      question.active = false; 
      io.emit('stop'); 
    }
  }, 1000); 
  io.emit('timer', s); 
}

function stopTimer(){
  if (question.timer.interval) {
    clearInterval(question.timer.interval); 
    question.timer.interval = false; 
    io.emit('timer', -1); 
  }
}

// End question management
// Socket.io

const nsp = io.of('/secure');
nsp.use(sharedsession(session(sess))).use(function(socket, next){
  if (socket.handshake.session && socket.handshake.session.host){ // hosts only!
    logger.debug('[sec] authenticated: '+socket.id)
    next(); 
  } else {
    logger.debug('[sec] rejected: '+socket.id)
      next(new Error('authentication error'));
  }    
}).on('connection', function(socket){
  logger.debug('[sec] connected: '+socket.id);

  socket.on('action-nextQuestion', () => {
    loadQuestion(question.curIndex + 1, socket); 
  }); 

  socket.on('status', function(){
    socket.emit('config-bk', round.background.slides); 
    if(question.curIndex > -1){
      socket.emit('question-full', getCurrentQuestion(1)); 
    } else {
      switch (question.curIndex){
        case -1: 
          socket.emit('announcement', currentMessage); 
          break; 
        case -2: 
        case -3: 
          socket.emit('scores', currentTopScores); 
          break;
      }
    }
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
        case 'bz': 
          startTimer(60); 
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

  socket.on('show-answer', function(shouldSaveScores){
    if(!question.current || !question.current.answer){
      io.of('secure').emit('update', 'processAnswer error: no question selected server-side'); 
      return; 
    }
    if(question.active){
      io.emit('stop'); // stop accepting answers in case it wasn't already turned off
      question.active = false; 
    }
    if (shouldSaveScores) {
      question.scoresSaved = true; 
      let r = parseInt(getCurrentQuestion(true).round), n = parseInt(getCurrentQuestion(true).num); 
      if(scoring.countedRounds.indexOf(r) !== -1){
        socket.emit('update-scores', `Scores saved for R${r} Q${n}`);
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
      socket.emit('update-scores', `Scores saved for R${r} Q${n}`);
    } else{
      socket.emit('update', `Round (R${r}) not counted; no scores saved`);
    }
  })

  socket.on('scores-compute', function(r){
    computeOverallScores(r?r:false, true).then(res => {
      socket.emit('scores-host', res); 
      // console.log(res); 
    })
  })

  socket.on('scores-publish', async function(v){
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
        scores_clean, 
        published: true
      }); 
    }
    io.of('secure').emit('update', {type: 'scores-publish', ok: true, ts}); 
    if (v === 1 && question.curIndex === -2) {
      question.curIndex = -3; 
      io.to('users').emit('scores-release');
      io.of('/secure').emit('scores-release');
    }
  })

  socket.on('announce', function(msg) {
    question.curIndex = -1; 
    currentMessage.title = msg.title; 
    currentMessage.body = msg.body; 
    if (question.active) question.active = false; 
    io.to('users').emit('announcement', currentMessage); 
    io.of('/secure').emit('announcement', currentMessage); 
  })

  socket.on('scores-slides', async function(round, hidePts) {
    let scores = round ? await computeOverallScores(round) : await computeOverallScores(); 
    currentTopScores = {
      title: round?`Round ${round}`:'Overall', 
      scores, 
      hidePts
    }
    question.curIndex = -2; 
    if (question.active) question.active = false; 
    currentMessage = {
      title: 'Scores', 
      body: 'Top teams are currently being broadcasted. Please check the main presentation/video to see them.'
    }
    io.emit('announcement', currentMessage); 
    io.of('secure').emit('scores', currentTopScores); 
  })

  socket.on('adm-listImages', async function(){
    let userImages = await fs.promises.readdir(path.join(__dirname, 'public', 'images')); 
    let hostImages = await fs.promises.readdir(path.join(__dirname, 'host', 'images')); 
    socket.emit('adm-images', {userImages, hostImages}); 
  })

  socket.on('adm-setBK', function(type, image){
    if (type === 1) {
      round.background.users = image; 
      io.to('users').emit('config', round); 
    } else if (type === 2) {
      round.background.slides = image; 
      io.of('/secure').emit('config-bk', image); 
    }
  })

  socket.on('adm-getSockets', async function(){
    let sockets = io.of('/').in('users').sockets; 
    let hostSockets = io.of('/secure').sockets; 
    // console.log(io.of('/').in('users').sockets);

    let userCount = sockets.size;

    let userList = []; 
    sockets.forEach((s) => { // where s = socket
      if (s.handshake.session.user) {
        userList.push({
          id: s.id, 
          team: s.handshake.session.user.TeamID, 
          teamName: s.handshake.session.user.TeamName, 
          name: s.handshake.session.user.name, 
          connected: s.connected, 
          ac: (s.handshake.session.ac && s.handshake.session.ac.ans) ? s.handshake.session.ac.ans : false
        })
      } else {
        if (s.handshake.session.host) {
          userCount --; 
          return; 
        }
        userList.push({
          id: s.id, 
          team: null, 
          name: '(Unknown)', 
          connected: s.connected
        })
      }
    })

    socket.emit('adm-sockets', {userCount, hostCount: hostSockets.size, socketList: userList}); 
  }); 

  socket.on('adm-setTeamCount', n => {
    if (typeof n !== 'number') {
      socket.emit('update', 'adm-setTeamCount failed: invalid parameter'); 
    } else {
      totalTeams = n; 
      socket.emit('update', 'adm-setTeamCount success'); 
    }
  })

  socket.on('adm-refreshSheets', () => {
    loadSheets(); 
    socket.emit('update', `Sheets reloaded. CAUTION: May cause system instability.`); 
  })

  socket.on('adm-initBrackets', async () => {
    let numToCreate = 3; 
    await mdb.collection('brackets').drop(); 
    let newBrackets = brackets.generateNewBrackets(numToCreate); 
    let seeds = await computeOverallScores('1'); 
    // Insert the initial metadata document
    await mdb.collection('brackets').insertOne({
      _md: true, 
      numBrackets: numToCreate, 
      numRounds: 4, 
      seeds: seeds.data.map(r => {return {t: r.t, tn: r.tn, tm: r.tm, r: r.r}})
    }); 
    await mdb.collection('brackets').insertMany(brackets.listRoundMatchups(newBrackets)); 
    socket.emit('update', 'Brackets created.')
  }); 

  socket.on('adm-startBracketRound', async (roundNum=0) => {
    let metadata = await mdb.collection('brackets').findOne({
      _md: true
    }); 
    if (!metadata) {
      socket.emit('update', 'Brackets: Missing bracket metadata, cancelled.'); 
      return; 
    }
    round.brackets = {
      active: true, 
      round: roundNum, 
      seeds: metadata.seeds
    }
    let matchups = await mdb.collection('brackets').find({
      round: roundNum
    }).toArray(); 
    // Broadcast matchups, offset rounds by 1 so that the first game is "game 1"
    let res = brackets.broadcastMatchups(io, metadata.seeds, matchups, {round: roundNum+1}); 
    socket.emit('update', `Brackets: Multicasted ${matchups.length} matchups to ${metadata.seeds.length} teams (${res} multicasts)`);
  }); 
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
    if (socket.handshake.session.user.name) {
      payload.senderName = socket.handshake.session.user.name; 
    }
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
    logger.debug('[std] authenticated: '+socket.id);
    if (socket.handshake.session.user && socket.handshake.session.user.TeamID) {
      socket.join(`team-${socket.handshake.session.user.TeamID}`); // used to identify all sockets in a specified team ID
    }
    socket.join('users'); 
    next(); 
  } else {
    logger.debug('[std] rejected: '+socket.id); 
    socket.emit('status', {valid: false}); 
      next(new Error('authentication error'));
  }    
}).on('connection', function(socket){
  /**
   * Message sent upon initial socket connection to get current info
   * @param {number} mode - 0/undefined if initial connection, 1 if reconnection
   */
  socket.on('status', function(mode){
    if(socket.handshake.session.user){
      socket.emit('config', round); 

      if (!mode) {
        socket.emit('status', {valid: true, user: socket.handshake.session.user})}

      if(question.curIndex >= 0){
        socket.emit('question', getCurrentQuestion())}
      else {
        switch (question.curIndex) {
          case -1: 
          case -2: 
            socket.emit('announcement', currentMessage); 
            return;
          case -3: 
            socket.emit('scores-release'); 
            return; 
        }
      }

      let sel = question.selections[socket.handshake.session.user.TeamID]; 
      if (sel){
        // send saved answer if applicable
        let {type, answer, timed} = getCurrentQuestion(1);
        if (type === 'mc' || type === 'md') {
          socket.emit('answer-ack', {ok: true, selected: sel, previousAnswer: true, canChangeAnswer: question.canChangeAnswer}); 
        } else if ((type === 'sa' && timed) || type === 'bz') {
          if (question.scores[socket.handshake.session.user.TeamID] > 0) {
            socket.emit('answer-time', {correct: true, answer: answer}); 
          }
        } else if (type === 'sa') {
          socket.emit('answer-ack', {ok: true, selected: sel, previousAnswer: true, canChangeAnswer: question.canChangeAnswer}); 
        }
      }
    } else{
      socket.emit('status', {valid: false}); 
    }
  })

  socket.on('tn-ping', function(){
    socket.emit('pong'); 
  })

  socket.on('disconnect', function(){
    // logger.info('user disconnected');
  });

  socket.on('sec-login', function(){
    if(socket.handshake.session.host){
      logger.debug('[sec] authenticated: '+socket.id); 
      // socket.join('users'); 
      socket.join('hosts'); 
      socket.emit('status', {valid: true}); 
    }
    else{
      socket.emit('status', {valid: false}); 
    }
  });

  socket.on('answer', async function(ans){
    if(socket.handshake.session.user){
      logger.debug('[std] recieved answer: '+ans);  
      if (socket.handshake.session.ac && typeof socket.handshake.session.ac.ret_qi !== 'undefined') {
        if (socket.handshake.session.ac.ret_qi === question.curIndex) {
          let prev = socket.handshake.session.ac.prev[socket.handshake.session.ac.prev.length-1]; 
          if (prev && prev.dur > 5500) {
            socket.handshake.session.ac.ans.push({
              qi: question.curIndex,
              ans, 
              ts: Date.now()
            }); 
            delete socket.handshake.session.ac.ret_qi; 
          }
        }
      }
      let processRes = await processAnswer(socket.handshake.session.user, ans, socket);
      if (round.brackets.active && (!getCurrentQuestion(1).timed || (processRes && processRes.correct))) {
        let bracketMsg = await brackets.routeMessage(io, mdb.collection('brackets'), {
          tid: socket.handshake.session.user.TeamID, 
          round: round.brackets.round
        }, {
          type: 'answerSubmit'
        }); 
        if (!bracketMsg.ok) {
          logger.warn('brackets.routeMessage failed: ' + bracketMsg.msg); 
        }
      }
      emitAnswerUpdate(); 
    } else{
      socket.emit('status', {valid: false});
    }
  });
  
  socket.on('ac-blur', function(){
    if (question.active) {
      if (!socket.handshake.session.ac) {
        socket.handshake.session.ac = {
          prev: [], // previous instances of leaving
          ans: [], // answers after leaving and returning during a question
          cur: false
        }; 
      }
      let ac = socket.handshake.session.ac; 
      if (!ac.cur) {
        ac.cur = {
          qi: question.curIndex, 
          ts: Date.now(), 
          dur: 0
        }
      }
    }
  }); 

  socket.on('ac-focus', function(){
    let ac = socket.handshake.session.ac; 
    if (ac && ac.cur) {
      ac.cur.dur = Date.now() - ac.cur.ts; 
      ac.prev.push(Object.assign({}, ac.cur)); 
      if (question.active && question.curIndex === ac.cur.qi) {
        ac.ret_qi = ac.cur.qi; 
      }
      delete ac.cur; 
    }
  }); 
  
});

// End of Socket.io

app.get('/contestant', (req, res) => {
  if(req.session.user) {
    if (process.env.OT_SKIP_NAMES !== '1' && !req.session.user.name) {
      res.status(302).redirect(`/identity?tn=${encodeURIComponent(req.session.user.TeamName)}`); 
      return; 
    }
    res.status(200).sendFile(path.join(__dirname, 'public', 'contestant.html'))
  } 
  else {
    res.status(302).redirect('/');
  }
})

app.get('/scores', (req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'public', 'scores.html'))
})

app.get('/about', (req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'public', 'about.html'))
})

app.get('/identity', (req, res) => {
  if(req.session.user) {
    res.status(200).sendFile(path.join(__dirname, 'public', 'identity.html'))
  } else {
    res.status(302).redirect('/');
  }
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
          if (process.env.OT_SKIP_NAMES === '1') {
            res.status(302).redirect('/contestant'); 
          } else {
            res.status(302).redirect(`/identity?tn=${encodeURIComponent(user.TeamName)}`); 
          }
        }
      })
    }
  }
})

app.post('/identity', (req, res) => {
  let user = req.session.user; 
  if (!user) {
    res.status(302).redirect('/'); 
  } else if (typeof req.body.name === 'string' && req.body.name.length > 1) {
    if (!req.body.name.match(/^[a-z\.\s]{2,16}$/i)) {
      res.status(302).redirect(`/identity?tn=${encodeURIComponent(user.TeamName)}&err=${encodeURIComponent('Standard letters only.')}`);   
      return; 
    }
    user.name = req.body.name; 
    res.status(302).redirect('/contestant'); 
  } else {
    res.status(302).redirect(`/identity?tn=${encodeURIComponent(user.TeamName)}&err=${encodeURIComponent('Name must be between 2 and 16 characters.')}`); 
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
    if (req.session.host) {
      res.status(200).json({
        ok: true, 
        scores: scores.scores, 
        team: 'Host Account'
      })
    }
    else if (req.session.user) {
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