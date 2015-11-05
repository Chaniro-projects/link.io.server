var linkIO = new LinkIO();
var Model = require("./model.js")(linkIO);
var sizeof = require('sizeof');
var schedule = require('node-schedule');
var fs = require('fs')
    , Log = require('log'),
    log,
    logFileName;

/**
 * Constructor
 * @type {LinkIO}
 */
function LinkIO() {
    this.io = undefined;
    this.onLogFileChanged = function() {};
}

/**
 * Initialise with Socket.IO parameter
 * @param io
 * @returns {LinkIO}
 * @private
 */
LinkIO.prototype._init = function(io, cbLogFileChanged) {
    this.io = io;

    if(typeof cbLogFileChanged != 'undefined')
        this.onLogFileChanged = cbLogFileChanged;

    return this;
}

/**
 * Start Connect.IO server
 */
LinkIO.prototype.start = function() {
    var io = this.io;
    var nbEventsPerSecond = 0;

    updateLogOutput(this);

    //Change log file everyday at 0:00 AM
    schedule.scheduleJob('0 0 * * *', function(){
        updateLogOutput(this);
    });


    //Use to count the number of events per second.
    setInterval(function() {
        io.emit("event", {type: "eventsPerSeconds", me:false, data: nbEventsPerSecond});
        nbEventsPerSecond = 0;
    }, 1000);

    //Connection checking function
    io.use(function(socket, next) {
        //TODO: check user in DB
        if(true /*socket.handshake.query.user == 'root' && socket.handshake.query.password == 'root'*/) {
            var c = new Model.Client(
                socket.handshake.query.user,
                socket.handshake.query.role,
                socket
            );
<<<<<<< HEAD
            socket._client = c;
            linkIO.log("[" + socket._client.login + "] connected");
=======
            socket.user = u;
            linkIO.log("[" + u.login + "  - (" + u.role + ")] connected");
>>>>>>> refs/remotes/origin/feature/LoginAndRole
            next();
        }
        else
            next(new Error('Authentication error'));
    });

    //New client connected
    io.on('connection', function(socket){

        //Client is asking to create a new room
        socket.on("createRoom", function(callback) {
            var room = new Model.Room(socket._client);

            //Return the generated room id
            if(typeof callback != 'undefined')
                callback(room.id);
        });

        //Client is asking to join a room
        socket.on("joinRoom", function(id, callback) {
            if(typeof socket._client.room != 'undefined') {
                if(socket._client.room.id == id)
                    return;
                socket._client.room.leave(user);
            }

            var room = socket._client.joinRoom(id);
            if(typeof  room != 'undefined') {
                //Return the room id and users currently in this room
                callback(room.id, room.getAllUsers());
                socket.broadcast.to(room.id).emit("users", room.getAllUsers());
            }
        });

        //Client is asking to get all users (as [ {login,id} ])
        socket.on("getAllUsers", function(callback) {
            if(typeof callback != 'undefined') {
                if (typeof socket._client.room != 'undefined') {
                    callback(socket._client.room.getAllUsers());
                } else {
                    callback([]);
                }
            }
        });

        // Client send an event to a list of Id's
        socket.on("eventToList", function(e) {
            if(typeof e.idList != 'undefined') {
                e.idList.forEach(function(clientID) {
                    socket.broadcast.to(clientID).emit("event", e);
                })
            }
        });

        //Client broadcast an event
        socket.on("event", function(e) {
            nbEventsPerSecond++;
            if(typeof socket._client.room != 'undefined') {
                if(e.me == true)
                    io.to(socket._client.room.id).emit("event", e);
                else
                    socket.broadcast.to(socket._client.room.id).emit("event", e);
            }
        });

        //Client is asking to leave a room
        socket.on("leaveRoom", function() {
            if(typeof socket._client.room != 'undefined') {
                socket._client.room.leave(socket._client);
                linkIO.log("[" + socket._client.login + "] left room [" + socket._client.room.id + "]");
            }
        });

        //Client is asking latency
        socket.on("ping", function(callback) {
            if(typeof callback != 'undefined')
                callback();
        });

        //Client has been disconnected (socket closed)
        socket.on('disconnect', function () {
            var room = socket._client.room;
            socket._client.disconnect();
            linkIO.log("[" + socket._client.login + "] disconnected");

            if(typeof room != 'undefined')
                socket.broadcast.to(room.id).emit("users", room.getAllUsers());
        });
    });
}

/**
 * Open a new log file
 */
function updateLogOutput(linkIO) {
    var now = new Date();
    logFileName = (now.getMonth()+1) + '_' + now.getDate() + '_'  + now.getFullYear() + '.log';
    log = new Log('debug', fs.createWriteStream(__dirname + "/../log/" + logFileName, {'flags': 'a'}));
    linkIO.onLogFileChanged(logFileName);
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

module.exports = function(io, cb) {
    return linkIO._init(io, cb);
};
