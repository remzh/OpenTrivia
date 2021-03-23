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

/**
 * Lights up a buzzer and plays its respective sound
 * @param {boolean} type - true for contestant (blue), false for opponent (red)
 */
function buzz(type) {
  $(`#buzzer-${type?'blue':'red'}`).addClass('active'); 
  let sound = new Audio(`sounds/buzz${type?2:1}.mp3`); 
  sound.play(); 
}

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
  console.log(data); 

  $('#bracket-overlay').show(); 
  $('#brko-round').text(`Game ${data.round}`); 
  $('#brko-opponent').text(data.opponent.tn); 
  setTimeout(() => {
    $('#bracket-overlay').css('opacity', 1); 
  }, 100); 
})

function hideBracketOverlay() {
  $('#bracket-overlay').css('opacity', 0); 
  setTimeout(() => {
    $('#bracket-overlay').hide(); 
  }, 320); 
}