var socket = io();

var secSocket = io('/secure', {
  query: 'token=potato'
})

socket.on('connect', () => {
  console.log(socket.id); // 'G5p5...'
});

socket.on('chat', function(msg){
  console.log(msg);
  $('#log').append($('<li>').text(msg));
});

socket.on('page', (data) => {
  $('#log').append($('<li>').text(JSON.stringify(data))); 
});