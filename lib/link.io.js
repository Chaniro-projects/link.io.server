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
            socket._client = c;
            linkIO.log("[" + c.login + "  - (" + c.role + ")] connected", linkIO.log.TYPE.INFO, linkIO.log.LEVEL.DEBUG);
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
                socket._client.room.leave(socket._client);
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
                    linkIO.log(JSON.stringify(e), linkIO.log.TYPE.EVENT);
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
                linkIO.log(JSON.stringify(e), linkIO.log.TYPE.EVENT);
            }
        });

        //Client is asking to leave a room
        socket.on("leaveRoom", function() {
            if(typeof socket._client.room != 'undefined') {
                socket._client.room.leave(socket._client);
                linkIO.log("[" + socket._client.login + "] left room [" + socket._client.room.id + "]", linkIO.log.TYPE.INFO, linkIO.log.LEVEL.DEBUG);
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
            linkIO.log("[" + socket._client.login + "] disconnected", linkIO.log.TYPE.INFO, linkIO.log.LEVEL.DEBUG);

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
 * @param type log's TYPE
 * @param level log's LEVEL
 */
LinkIO.prototype.log = function(str, type, level) {

    // Print depends of the type
    if(type == this.log.TYPE.INFO)
        console.log(type.name + ' ' + level.name + ' ' + str);
    else
        console.log(type.name + ' ' + str);

    //Put only INFO log into file
    if(type == this.log.TYPE.INFO && level != 'undefined')
        log.debug(level.name + ' ' + str.name);
}

/* TO COMMENT */
LinkIO.prototype.log.TYPE = {
    INFO : {value: 0, name: "INFO"},
    EVENT: {value: 1, name: "EVENT"}
};

/* TO COMMENT */
LinkIO.prototype.log.LEVEL = {
    DEBUG  : {value: 1, name: "DEBUG"},
    WARNING: {value: 2, name: "WARNING"},
    ERROR  : {value: 3, name: "ERROR"}
};

module.exports = function(io, cb) {
    return linkIO._init(io, cb);
};
