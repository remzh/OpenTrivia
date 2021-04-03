/**
 * divergence.js
 * (C) 2021 Ryan Zhang
 * 
 * Extends Open Trivia to allow for two simultaneoeus rulesets - such that a select, manually picked set of teams are subject to something different (i.e., scoring dependent on others in the set). This is particularly useful for final rounds where we want 3-8 teams to be more competitive while others are less stressful. 
 * The majority of this code is HARD CODED, and is intentionally that way due to the nature of these "special" setups/circumstances. 
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
 * 
 * @param {object} io - io object
 * @param {array} teams - array of Team IDs that are part of divergence
 * @param {string} type - hardcoded divergence "type" to run 
 */
function sendInit(io, teams, type) {
  if (typeof teams === 'string') {
    teams = [teams]; 
  }
  if (type === 'sp1') {
    for (let team of teams) {
      _emitToTeam(io, team, 'divergence-status', {
        active: true, 
        name: 'Semifinals'
      })
    }
  } else if (type === 'sp2') {
    for (let team of teams) {
      _emitToTeam(io, team, 'divergence-status', {
        active: true, 
        name: 'Finals', 
        buzzerMode: true
      }); 
      _emitToTeam(io, team, 'divergence-value', {
        divergenceKey: '', 
        divergenceValue: ''
      }); 
    }
  }
}

function sendUpdate(io, teams, type, data) {
  if (typeof teams === 'string') {
    teams = [teams]; 
  }
  if (type === 'sp1') {
    for (let team of teams) {
      if (data === -1) {
        _emitToTeam(io, team, 'divergence-value', {
          divergenceKey: '', 
          divergenceValue: ''
        }); 
      } else {
        _emitToTeam(io, team, 'divergence-value', {
          divergenceKey: 'Question Worth:', 
          divergenceValue: data
        }); 
      }
    }
  }
}

function sendScores(io, teams, scores) {
  for (let team of teams) {
    _emitToTeam(io, team, 'divergence-value', {
      divergenceKey: 'Current Score:', 
      divergenceValue: scores[team]
    }); 
  }
}

module.exports = {
  sendInit, 
  sendUpdate, 
  sendScores
}