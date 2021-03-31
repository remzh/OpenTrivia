socket.on('divergence-status', data => {
  if (!data.active) {
    $('#divergence-outer').hide(); 
    return;   
  }
  $('#divergence-outer').show(); 
  $('#divergence-name').text(data.name); 
})