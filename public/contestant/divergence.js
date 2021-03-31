socket.on('divergence-status', data => {
  if (!data.active) {
    $('#divergence-outer').hide(); 
    return;   
  }
  $('#divergence-outer').show(); 
  $('#divergence-name').text(data.name); 
});

socket.on('divergence-value', data => {
  $("#divergence-header-right").text(data.divergenceKey); 
  $("#divergence-value").text(data.divergenceValue); 
}); 