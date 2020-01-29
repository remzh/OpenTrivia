let logs = []; 
window.logger = {
  version: '1.0.0 (b2)',
  info: function(msg) {
    console.info(msg); 
    this.push({
      ts: Date.now(), 
      t: 'info', 
      msg: msg
    })
  }, 
  warn: function(msg) {
    console.warn(msg); 
    this.push({
      ts: Date.now(), 
      t: 'warn', 
      msg: msg
    })
  }, 
  error: function(msg) {
    console.error(msg); 
    this.push({
      ts: Date.now(), 
      t: 'error', 
      msg: msg
    })
  }, 
  open: function() {
    if(this.logw && this.logw.close) {this.logw.close()}
    this.logw = window.open('', '_blank', 'top=40px,left=40px,width=400px,height=600px'); 
    this.logw.document.writeln(`<title>OpenTrivia Console</title><style>:selection{background: #cde}html{font-family: 'Roboto', sans-serif; font-size: 12px}body{margin:0;padding-bottom:24px}#i,.m{padding: 0 4px; overflow: hidden; word-break: break-word; border-bottom: 1px solid #888}.mt{color: #777}#i{position:fixed; bottom: 0px; width: 100%; outline: none; height: 24px; border: none; border-top: 1px solid #555; transition: border-color 0.15s}#i:focus{border-color: #55f}m{display: block; width: 100%}.info{background: #f3f3ff}.warn{background: #ffffdd}.error{background: #ffeeee}</style>`);
    this.logw.document.writeln(`<input id='i' placeholder='> Console'/><script>document.getElementById('i').addEventListener('keyup', (e) => {if(e.key === 'Enter'){window.opener.logger.eval(i.value); i.value=''}}); i.focus()</script><div class='m' style='background: #ddffdd'><b>OpenTrivia</b> v${this.version}<br/>&copy; 2020 Ryan Zhang. Some Rights Reserved.</div>`);
    this.logwi = logs.length; // used for real-time pushing of messages
    for(let i = 0; i < logs.length; i++){
      let log = logs[i]; 
      this.logw.document.writeln(`<div class='m ${log.t}'><span class='mt'>[${(i+1).toString().padStart(3, '0')}] ${moment(log.ts).format('hh:mm:ss')}</span> <b>${log.t}:</b> ${log.msg}</div>`);
    }
  }, 
  push: function(log) {
    logs.push(log); 
    if(this.logw && this.logwi){
      this.logwi ++; 
      this.logw.document.writeln(`<div class='m ${log.t}'><span class='mt'>[${(this.logwi).toString().padStart(3, '0')}] ${moment(log.ts).format('MM/DD hh:mm:ss')}</span> <b>${log.t}:</b> ${log.msg}</div>`);
    }
  },
  circReplace: () => {
    const seen = new WeakSet();
    return (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return;
        }
        seen.add(value);
      }
      return value;
    };
  }, 
  eval: function(msg) {
    let geval = eval; 
    this.info('> ' + msg); 
    try {
      let out = geval(msg); 
      if(typeof out === 'object'){
        this.info('> '+JSON.stringify(out, this.circReplace()))}
      else{
        this.info('> '+ out)}
      this.logw.scrollTo(0, 1E10); 
    } catch (e){
      // this.error('<' + e.message);
      this.error('> '+e.stack) 
    }
  }
}