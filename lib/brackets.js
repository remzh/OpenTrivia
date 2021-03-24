/**
 * bracket.js
 * (C) 2021 Ryan Zhang
 * 
 * Generates a tournament bracket for N teams
 */


/**
 * Template to use for initial seeds within brackets. Must be a power of two. 
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
      let nextWin = Math.floor(pos/4); 
      // If blank=true, build the bracket w/o calculating initial seed
      if (blank) {
        initial[i].push({
          w: nextWin, 
          l: nextWin + Math.floor(size/4)
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
        scores: [-1, -1], 
        w: nextWin, 
        l: nextWin + Math.floor(size/4)
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
      bracketOutput[curRound] = []; // initialize empty array
      let gamesPerSplit = totalGames / Math.pow(2, curRound); 
      for (let game = 0; game < totalGames; game++) {
        let base = gamesPerSplit * Math.floor(game / gamesPerSplit); 
        let mod =  Math.floor((game % gamesPerSplit) / 2);
        if (gamesPerSplit !== 1) {
          // More games to be played
          bracketOutput[curRound][game] = {
            seeds: [-1, -1], 
            w: base + mod, 
            l: base + mod + gamesPerSplit/2
          }
        } else {
          // No more games to be played
          bracketOutput[curRound][game] = {
            seeds: [-1, -1], 
            wp: game*2, 
            lp: game*2+1
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
      io.to(`team-${team.t}`).emit(`brackets-newMatch`, data); 
      count ++; 
    }
  }
  return count; 
}

/**
 * 
 * @param {object} io - socket.io instance to use
 * @param {object} db - mongodb connection object
 * @param {object} params - {tid: (string), round: (number)}
 * @param {object} message - what message to route
 * @returns {object} {ok: (boolean), msg: (string)}
 */
async function routeMessage(io, db, params, message) {
  let {tid, round} = params; 
  let metadata = await db.findOne({
    _md: true
  }); 
  if (!metadata) {
    return {ok: false, msg: `Unable to find metadata object (_md)`}
  }
  let seedNum = metadata.seeds.findIndex(obj => obj.t === tid);
  console.log('tid/sn: ', tid, seedNum); 
  let match = await db.findOne({
    round, 
    seeds: seedNum
  }); 
  if (!match) {
    return {ok: false, msg: `Failed to find match object (tid: ${tid})`}
  }
  console.log('match: ', match); 
  let opponentSeedNum = match.seeds[0] === seedNum ? match.seeds[1] : match.seeds[0]; 
  let opponentTID = metadata.seeds[opponentSeedNum].t; 
  io.to(`team-${tid}`).emit(`brackets-msg`, Object.assign({fromTeam: true}, message)); 
  io.to(`team-${opponentTID}`).emit(`brackets-msg`, Object.assign({fromTeam: false}, message)); 
  return {ok: true}; 
}

module.exports = {
  generateNewBrackets, 
  generateBrackets, 
  listRoundMatchups, 
  broadcastMatchups, 
  routeMessage, 
  appHook: function(req, res, next) {
    // console.log(req); 
    next(); 
  }
}
// console.log(generateBrackets(5))