var http = require('http');
var currentLogFile = "";
var fs = require('fs');
var args = process.argv.slice(2);

var server = http.createServer(function(req, res) {
    fs.readFile(__dirname + '/log/' + currentLogFile, 'utf-8', function(error, content) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end(content);
    });

});

var port = 8080;
args.forEach(function(argv) {
    if(argv.indexOf("port=") == 0)
        port = parseInt(argv.split('=')[1]);
});
console.log(port);

var io = require('socket.io')(server);
var LinkIO = require("./lib/link.io.js")(io, function(fileName) {
    currentLogFile = fileName;
});

LinkIO.start(args);

server.listen(port, function(){
    console.log('Server started on *:' + port);
});
