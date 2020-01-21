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