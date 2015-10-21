var http = require('http').Server();
var io = require('socket.io')(http);
var ConnectIO = require("./lib/connect.io.js")(io);
var port = 8080;

ConnectIO.bind();

http.listen(port, function(){
    console.log('Server started on *:' + port);
});