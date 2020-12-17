let socket = io({
  transports: ['websocket', 'xhr']
}); 
let secSocket = io.connect('/secure');
let status = 0; 

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

let firstConnect = true; 
secSocket.on('connect', () => {
  logger.info('[sec] socket connected; id: '+socket.id); 
  ping(); 
  if(firstConnect){
    firstConnect = false; 
    secSocket.emit('host-firstConnect'); // loads question list and currently published scores
    secSocket.emit('status'); // checks to see what's currently active
  }
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
setInterval(ping, 4000); 

socket.on('timer', (t) => {
  if (t === -1) {
    $('.field-timer').text(`Timer paused.`); 
    $('.btn-auto').prop('disabled', false).text('Start Timer')
  } else {
    $('.field-timer').text(`${t} second${t===1?'':'s'} remaining.`); 
    if (t === 0) {
      $('.btn-auto').prop('disabled', false).text('Show Results'); 
    } else {
      $('.btn-auto').prop('disabled', true).text('Waiting for Timer'); 
    }
  }
})

// actual host stuff
// basic/advanced tab

secSocket.on('update', (msg) => {
  if(typeof msg === 'object') msg = JSON.stringify(msg);  
  logger.info('[server]' + msg); 
  alert(msg); 
})

secSocket.on('question-full', (q) => {
  logger.info('[sec] got question: '+JSON.stringify(q)); 
  $('#sel-questions').val(q.index); 
  $('.field-timer').text(`No timer active.`); 
  $('.field-q-num').text(`R${q.round}Q${q.num} • ${q.type.toUpperCase()}`);
  $('#q-cur-det').text(`R${q.round}Q${q.num} • ${q.type.toUpperCase()} • ${q.category}`);
  $('#q-cur').html(q.question + (q.type==='mc'?`<br/><i> - ${q.options.join('</i><br/><i> - ')}</i>`:'')); 
  $('#q-ans').text(0); 
  $('#q-cor').text(0);
  $('#q-ans-val').prop('title', `Answer: ${q.answer}`);
  $('#i-timer').prop('placeholder', q.type==='sa'?'20':'10'); 

  $('.btn-auto').prop('disabled', false); 
  if (q.active) {
    $('.btn-auto').text('Start Timer')
  } else if (!q.scoresSaved) {
    $('.btn-auto').text('Show Results')
  } else {
    $('.btn-auto').text('Next Question')
  }
}); 

secSocket.on('question-list', (l) => {
  let curRound = -1; 
  for(let i = 0; i < l.length; i++){
    if(l[i].r !== curRound) {
      if (curRound !== -1) {
        $('#sel-questions')[0].insertAdjacentHTML('beforeEnd', `</optgroup>`);
      }
      $('#sel-questions')[0].insertAdjacentHTML('beforeEnd', `<optgroup label='Round ${l[i].r}'>`);
      curRound = l[i].r; 
    }
    $('#sel-questions')[0].insertAdjacentHTML('beforeEnd', `<option value='${i}'>R${l[i].r} Q${l[i].q}</option>`); 
  }
  $('#sel-questions')[0].insertAdjacentHTML('beforeEnd', `</optgroup>`);
})

function updateAnn(val) {
  $('.btn-auto').prop('disabled', true).text('Announcement');
  $('#q-cur-det').html(`<span class='scores-green'>SP: Announcement</span>`);
  $('.field-timer').text('Timer not applicable.'); 
  $('#q-cur').html(`<b>${val.title}</b><br><span>${val.body}</span>`);
}

function updateScores(val) {
  $('.btn-auto').prop('disabled', true).text('Top Teams');
  $('#q-cur-det').html(`<span class='scores-green'>SP: Top Teams ("Scores")</span>`);
  $('.field-timer').text('Timer not applicable.'); 
  $('#q-cur').html(`Top Teams shown for <b>${val.title}</b>`);
}

socket.on('announcement', updateAnn); // used in most cases
secSocket.on('announcement', updateAnn); // used on initial connection

secSocket.on('scores', updateScores); // used when top teams slide is shown

$('#btn-loadQuestion').on('click', () => {
  secSocket.emit('load-question', parseInt($('#sel-questions').val())); 
})

$('#btn-loadNextQuestion').on('click', () => {
  secSocket.emit('action-nextQuestion'); 
})

$('#btn-startTimer').on('click', () => {
  secSocket.emit('start-timer', $('#i-timer').val()?$('#i-timer').val():false); 
})

$('#btn-stopTimer').on('click', () => {
  secSocket.emit('stop-timer'); 
})

secSocket.on('answer-update', (dt) => {
  // let total = Object.keys(dt).length; 
  // let correct = Object.values(dt).filter(r => r==1).length; 
  $('#q-ans').text(dt.attempted); 
  $('#q-cor').text(dt.correct);
})

// scoring
secSocket.on('scores-host', (res) => {
  console.log(res); 
  if (!res.ok) {
    $('#scores-table').text(`Failed to load: ${res.error}`); 
    return; 
  }
  // <tr><th colspan='2'>Team</th><th colspan='${res.rounds.length}'>Rounds</th><th colspan='2'>Overall</th></tr>
  let out = `<thead><tr><th>ID</th><th>Team Name</th>${res.rounds.map(r => `<th class='scores-round'>R${r}</th>`).join('')}<th>Points</th><th>Rank</th></tr></thead><tbody>`; // construct heading
  res.data.forEach(r => {
    let indiv = r.i.map(e => `<td><span class='scores-green' title='Points: ${e.s}'>${e.c}</span>•<span class='scores-tb' title='TB: ${e.tb}'>${Math.round(e.tb)}</span>${e.r === -1 ? '':` <span class='scores-rank'>[${e.r}]</span>`}</td>`).join(''); 
    out += `<tr><td>${r.t}</td><td><span class='scores-tb' onclick='alert("Team Members: ${r.tm}")' title="Team Members: ${r.tm}">[+]</span> ${r.tn}</td>${indiv}<td>${r.s.s} <span class='scores-tb' title='TB: ${r.s.tb}'>(${r.s.tb.toFixed(1)})</span></td><td>${r.r}</td></tr>`
  })
  out += '</tbody>'; 
  $('#scores-lu').text(moment().format('h:mm:ss a'))
  $('#scores-table').html(out); 
})

secSocket.on('scores-publish', (status) => {
  if(status.ok) {
    $('#scores-lp').html(`<a target='_blank' href='/scores'>${moment(status.ts).format('hh:mm:ss a')}</a>`); 
  } else {
    alert('error: scores failed to publish - ' + status.error); 
  }
})

// magic button
$('.btn-auto').on('click', (e) => {
  let val = $('.btn-auto').text(); 
  $('.btn-auto').prop('disabled', true).text('Processing...'); 
  switch (val) {
    case 'Next Question': 
      secSocket.emit('action-nextQuestion'); 
      break; 
    case 'Start Timer': 
      secSocket.emit('start-timer'); 
      break; 
    case 'Show Results': 
      secSocket.emit('show-answer', 1); 
      break; 
    default: 
      alert(`Invalid parameter. Reloading the page may resolve this.`); 
      break; 
  }
})

secSocket.on('answer-stats', (stats) => {
  if (stats.scoresSaved) {
    $('.btn-auto').text('Showing Answers');
    setTimeout(() => {
      $('.btn-auto').prop('disabled', false).text('Next Question');
    }, 2000); 
  } else {
    $('.btn-auto').text('Waiting for Score Save');
  }
}); 

// socket.io adm

$('#admin-btn-query').on('click', () => {
  secSocket.emit('adm-getSockets');
})

let acList = []; 
secSocket.on('adm-sockets', (v) => {
  acList = []; 
  let tlist = new Set(); 
  let slist = v.socketList.sort((a, b) => a.team.localeCompare(b.team)); 
  $('#admin-table').html(`<thead><tr><th>TID</th><th>SID / Name</th><th>Connected</th><th>ans/rf</th></tr></thead><tbody>${slist.map(r => {
    tlist.add(r.team); 
    if (r.ac) acList.push(r.ac); 
    return `<tr><td>${r.team} - ${r.teamName}</td><td>${r.id} ${r.name?`<span class='yellowgreen'>(${r.name})</span>`:'<span class=\'yellow\'>(No Name)</span>'}</td><td>${r.connected}</td><td>${r.ac?`${r.ac.length} <a href='#' onclick='JSON.stringify(alert(acList[${acList.length-1}]))'>[+]</a>`:0}</td></tr>`
  }).join('')}</tbody>`);
  $('#admin-div-results').html(`${moment().format('hh:mm:ss a')} • getSockets<span class='right'>Total Hosts: ${v.hostCount} • Total users: ${v.userCount} (${tlist.size} team${tlist.size===1?'':'s'})</span>`);
  console.log(v); 
})

// utilities + general (not socket.io-specific)

$('#i-ann-template').on('change', () => {
  let val = $('#i-ann-template').val(); 
  $('#i-ann-title').val(val.split('|')[0]); 
  $('#i-ann-body').val(val.split('|')[1]); 
  $('#i-ann-template').val('none'); 
});

$('#btn-ann').on('click', () => {
  secSocket.emit('announce', {
    title: $('#i-ann-title').val(), 
    body: $('#i-ann-body').val()
  }); 
});

$('#btn-scores').on('click', () => {
  secSocket.emit("scores-slides", $('#i-scores-round').val() ? $('#i-scores-round').val():0); 
})

$('#nav-cat a').on('click', (e) => {
  let ele = e.srcElement; 
  $('#nav-cat a.active').removeClass('active'); 
  $(ele).addClass('active'); 
  $('.container').hide(); 
  $('#'+ele.dataset.target).css('display', 'flex'); 
});

function intervalUpdate() {
  $('#s-time').text(moment().format('M.DD // hh:mm:ss A'))
}
setInterval(intervalUpdate, 1000); 

window.onload = function() {
  intervalUpdate(); 
  if (location.hash && $(`#nav-cat a[href="${location.hash}"]`)) {
    $(`#nav-cat a[href="${location.hash}"]`).addClass('active'); 
    $(location.hash).css('display', 'flex'); 
  } else {
    window.open('#basic', '_self'); 
    $(`#nav-cat a[href="#basic"]`).addClass('active'); 
    $('#basic').css('display', 'flex'); 
  }
}