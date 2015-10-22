var http = require('http').Server();
var io = require('socket.io')(http);
var LinkIO = require("./lib/link.io.js")(io);

//Default port
var port = 8080;

LinkIO.start();

http.listen(port, function(){
    console.log('Server started on *:' + port);
});