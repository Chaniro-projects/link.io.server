var http = require('http').Server();
var io = require('socket.io')(http);
var ConnectIO = require("./lib/connect.io.js")(io);

//Default port
var port = 8080;

ConnectIO.start();

http.listen(port, function(){
    console.log('Server started on *:' + port);
});