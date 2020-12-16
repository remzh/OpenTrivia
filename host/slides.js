let socket = io({
  transports: ['websocket', 'xhr']
}); 
let secSocket = io.connect('/secure');
let status = 0; 

let curType = ''; 
let imagePlaceholder = {}; 

function showStatus(type, msg){
  let map = {
    'error': ['fa-exclamation-triangle', 'st-red'], 
    'pending': ['fa-circle-notch fa-spin', 'st-yellow'], 
    'success': ['fa-lock', 'st-green']
  }
  $('#status').html(`<i class='fas ${map[type][0]}'></i> ${msg}`); 
}

socket.on('connect', () => {
  logger.info('[std] socket connected; id: '+socket.id)
  showStatus('success', 'Connected'); 
  if(!status){
    logger.info('first connection, attempting to elevate')
    socket.emit('sec-login'); 
    showStatus('pending', 'Authenticating...'); 
  }
});

secSocket.on('connect', () => {
  logger.info('[sec] socket connected; id: '+socket.id);
  secSocket.emit('status');
  ping(); 
})

secSocket.on('connect_error', (err) => {
  logger.info('[sec] connection error: '+err)
})

secSocket.on('error', (err) => {
  logger.info('[sec] error: '+err)
})

socket.on('disconnect', (reason) => {
  logger.info('socket disconnected: '+reason); 
  $('#s-ping-outer').hide(); 
  if(reason === 'io server disconnect'){
    showStatus('error', 'Kicked by Server'); 
    alert('Disconnected by server. ')
  } else {
    showStatus('pending', 'Reconnecting...'); 
  }
})

socket.on('status', (res) => {
  if(res.valid){
    showStatus('success', 'Connected'); 
    logger.info('elevation successful')
  }
  else{
    showStatus('error', 'Not Authenticated'); 
    logger.warn('login rejected; redirecting');
    setTimeout(() => {
      window.open('..', '_self')
    }, 1000); 
  }
}); 

let ping_ds = 0; 
function ping() {
  if (socket && socket.connected) {
    ping_ds = Date.now(); 
    socket.volatile.emit('tn-ping'); 
  }
}
socket.on('pong', () => {
  $('#s-ping-outer').show(); 
  $('#s-ping').text(Date.now() - ping_ds); 
})
setInterval(ping, 7500); 

blurInterval = false; 
function updateQuestion(data){
  curType = data.type; 
  $('#scores').hide(); 
  // Render question
  if (data.type !== 'md') {
    $('#timer').show(); // show the timer
  } else {
    $('#timer').hide(); // unless it's an "are you ready" question
  }
  $('#q-details').show(); 
  $('#question').show().css('font-size', '3.5rem'); 
  if (data.question.indexOf('|') === -1) {
    $('#question').text(data.question); 
  } else {
    $('#question').html(data.question.split('|')[0] + '<br/>' + data.question.split('|').slice(1).map(r => `<span class='blurred'><span class='hint'>Hint: </span>${r}</span>`).join('<br/>')); 
    if (blurInterval) clearInterval(blurInterval); 
    blurInterval = setInterval(() => {
      if ($('.blurred').length > 0) {
        $('.blurred').first().removeClass('blurred');
      } else {
        clearInterval(blurInterval); 
        blurInterval = false; 
      }
    }, 10000); 
  }

  if ($('#question')[0].offsetHeight > 300) {
    $('#question').css('font-size', '2.9rem')}

  // Round / Question Number info
  if(data.num){
    $('#qnum').text(`R${data.round} Q${data.num}`)
  } else if(data.round === 'B'){
    $('#qnum').text(`Bonus`)}
  else{
    $('#qnum').text(`Round ${data.round}`)}
  $('#cat').text(data.category); 
  $('#subcat').text(data.subcategory?`• ${data.subcategory}`:'')
  $('#q-options').hide();
  if(data.image){
    $('#q-image').show(); 
    $('#image').prop('src', data.image); 
  } else{
    $('#q-image').hide(); 
  }
  if(data.type === 'mc'){
    $('#q-image').removeClass('img-fullWidth');
    $('#q-options').show(); 
    $('#q-stats').hide(); 
    let p = ['a', 'b', 'c', 'd', 'e']; 
    let charCount = 0, lowestChar = 0; 
    for(let i = 0; i <= 4; i++){
      if(data.options[i]){
        $('#sp-'+p[i]).text(data.options[i]);
        charCount += data.options[i].length; 
        if (lowestChar < data.options[i].length) {
          lowestChar = data.options[i].length; 
        }
      } else{
        $('#sp-'+p[i]).text(`<i>(n/a)</i>`);
      }
    }
    if(charCount > 190) {
      $('#q-options').css('flex', '2'); 
    } else if (lowestChar < 30) {
      $('#q-options').css('flex', (0.4 + (lowestChar/50)).toString()); 
    } else {
      $('#q-options').css('flex', '1'); 
    }
  }
  else{
    $('#q-image').addClass('img-fullWidth');
    if (data.type === 'sa' || data.type === 'bz' || data.type === 'md') {
      $('#q-stats').show(); 
      $('#q-pb-inner').css('width', '0%');
      $('#q-stats-num').text(`0%`); 
      if (data.type === 'md') {
        $('#q-stats-msg').text('are ready!'); 
      } else {
        $('#q-stats-msg').text('have correctly answered!'); 
      }
    } else {
      $('#q-stats').hide(); 
    }
  }
  $('#q-details').css('height', `${window.innerHeight - $('#question')[0].offsetHeight - 130}px`); 
}

function displayAnnouncement(data) {
  $('#main').css('opacity', 0); 
  setTimeout(() => {
    $('#scores').hide(); 
    $('#q-details').hide(); 
    $('#timer').hide(); 
    $('#main').css('margin-top', '').addClass('announcement'); 
    $('#cat').text(''); 
    $('#qnum').text(data.title); 
    $('#question').show().text(data.body); 
    $('#main').css('opacity', 1); 
  }, 400)
}

function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function displayScores(data) {
  console.log(data); 
  $('#main').css('opacity', 0); 
  setTimeout(() => {
    $('#q-details').hide(); 
    $('#main').removeClass('announcement'); 
    $('#main').addClass('showing-scores'); 
    $('#main').css('margin-top', (window.innerHeight - 690)/2 + 'px');
    $('#timer').hide(); 
    $('#cat').text(data.title); 
    $('#qnum').text('Top Teams'); 
    $('#question').hide(); 
    $('#main').css('opacity', 1); 
    let showCor = (data.title === 'Overall' ? !1:!0); 
    for (let i = 0; i < 5; i++) {
      let team = data.scores.data[i]; 
      if (team) {
        $(`#scores-tn-${i}`).text(team.tn); 
        if (i < 3) {
          $(`#scores-det-${i}`).html(`<div><div>${team.tm.replace(/(?<=\w) /g, '&nbsp;')}</div></div><hr/>${showCor?`<span class='scores-cor'>${team.s.c} correct answer${team.s.c===1?'':'s'}</span>`:`<span class='scores-pts'>${numberWithCommas(Math.round(team.s.s))} points</span>`}<br/><span class='scores-tb scores-sm'>TB: ${numberWithCommas(team.s.tb)}</span>`)
        } else {
          $(`#scores-det-${i}`).html(`${showCor?`<span class='scores-cor'>${team.s.c} correct answer${team.s.c===1?'':'s'}</span>`:`<span class='scores-pts'>${numberWithCommas(Math.round(team.s.s))} points</span>`} | <span class='scores-tb'>TB: ${numberWithCommas(team.s.tb)}</span>`)
        }
      }
    }
    $('#scores').show(); 
  }, 400)
}

secSocket.on('announcement', displayAnnouncement);
socket.on('announcement', displayAnnouncement); 

secSocket.on('scores', displayScores); 

secSocket.on('question-full', (data) => {
  logger.info('Recieved question: '+JSON.stringify(data));
  if(!data.active){
    $('#timer').text('0');
    $('#timer').addClass('timer-low')}
  else{
    $('#timer').html(`<i class='fas fa-stopwatch'></i>`); 
    $('#timer').removeClass('timer-low')}
  $('#main').css('opacity', 0); 
  $('.opt').removeClass('correct').removeClass('incorrect');
  $('#q-stats-answer span').css('opacity', 0);

  if(data.image){
    imagePlaceholder = new Image; 
    Promise.all([Promise.race([new Promise((res) => {
      imagePlaceholder.onload = res; 
    }), new Promise((res => {
      setTimeout(res, 2400); 
    }))]), new Promise((res => {
      setTimeout(res, 400); 
    }))]).then(() => {
      prepareQuestion(data); 
    })
    imagePlaceholder.src = data.image;
  } else {
    setTimeout(() => {
      prepareQuestion(data); 
    }, 400); 
  }
})

function prepareQuestion(data){
  $('#main').css('margin-top', '').removeClass('announcement showing-scores'); 
  $('.opt-perc').remove(); 
  $('.opt-bar').css('width', '0%');
  updateQuestion(data); 
  $('#main').css('opacity', 1); 
}

secSocket.on('answer-stats', (data) => {
  logger.info('Recieved answers: '+JSON.stringify(data)); 
  if(data.type === 'mc'){
    $('.opt').addClass('incorrect'); 
    $('#opt-'+data.ans).removeClass('incorrect').addClass('correct'); 
    $('.opt-perc').remove(); 
    let p = ['a', 'b', 'c', 'd', 'e']; 
    for(let i = 0; i <= 4; i++){
      $('#opt-'+p[i]).children('.opt-bar').css('width', (data[p[i]]*100)+'%')
      $('#opt-'+p[i]).children('.opt-ans').append(`<span class='opt-perc'>${data[p[i]]===1?'100':(data[p[i]]*100).toFixed(1)}%</span>`)}
    setTimeout(() => {
      $('.opt-perc').css('opacity', 1);
    }, 800);
  } else if (data.type === 'sa' || data.type === 'bz'){
    $('#q-stats-answer span').css('opacity', 1).text(data.ans); 
  }
})

secSocket.on('answer-update', (data) => {
  if (curType === 'sa' || curType === 'bz' || curType === 'md') {
    let correct = data.correct, totalTeams = data.total; 
    if (correct > totalTeams) totalTeams = correct; 
    // $('#q-stats-num').text(`${correct}/${totalTeams} (${Math.round(100*correct/totalTeams)}%)`);
    $('#q-stats-num').text(`${Math.round(100*correct/totalTeams)}%`);
    $('#q-pb-inner').css('width', `${Math.round(1000*correct/totalTeams)/10}%`);
  }
})

socket.on('timer', (t) => {
  if (t === -1) {
    $('#timer').html(`<i class='fas fa-stopwatch'></i>`); 
    $('#timer').removeClass('timer-low');
    return; 
  }
  $('#timer').text(t); 
  if(t <= 3){
    $('#timer').addClass('timer-low')}
  else{
    $('#timer').removeClass('timer-low')}
}); 

window.onresize = function(){
  $('#q-details').css('height', `${window.innerHeight - $('#question')[0].offsetHeight - 130}px`); 
  if ($('#scores').css('display') === 'block'){
    $('#main').css('margin-top', (window.innerHeight - 690)/2 + 'px')
  }
}

let mhTimeout; 
document.body.onmousemove = function() {
  clearTimeout(mhTimeout); 
  $('body').prop('style', 'cursor: default'); 
  $('#footer').css('opacity', 1);
  mhTimeout = setTimeout(() => {
    $('body').prop('style', 'cursor: none'); 
    $('#footer').css('opacity', 0);
  }, 1600); 
}