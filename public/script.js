var socket = io();

var secSocket = io('/secure', {
    query: 'token=potato'
})