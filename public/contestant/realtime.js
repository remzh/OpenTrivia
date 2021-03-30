/**
 * realtime.js
 * Optional components to enhance the Trivia Night experience 
 * Includes all of the following: 
 *  - Support for 1v1 (head to head) matches
 *    - Announcing who you're competing against 
 *    - Support for "buzzer" indicators for when a team answers
 *    - "Matchup" button in footer during 1v1 mtches to show opponent
 *  - Real time chat support (TBD)
 *    - "Chat" button in footer 
 *    - Supports team <-> event hosts and team <-> opponent (during 1v1s)
 */

// This only exists because some browsers *cough* Safari is REALLY picky with playing any sort of sounds.
let _sounds = {
  buzz1: new Howl({
    src: 'sounds/buzz1.mp3'
  }), 
  buzz2: new Howl({
    src: 'sounds/buzz2.mp3'
  }), 
}

/**
 * Lights up a buzzer and plays its respective sound
 * @param {boolean} type - true for contestant (blue), false for opponent (red)
 */
function buzz(type) {
  $(`#buzzer-${type?'blue':'red'}`).addClass('active'); 
  // let sound = new Audio(`sounds/buzz${type?2:1}.mp3`); 
  // let sound = $(`#brko-buzz-${type?2:1}`)[0]; 
  // sound.currentTime = 0; 
  // sound.play(); 
  _sounds[`buzz${type?2:1}`].play(); 
}

/**
 * Turns off both buzzer "lights", resetting them for another "buzz"
 */
function resetBuzzer() {
  $('.buzzer').removeClass('active'); 
}

/**
 * Resets and displays the two buzzers at the top
 * @param {number} [scoreBlue=0] - score to show for blue
 * @param {number} [scoreRed=0] - score to show for red
 */
function showBuzzer(scoreBlue=0, scoreRed=0) {
  resetBuzzer(); 
  $('#buzzer-score-blue').text(scoreBlue); 
  $('#buzzer-score-red').text(scoreRed); 
  $('#buzzers-outer').show(); 
}

/**
 * Resets and hides the two buzzers at the top
 */
function hideBuzzer() {
  $('#buzzers-outer').hide(); 
  resetBuzzer(); 
}

socket.on('brackets-newMatch', (data) => {
  logger.info(`[brackets] newMatch: ${JSON.stringify(data)}`); 
  showBuzzer(); 
  roundConfig.brackets = true; 
  // console.log(data); 

  $('#brko-round').text(`Game ${data.round}`); 
  if (data.opponent.bye) {
    $('#brko-bye').show(); 
    $('#brko-opponent').hide(); 
  } else {
    $('#brko-bye').hide(); 
    $('#brko-opponent').show(); 
    $('#brko-opponent-name').text(data.opponent.tn); 
    $('#brko-opponent-members').text(data.opponent.tm); 
  }
  $('.bracket-overlay-msg').hide(); 
  $('#bracket-overlay-intro').show(); 
  showBracketOverlay(); 
})

socket.on('brackets-endMatch', (data) => {
  logger.info(`[brackets] endMatch: ${JSON.stringify(data)}`); 
  $('.bracket-overlay-msg').hide(); 
  if (data.winner) {
    $('#bracket-overlay-results-win').show(); 
  } else {
    $('#bracket-overlay-results-loss').show(); 
  }
  $('#bracket-overlay-results-score').html(`<b class='chat-blue'>${data.score} points</b> (Your team) to <b class='chat-red'>${data.opponentScore} points</b> (Opponent)`);
  $('#bracket-overlay-results').show(); 
  showBracketOverlay(); 
})

function showBracketOverlay() {
  $('#bracket-overlay').show(); 
  setTimeout(() => {
    $('#bracket-overlay').css('opacity', 1); 
  }, 100); 
}

function hideBracketOverlay() {
  $('#bracket-overlay').css('opacity', 0); 
  setTimeout(() => {
    $('#bracket-overlay').hide(); 
  }, 320); 
}

function rt_showChatOverlay() {
  $('#bracket-chat-overlay').show().addClass('ext-show'); 
  setTimeout(() => {
    $('#bracket-chat-overlay').removeClass('ext-show'); 
  }, 400); 
}

function rt_hideChatOverlay() {
  $('#bracket-chat-overlay').addClass('ext-hide'); 
  setTimeout(() => {
    $('#bracket-chat-overlay').hide().removeClass('ext-hide'); 
  }, 400); 
}

socket.on('brackets-msg', (data) => {
  logger.info(`[brackets] msg: ${JSON.stringify(data)}`); 
  switch (data.type) {
    case 'answerSubmit': 
      if (data.fromTeam) {
        buzz(1); 
      } else {
        buzz(0); 
      }
      break; 
    case 'scoreUpdate': 
      $('#buzzer-score-blue').text(data.teamScore[1]); 
      $('#buzzer-score-red').text(data.opponentScore[1]); 
      // let teamMsg = data.teamScore[0] === 10 ? 'Answered correctly first!' : (data.teamScore[0] > 0 ? 'Correct answer, but not first' : 'Incorrect answer.'); 
      // showSnackbar(`[+${data.teamScore[0]}] ${teamMsg}`, 1); 
  }
})