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
 * Initialise with Socket.IO parameter
 * @param io
 * @returns {ConnectIO}
 * @private
 */
ConnectIO.prototype._init = function(io) {
    this.io = io;
    return this;
}

/**
 * Start Connect.IO server
 */
ConnectIO.prototype.start = function() {
    var io = this.io;
    var nbEventsPerSecond = 0;

    //Use to count the number of events per second.
    setInterval(function() {
        io.emit("event", {type: "eventsPerSeconds", me:false, data: nbEventsPerSecond});
        nbEventsPerSecond = 0;
    }, 1000);

    //Connection checking function
    io.use(function(socket, next) {
        //TODO: check user in DB
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

    //New client connected
    io.on('connection', function(socket){
        var user = socket.user;

        //Client is asking to create a new group
        socket.on("createGroup", function(rights) {
            var g = new Model.Group(user);
            socket.emit("joinedGroup", g.id);

            socket.emit("users", g.getAllLogin());
        });

        //Client is asking to join a group
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

        //Client broadcast an event
        socket.on("event", function(e) {
            nbEventsPerSecond++;
            if(typeof user.group != 'undefined') {
                if(e.me == true)
                    io.to(user.group.id).emit("event", e);
                else
                    socket.broadcast.to(user.group.id).emit("event", e);
            }
        });

        //Client is asking to leave a group
        socket.on("leaveGroup", function() {
            if(typeof user.group != 'undefined') {
                user.group.leave(user);
                connectIO.log("[" + socket.user.login + "] left group [" + user.group.id + "]");
            }
        });

        //Client is asking latency
        socket.on("ping", function() {
            socket.emit("pong");
        });

        //Client has been disconnected (socket closed)
        socket.on('disconnect', function () {
            var g = socket.user.group;
            socket.user.disconnect();
            connectIO.log("[" + socket.user.login + "] disconnected");

            if(typeof g != 'undefined')
                socket.broadcast.to(g.id).emit("users", g.getAllLogin());
        });
    });
}

/**
 * Log function
 * TODO: Log in a file
 * @param str String to log
 */
ConnectIO.prototype.log = function(str) {
    console.log(str);
}

module.exports = function(io) {
    return connectIO._init(io);
};