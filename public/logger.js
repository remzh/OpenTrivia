let logs = []; 
window.logger = {
  info: function(msg) {
    console.info(msg); 
    logs.push({
      ts: Date.now(), 
      t: 'info', 
      msg: msg
    })
  }, 
  warn: function(msg) {
    console.warn(msg); 
    logs.push({
      ts: Date.now(), 
      t: 'warn', 
      msg: msg
    })
  }, 
  error: function(msg) {
    console.error(msg); 
    logs.push({
      ts: Date.now(), 
      t: 'error', 
      msg: msg
    })
  }
}