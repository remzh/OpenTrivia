let countedRounds = process.env.OT_SCORING_ROUNDS.split(',').map(r => parseInt(r)); 
let multiplierList = process.env.OT_SCORING_MULT?process.env.OT_SCORING_MULT.split(',').map(r => parseFloat(r)) : false; 


function isCorrect(submission, question) {
  let {answer, type} = question; 
  
}

// function computeScore(round, time, tid) {

// }

module.exports = {
  countedRounds,
  /**
   * Gets the multiplier for a specific round. Defaults to 1. 
   * @param {number} round - round number
   * @returns {number} multiplier
   */ 
  getMultiplier: function(round) {
    if (!multiplierList) {
      return 1; 
    }
    let multiplier = multiplierList[countedRounds.indexOf(round)]; 
    if (!multiplier || isNaN(multiplier)) {
      return 1; 
    }
    return multiplier; 
  }, 
  isCorrect
  // computeScore
}