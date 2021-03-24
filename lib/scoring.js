const levenshtein = require('js-levenshtein');

let countedRounds = process.env.OT_SCORING_ROUNDS.split(',').map(r => parseInt(r)); 
let multiplierList = process.env.OT_SCORING_MULT?process.env.OT_SCORING_MULT.split(',').map(r => parseFloat(r)) : false; 


function isCorrect(submission, question) {
  let {answer, type} = question; 
  submission = submission.toLowerCase().trim();
  answer = answer.toLowerCase().trim(); 
  // Fields to return 
  let valid = false, correct = false, msg = false; 
  switch (type) {
    case 'md': 
      if (submission === 'r') {
        correct = true; 
        valid = true; 
      }
      break; 
    case 'mc': 
      if (submission.length <= 5 && submission.match(/[a-e*]/)) {
        valid = true; 
        if (submission === answer) {
          correct = true; 
        }
      }
      break; 
    case 'sa': 
    case 'bz': 
      if (answer.length <= 32) {
        valid = true; 
      } else {
        break; 
      }

      if (parseFloat(answer).toString() === answer) {
        // Numerical answer
        answer = parseFloat(answer); 
        submission = parseFloat(submission); 
        if (isNaN(submission)) {
          msg = 'should be a number'; 
          break; 
        }
        if (answer === submission) {
          correct = true; 
        } else if (answer > submission) {
          msg = 'too high'
        } else if (answer < submission) {
          msg = 'too low'
        } else {
          msg = 'wrong answer'
        }
      } else {
        // Text answer
        if (submission.slice(0, 1) !== answer.slice(0, 1)) {
          // Incorrect - first letter must match
          break; 
        }
        let precision = (answer.length < 6 ? 1 : (answer.length < 12 ? 2 : 3)); // how many typos are considered "acceptable"
        if (levenshtein(submission, answer) <= precision) {
          correct = true; 
        }
      }
      break; 
  }
  return {
    valid, 
    correct, 
    msg
  }
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