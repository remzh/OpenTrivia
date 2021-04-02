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

socket.on('divergence-points', pts => {
  if (pts > 0) {
    $('#sa-right-score span span').text(pts); 
    $('#sa-right-score').show(); 
  } else {
    $('#sa-wrong').show(); 
  }
})