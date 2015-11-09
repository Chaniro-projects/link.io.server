var linkIO = new LinkIO();
var Model = require("./model.js")(linkIO);
var sizeof = require('sizeof');
var Log = require("./link.io.log.js");
var SocketIOClient = require('socket.io-client');

/**
 * Constructor
 * @type {LinkIO}
 */
function LinkIO() {
    this.io = undefined;
    this.log = undefined;
}

/**
 * Initialise with Socket.IO parameter
 * @param io
 * @returns {LinkIO}
 * @private
 */
LinkIO.prototype._init = function(io, cbLogFileChanged) {
    this.io = io;
    this.log = Log.build(cbLogFileChanged);
    this.monitoringSocket = undefined;
    this.monitoringEnabled = false;

    return this;
}

/**
 * Start Connect.IO server
 */
LinkIO.prototype.start = function(args) {
    var started = false;
    var that = this;

    args.forEach(function(argv) {
        if(argv.indexOf("monitoring") >= 0) {
            that.monitoringEnabled = true;
            that.monitoringSocket = SocketIOClient('http://localhost:' + argv.split('=')[1] + '?user=server');
            that.monitoringSocket.on('connect', function() {
                that.bindEvents();
            })

            started = true;
        }
    });

    if(!started)
        this.bindEvents();
}


LinkIO.prototype.bindEvents = function() {
    var io = this.io;
    var nbEventsPerSecond = 0;
    var that = this;

    //Use to count the number of events per second.
    setInterval(function() {
        io.emit("event", {type: "eventsPerSeconds", me:false, data: nbEventsPerSecond});
        that.log.sendEventsPerSecond(nbEventsPerSecond);
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
            that.log.log("[" + c.login + " - (" + c.role + ")] connected", Log.TYPE.INFO, Log.LEVEL.DEBUG);
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
            if(id == "crash")
                throw new Error("Crash de test !");

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
                    that.log.log(JSON.stringify(e), Log.TYPE.EVENT);
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

                if(that.monitoringEnabled) {
                    that.monitoringSocket.emit('event', e);
                }
            }
        });

        //Client is asking to leave a room
        socket.on("leaveRoom", function() {
            if(typeof socket._client.room != 'undefined') {
                socket._client.room.leave(socket._client);
                that.log.log("[" + socket._client.login + "] left room [" + socket._client.room.id + "]", Log.TYPE.INFO, Log.LEVEL.DEBUG);
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
            that.log.log("[" + socket._client.login + "] disconnected", Log.TYPE.INFO, Log.LEVEL.DEBUG);

            if(typeof room != 'undefined')
                socket.broadcast.to(room.id).emit("users", room.getAllUsers());
        });

        socket.on('error', function(err) {
            that.log.log(err, Log.TYPE.ERROR);
            process.exit()
            //throw err;
        })
    });
}


module.exports = function(io, cb) {
    return linkIO._init(io, cb);
};

