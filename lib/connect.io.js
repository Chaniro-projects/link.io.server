var connectIO = new ConnectIO();
var Model = require("./model.js")(connectIO);
var fs = require('fs');

/**
 * Constructor
 * @type {ConnectIO}
 */
function ConnectIO(io) {
    this.io = undefined;
}

/**
 * Initialise with Socket.IO param
 * @param io
 * @returns {ConnectIO}
 * @private
 */
ConnectIO.prototype._init = function(io) {
    this.io = io;
    return this;
}

/**
 * Bind Socket.IO events
 */
ConnectIO.prototype.bind = function() {
    var io = this.io;
    var nbEventsPerSecond = 0;

    setInterval(function() {
        //io.emit("event", {type: "eventsPerSeconds", me:false, data: nbEventsPerSecond});
        nbEventsPerSecond = 0;
    }, 1000);

    //Middleware-style authentication
    io.use(function(socket, next) {
        if(true /*socket.handshake.query.user == 'root' && socket.handshake.query.password == 'root'*/) {
            var u = new Model.Client(
                socket.handshake.query.user,
                socket
            );
            socket.user = u;
            connectIO.log("[" + u.login + "] connected");
            next();
        }
        else
            next(new Error('Authentication error'));
    });

    //New client connecting
    io.on('connection', function(socket){
        var user = socket.user;

        socket.on("createGroup", function(rights) {
            var g = new Model.Group(user);
            socket.emit("joinedGroup", g.id);

            socket.emit("users", g.getAllLogin());
        });

        socket.on("joinGroup", function(id) {
            if(typeof user.group != 'undefined') {
                if(user.group.id == id)
                    return;
                user.group.leave(user);
            }

            var g = user.joinGroup(id);
            if(typeof  g != 'undefined') {
                io.to(id).emit("users", g.getAllLogin());
                socket.emit("joinedGroup", g.id);
            }
        });

        socket.on("event", function(e) {
            console.log(e.data.toY);
            nbEventsPerSecond++;
            if(typeof user.group != 'undefined') {
                if(e.type == "line")
                    console.log(e.data.toY);
                if(e.me == true)
                    io.to(user.group.id).emit("event", e);
                else
                    socket.broadcast.to(user.group.id).emit("event", e);
            }
        });

        socket.on("test", function() {
            fs.readFile('img.jpg', function(err, buf){
                socket.emit('test', { image: true, buffer: buf });
            });
        })

        socket.on("leaveGroup", function(rights) {
            if(typeof user.group != 'undefined') {
                user.group.leave(user);
                connectIO.log("[" + socket.user.login + "] left group [" + user.group.id + "]");
            }
        });

        socket.on("ping", function() {
            socket.emit("pong");
        });

        socket.on('disconnect', function () {
            var g = socket.user.group;
            socket.user.disconnect();
            connectIO.log("[" + socket.user.login + "] disconnected");

            if(typeof g != 'undefined')
                socket.broadcast.to(g.id).emit("users", g.getAllLogin());
        });
    });
}

ConnectIO.prototype.log = function(str) {
    console.log(str);
}

module.exports = function(io) {
    return connectIO._init(io);
};