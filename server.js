var http = require('http');
var currentLogFile = "";
var fs = require('fs');

var server = http.createServer(function(req, res) {
    fs.readFile(__dirname + '/log/' + currentLogFile, 'utf-8', function(error, content) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end(content);
    });

});

var port = 8080;

var io = require('socket.io')(server);
var LinkIO = require("./lib/link.io.js")(io, function(fileName) {
    currentLogFile = fileName;
});

LinkIO.start();

server.listen(port, function(){
    console.log('Server started on *:' + port);
});