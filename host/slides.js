let socket = io(); 
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

secSocket.on('connect', () => {
  logger.info('[sec] socket connected; id: '+socket.id)
  secSocket.emit('status');
})

secSocket.on('connect_error', (err) => {
  logger.info('[sec] connection error: '+err)
})

secSocket.on('error', (err) => {
  logger.info('[sec] error: '+err)
})

socket.on('disconnect', (reason) => {
  logger.info('socket disconnected: '+reason); 
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

socket.on('pong', (latency) => {
  $('#s-ping-outer').show(); 
  $('#s-ping').text(latency); 
})

function updateQuestion(data){
  $('#question').text(data.question); 
  $('#qnum').text(`R${data.round} Q${data.num}`); 
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
    let p = ['a', 'b', 'c', 'd', 'e']; 
    for(let i = 0; i <= 4; i++){
      if(data.options[i]){
        $('#sp-'+p[i]).text(data.options[i]);
      } else{
        $('#sp-'+p[i]).text(`<i>(n/a)</i>`);
      }
    }
  }
  else{
    $('#q-image').addClass('img-fullWidth');
  }
  $('#image').prop('style', `height: ${window.innerHeight - $('#question')[0].offsetHeight - 150}px`)
}

secSocket.on('question-full', (data) => {
  logger.info('Recieved question: '+JSON.stringify(data));
  $('#main').css('opacity', 0); 
  $('.opt').removeClass('correct').removeClass('incorrect');
  setTimeout(() => {
    $('.opt-perc').remove(); 
    $('.opt-bar').css('width', '0%');
    updateQuestion(data); 
    $('#main').css('opacity', 1); 
  }, 400)
})

secSocket.on('answers', (data) => {
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
  }
})

secSocket.on('timer', (t) => {
  $('#timer').text(t); 
}); 

window.onresize = function(){
  $('#image').prop('style', `height: ${window.innerHeight - $('#question')[0].offsetHeight - 150}px`)
}