var linkIO = new LinkIO();
var Model = require("./model.js")(linkIO);
var sizeof = require('sizeof');
var schedule = require('node-schedule');
var fs = require('fs')
    , Log = require('log'), log;

/**
 * Constructor
 * @type {LinkIO}
 */
function LinkIO() {
    this.io = undefined;
}

/**
 * Initialise with Socket.IO parameter
 * @param io
 * @returns {LinkIO}
 * @private
 */
LinkIO.prototype._init = function(io) {
    this.io = io;
    return this;
}

/**
 * Start Connect.IO server
 */
LinkIO.prototype.start = function() {
    var io = this.io;
    var nbEventsPerSecond = 0;

    updateLogOutput();

    //Change log file everyday
    var cron = schedule.scheduleJob('0 0 * * *', function(){
        updateLogOutput();
    });


    //Use to count the number of events per second.
    setInterval(function() {
        //io.emit("event", {type: "eventsPerSeconds", me:false, data: nbEventsPerSecond});
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
            linkIO.log("[" + u.login + "] connected");
            next();
        }
        else
            next(new Error('Authentication error'));
    });

    //New client connected
    io.on('connection', function(socket){
        var user = socket.user;

        //Client is asking to create a new room
        socket.on("createGroup", function(rights) {
            var g = new Model.Room(user);
            socket.emit("joinedGroup", g.id);

            socket.emit("users", g.getAllLogin());
        });

        //Client is asking to join a room
        socket.on("joinRoom", function(id) {
            if(typeof user.room != 'undefined') {
                if(user.room.id == id)
                    return;
                user.room.leave(user);
            }

            var g = user.joinRoom(id);
            if(typeof  g != 'undefined') {
                io.to(id).emit("users", g.getAllLogin());
                socket.emit("joinedGroup", g.id);
            }
        });

        //Client is asking to get all users (as [ {login,id} ])
        socket.on("getAllUsers", function() {
            if(typeof user.room != 'undefined') {
                socket.emit("gotAllUsers", {users:user.room.getAllUsers()});
            }else{
                socket.emit("gotAllUsers", {users:[]});
            }
        });

        // Client send an even to a list of Id's
        socket.on("eventToList", function(e) {
            for (c in e.idList) {
                socket.broadcast.to(c).emit("eventToList", e);
            }
        });

        //Client broadcast an event
        socket.on("event", function(e) {
            nbEventsPerSecond++;
            if(typeof user.room != 'undefined') {
                if(e.me == true)
                    io.to(user.room.id).emit("event", e);
                else
                    socket.broadcast.to(user.room.id).emit("event", e);
            }
        });

        //Client is asking to leave a room
        socket.on("leaveGroup", function() {
            if(typeof user.room != 'undefined') {
                user.room.leave(user);
                linkIO.log("[" + socket.user.login + "] left room [" + user.room.id + "]");
            }
        });

        //Client is asking latency
        socket.on("ping", function() {
            socket.emit("pong");
        });

        //Client has been disconnected (socket closed)
        socket.on('disconnect', function () {
            var g = socket.user.room;
            socket.user.disconnect();
            linkIO.log("[" + socket.user.login + "] disconnected");

            if(typeof g != 'undefined')
                socket.broadcast.to(g.id).emit("users", g.getAllLogin());
        });
    });
}

/**
 * Open a new log file
 */
function updateLogOutput() {
    var now = new Date();
    log = new Log('debug', fs.createWriteStream(__dirname + "/../log/" + (now.getMonth()+1) + '_' + now.getDate() + '_'  + now.getFullYear() + '.log'));
}

/**
 * Log function
 * TODO: Log in a file
 * @param str String to log
 */
LinkIO.prototype.log = function(str) {
    console.log(str);
    log.debug(str);
}

module.exports = function(io) {
    return linkIO._init(io);
};
