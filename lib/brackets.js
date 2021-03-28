/**
 * bracket.js
 * (C) 2021 Ryan Zhang
 * 
 * Generates a tournament bracket for N teams, and provides the functions needed to write to and read from them. 
 * 
 * Brackets are formed initially in the form of a 3D array using @function generateNewBrackets, nested in the format of [bracket1: [round1: [matchup1: {object}, matchup2...], round2...], bracket2...].
 * @function listRoundMatchups is used to then flatten the array into a database-friendly format. Each object is annotated with the "bracket", "round", and "game" (synonymous to an individual matchup) to identify their would-be location in the 3D array. 
 * @function generateBrackets can then be used to revert a flattened array to a 3D array. That is, wrapping a set of valid data in both of these functions will return exactly what you started with. 
 */

const MONGO = require('mongodb'); 

/**
 * Template to use for initial seeds within brackets. Must be a power of two. 
 * Note that this code has only been tested with size-16 brackets. Bugs may occur when using other sized brackets. 
 */
const BRACKET_BASE = [0, 15, 7, 8, 3, 12, 4, 11, 1, 14, 6, 9, 2, 13, 5, 10];  

/*
let _obj = {
  bye: false, 
  opponent: {
    tid: 'S101', 
    name: 'Team Awesome',
    members: ['Arnold', 'Bob', 'Cat'], 
    image: 'S101.jpg'
  }
}

let _matchFormat = [{
  // name: '1st Place vs 16th Place', 
  // b: 1, // bracket number (if multiple brackets )
  t1: 0, // first team (0-indexed)
  t2: 0, // second team (0-indexed)
  t1s: false, // score of first team
  t2s: false, // score of second team
  w: 19, // winning team: which position to go to next 
  l: 39, // losing team: which position to go to next
  // ofs: 1 // offset (when rendering the bracket)
}] 
*/

/**
 * Wrapper for emitting a socket.io message to future-proof library in case it needs to change in the future
 * @param {object} io - io object
 * @param {string} tid - team ID
 * @param {*} data - data to send
 * @returns {object}
 */
function _emitToTeam(io, tid, event, data) {
  return io.to(`team-${tid}`).emit(event, data); 
}

/**
 * Given a team position in a single bracket, calculates the equivalent team position for n brackets
 * i.e., 1 v 16 w/ five brackets would become 1 v 80
 * @param {number} inp - team position 
 * @param {number} bracket - which bracket this is for, 1 being the first
 * @param {number} total - total number of brackets
 * @returns {number} modified input
 */
function _multBase(inp, bracket, total, bracketSize=BRACKET_BASE.length) {
  let basePos = inp * total; // multiply position by # of brackets so there's enough slots
  basePos += total - 1; // adjust for 0-indexing (so that this(0, 1, n) outputs 0 and not a negative value)
  if (inp >= bracketSize / 2) {
    basePos -= (bracket-1); 
  } else {
    basePos -= (total - bracket); 
  }
  return basePos; 
}

/**
 * Using the base setup (@var BRACKET_BASE), build a full bracket setup 
 * @param {number} num - how many brackets to generate 
 * @param {boolean} [[blank=false] - whether to create a blank bracket or one with initial matches already populated (default)
 */
function generateNewBrackets(num, blank=false) {
  let initial = []; // Matchups for the initial round
  let size = BRACKET_BASE.length; // How many teams there are
  let rounds = Math.log2(size); // How many rounds are needed to rank everyone
  if (rounds !== Math.round(rounds)) {
    throw `AssertionError: Cannot create brackets for ${size}-size competitions`
  }
  // Generate intial brackets  
  for (let i = 0; i < num; i++) {
    initial[i] = []; 
    for (let pos = 0; pos < size; pos += 2) {
      // Determine where each team will go next
      let nextWin = Math.floor(pos/4), index = ((pos / 2) % 2); 
      // If blank=true, build the bracket w/o calculating initial seed
      if (blank) {
        initial[i].push({
          w: [nextWin, index], 
          l: [nextWin + Math.floor(size/4), index]
        }); 
        continue; 
      }
      // Determine which teams are competing against each other
      let t1 = BRACKET_BASE[pos], t2 = BRACKET_BASE[pos+1]; 
      t1 = _multBase(t1, i+1, num); 
      t2 = _multBase(t2, i+1, num); 
      // Push first round into the correct bracket
      initial[i].push({
        // t1, 
        // t2,
        seeds: [t1, t2], 
        scores: [0, 0], 
        w: [nextWin, index], 
        l: [nextWin + Math.floor(size/4), index] 
      }); 
    }
  }
  let fullOutput = []; 
  // return initial; 
  for (let i of initial) {
    let bracketOutput = [i]; 
    let totalGames = i.length; // how many games are run simultaneously 
    // Start from the first round (0-indexed), and programmatically assign w/l for the next rounds 
    for (let curRound = 1; curRound < rounds; curRound++) {
      bracketOutput[curRound] = []; // Initialize empty array
      let gamesPerSplit = totalGames / Math.pow(2, curRound); 
      for (let game = 0; game < totalGames; game++) {
        let base = gamesPerSplit * Math.floor(game / gamesPerSplit); 
        let mod =  Math.floor((game % gamesPerSplit) / 2);
        let index = (game % 2); // Which position to seed into  
        if (gamesPerSplit !== 1) {
          // More games to be played
          bracketOutput[curRound][game] = {
            seeds: [-1, -1], 
            w: [base + mod, index], 
            l: [base + mod + gamesPerSplit/2, index] 
          }
        } else {
          // No more games to be played
          bracketOutput[curRound][game] = {
            seeds: [-1, -1], 
            wp: game*2, // Winnning position / "rank"
            lp: game*2+1 // Losing position / "rank"
          }
        }
      }
      // console.log(curRound); 
    }
    fullOutput.push(bracketOutput); 
  }
  return fullOutput; 
}

/**
 * From a set of games, build a bracket
 * @param {number} num - how many brackets exist
 * @param {*} data - 1D data pulled from @function listRoundMatchups and/or MongoDB
 */
function generateBrackets(num, data) {
  // Fetch an empty template to fill the data in
  let emptyTemplate = generateNewBrackets(num); 
  for (let match of data) {
    // Copy data from 1D array into our 3D array
    if (match.bracket && match.index) {
      let target = emptyTemplate[match.bracket][match.round][match.index]; 
      Object.assign(target, match); 
      delete target.bracket; 
      delete target.round; 
      delete target.index; 
      delete target.game; 
    }
  }
  return emptyTemplate; 
}

/**
 * Flattens a multi-dimention bracket system into a one-dimensional list of matches (for a given round). 
 * @param {array} brackets - all brackets, from @function generateBrackets
 * @returns {array} 
 */
function listRoundMatchups(brackets) {
  let out = []; 
  let game = 0; 
  for (let i = 0; i < brackets.length; i++) {
    let bracket = brackets[i]; 
    for (let round = 0; round < bracket.length; round ++) {
      let matches = bracket[round]; 
      if (!matches) {
        continue; 
      }
      for (let j = 0; j < matches.length; j++) {
        let match = matches[j]; 
        let data = {
          round, 
          game, 
          bracket: i, 
          index: j,
          seeds: match.seeds, 
          scores: match.scores
        }; 
        if (typeof match.w !== 'undefined') {
          data.w = match.w; 
          data.l = match.l; 
        } else if (typeof match.wp !== 'undefined') {
          data.wp = match.wp; 
          data.lp = match.lp; 
        }
        out.push(data); 
        game ++; 
      }
    }
  }
  return out; 
}

/**
 * 
 * @param {object} io - socket.io instance to use
 * @param {array} teams - list of all teams from metadata object
 * @param {array} matchups - list of all matchups to send out
 * @param {object} [inputData={}] - input data to include to ALL messages
 */
function broadcastMatchups(io, teams, matchups, inputData) {
  let count = 0; // how many messages were sent
  for (let match of matchups) {
    // Send a broadcast to each team
    for (let i = 0; i < match.seeds.length; i++) {
      let seed = match.seeds[i]; 
      if (seed === -1) {
        continue;
      }
      let team = teams[seed]; 
      let data = Object.assign({}, inputData); 
      if (match.seeds.length === 2) {
        let opponent = match.seeds[(i+1)%2]; 
        if (opponent === -1) {
          data.opponent = {bye: true}
        } else {
          data.opponent = teams[opponent]; 
        }
      } else {
        data.opponents = match.seeds.length - 1; 
      }
      _emitToTeam(io, team.t, 'brackets-newMatch', data); 
      // io.to(`team-${team.t}`).emit(`brackets-newMatch`, data); 
      count ++; 
    }
  }
  return count; 
}

/**
 * Updates matchup scores as well as emit scoring update (if io is provided)
 * @param {object} [io=false]  
 * @param {object} db - mongodb connection object
 * @param {*} scores - object w/ team ids as keys (from question.scores)
 */
async function updateScores(io, db, round, scores) {
  let keys = Object.keys(scores); 
  while (keys.length > 0) {
    let tid = keys[0]; 
    keys.shift(); // remove TID
    let matchData = await findMatch(db, {
      tid, 
      round
    }); 
    if (!matchData) {
      console.log(`[brackets-server] updateScore missing match for tid ${tid}`); 
      continue; 
    }
    let match = matchData.match; 
    let teamIndex = match.seeds[0] === tid ? 0 : 1; 
    // if (match.scores[teamIndex] === -1) {
    //   match.scores[teamIndex] = 0; 
    // }
    match.scores[teamIndex] += scores[tid]; 

    if (matchData.opponent) {
      if (typeof scores[matchData.opponent.t] !== 'undefined') {
        // if (match.scores[teamIndex ? 0 : 1] === -1) {
        //   match.scores[teamIndex ? 0 : 1] = 0; 
        // }
        match.scores[teamIndex ? 0 : 1] += scores[matchData.opponent.t]; 
        keys.splice(keys.indexOf(matchData.opponent.t), 1); // Remove opponent TID to prevent duplicate
      } else {
        scores[matchData.opponent.t] = 0; 
      }
      if (io) {
        // Send score update to opponent team
        _emitToTeam(io, matchData.opponent.t, 'brackets-msg', {
          type: 'scoreUpdate', 
          teamScore: [scores[matchData.opponent.t], match.scores[teamIndex ? 0 : 1]], 
          opponentScore: [scores[tid], match.scores[teamIndex]]
        }); 
      }
    }

    if (io) {
      // Send score update to team
      _emitToTeam(io, tid, 'brackets-msg', {
        type: 'scoreUpdate', 
        teamScore: [scores[tid], match.scores[teamIndex]], 
        opponentScore: [scores[matchData.opponent.t], match.scores[teamIndex ? 0 : 1]]
      }); 
    }

    db.updateOne({
      _id: new MONGO.ObjectID(match._id)
    }, {
      $set: match
    }); 
    console.log(`[brackets] updateScores called ran for TID ${tid}`);
  }
  return {ok: true}
}

/**
 * Given a team ID and round number, finds and returns the corresponding game
 * @param {object} db - mongodb connection object
 * @param {object} params - {tid: (string), round: (number)}
  */
async function findMatch(db, params) {
  let {tid, round} = params; 
  let metadata = await db.findOne({
    _md: true
  }); 
  if (!metadata) {
    return {ok: false, msg: `Unable to find metadata object (_md)`}
  }
  let seedNum = metadata.seeds.findIndex(obj => obj.t === tid);
  // console.log('tid/sn: ', tid, seedNum); 
  let match = await db.findOne({
    round, 
    seeds: seedNum
  }); 
  if (!match) {
    return {ok: false, msg: `Failed to find match object (tid: ${tid})`}
  }

  let opponentSeedNum = match.seeds[0] === seedNum ? match.seeds[1] : match.seeds[0]; 
  return {
    ok: true, 
    match, 
    team: metadata.seeds[seedNum], 
    opponent: metadata.seeds[opponentSeedNum] ? metadata.seeds[opponentSeedNum] : false
  }
}

/**
 * 
 * @param {object} io - socket.io instance to use
 * @param {object} db - mongodb connection object
 * @param {object} params - {tid: (string), round: (number) OR tid: (string), otid: (string)} where otid represents oppenent team ID
 * @param {object} message - what message to route
 * @returns {object} {ok: (boolean), msg: (string)}
 */
async function routeMessage(io, db, params, message) {
  let opponentTID = false; // false if opponent doesn't exist, otherwise string representing oppenent TID
  if (typeof params.otid !== 'undefined') {
    if (params.otid) {
      opponentTID = params.otid; 
    }
  } else {
    let matchData = await findMatch(db, params); 
    if (matchData.opponent) {
      opponentTID = matchData.opponent.t; 
    }
  }
  
  let {tid} = params; 
  // io.to(`team-${tid}`).emit(`brackets-msg`, Object.assign({fromTeam: true}, message)); 
  _emitToTeam(io, tid, 'brackets-msg', Object.assign({fromTeam: true}, message)); 
  
  if (!opponentTID) {
    // Bye round (opponent does not exist)
    return {ok: true}; 
  }
  // let opponentTID = metadata.seeds[opponentSeedNum].t; 
  // let opponentTID = matchData.opponent.t; 
  // io.to(`team-${opponentTID}`).emit(`brackets-msg`, Object.assign({fromTeam: false}, message)); 
  _emitToTeam(io, opponentTID, 'brackets-msg', Object.assign({fromTeam: false}, message)); 
  return {ok: true}; 
}

module.exports = {
  generateNewBrackets, 
  generateBrackets, 
  listRoundMatchups, 
  broadcastMatchups, 
  findMatch, 
  routeMessage, 
  updateScores, 
  appHook: function(req, res, next) {
    // console.log(req); 
    next(); 
  }
}
// console.log(generateBrackets(5))