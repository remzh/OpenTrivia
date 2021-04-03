let divg_buzzerMode = false; 

function divg_resetBuzzer() {
  $('.q').hide(); 
  $('#divg-buzzer').removeClass('light-blue blue').prop('disabled', false).html(`<i class='far fa-bell fa-4x'></i>`);
  $('#q-buzzer').show(); 
}

socket.on('divergence-status', data => {
  if (!data.active) {
    $('#divergence-outer').hide(); 
    if (divg_buzzerMode) {
      divg_buzzerMode = false; 
      socket.emit('status'); 
    }
    return;   
  }
  $('#divergence-outer').show(); 
  $('#divergence-name').text(data.name); 

  if (data.buzzerMode && !divg_buzzerMode) {
    divg_buzzerMode = true; 
    divg_resetBuzzer(); 
  } 
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
}); 

socket.on('divergence-buzzer-ack', (res) => {
  if (!res.ok) {
    alert(`Failed to buzz: Question not active and/or your team is not eligible to buzz.`);
    $('#divg-buzzer').removeClass('light-blue').prop('disabled', false); 
    return; 
  }
  $('#divg-buzzer').removeClass('light-blue').prop('disabled', true).html(`<i class='fas fa-bell fa-4x'></i>`);
  if (res.sender) {
    $('#divg-buzzer').addClass('blue'); 
  }
  if (typeof _sounds !== 'undefined') {
    // requires realtime.js
    _sounds.buzz2.play(); 
  }
})

$('#divg-buzzer').on('mousedown', () => {
  $('#divg-buzzer').addClass('light-blue').prop('disabled', true).html(`<i class='fas fa-circle-notch fa-spin fa-3x'></i>`);
  socket.emit('divergence-buzz'); 
}); 

document.addEventListener('keydown', (event) => {
  if (divg_buzzerMode === true && event.key === 'b') {
    if ($('#divg-buzzer').prop('disabled') !== true) {
      $('#divg-buzzer').addClass('light-blue').prop('disabled', true).html(`<i class='fas fa-circle-notch fa-spin fa-3x'></i>`);
      socket.emit('divergence-buzz'); 
    }
  }
}); 