var linkIO = new LinkIO();
var Model = require("./model.js")(linkIO);
var Log = require("./link.io.log.js");
var SocketIOClient = require('socket.io-client');
var fs = require('fs');

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
                that.bindEvents(true);
            })

            started = true;
        }
    });

    if(!started)
        this.bindEvents(false);
}


LinkIO.prototype.bindEvents = function(monitoring) {
    var io = this.io;
    var that = this;

    //Use to count the number of events per second.
    setInterval(function() {
        if(monitoring) {
            //send monitoring data
            that.monitoringSocket.emit('monitoring', {
                nbClients: Model.clients.length,
                nbRoom: Model.rooms.length
            });
        }
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

            if(typeof socket.handshake.query.id != 'undefined') {
                socket.leave(socket.id);
                socket.id = socket.handshake.query.id;
                socket.join(socket.handshake.query.id);
            }

            socket._client = c;
            that.log.log("[" + c.login + " - ("
                + (typeof c.role != 'undefined' ? c.role : "_")
                + "/"
                + socket.id
                + ")] connected", Log.TYPE.INFO, Log.LEVEL.DEBUG);
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

        socket.on("getAllRooms", function(callback) {
            if(typeof callback != 'undefined') {
                var rooms = [];
                Model.rooms.forEach((function(r) {
                    rooms.push(r.toObject());
                }));
                that.log.log("getAllRooms: " + rooms.length, Log.TYPE.INFO, Log.LEVEL.DEBUG);
                callback(rooms);
            }
        });

        // Client send an event to a list of Id's
        socket.on("eventToList", function(e) {
            if(typeof e.idList != 'undefined') {
                e.idList.forEach(function(clientID) {
                    socket.broadcast.to(clientID).emit("event", e);
                    that.log.log(JSON.stringify(e), Log.TYPE.EVENT);
                })

                if(that.monitoringEnabled) {
                    that.monitoringSocket.emit('event', e);
                }
            }
        });

        //Client broadcast an event
        socket.on("event", function(e) {
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

        //Client send file
        socket.on("upload.start", function(fileName, eventName, nbChunk, validity, cb) {
            var fileID = generateFileID(20);
            socket.upload = {
                id: fileID,
                fileName: fileName,
                eventName: eventName,
                validity: validity,
                to: "*",
                stream: fs.createWriteStream("files/" + fileID),
                start: new Date()
            };
            that.log.log("Start upload " + nbChunk + " chunks", Log.TYPE.INFO, Log.LEVEL.DEBUG);
            cb(fileID);
        });
        socket.on("upload.chunk", function(chunk) {
            socket.upload.stream.write(chunk);
        });
        socket.on("upload.end", function() {
            var total = new Date().getTime() - socket.upload.start.getTime();
            that.log.log("End upload in " + (total/1000) + "s.", Log.TYPE.INFO, Log.LEVEL.DEBUG);
            socket.upload.stream.end();
            delete socket.upload;
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
            process.exit();
            //throw err;
        })
    });
}


module.exports = function(io, cb) {
    return linkIO._init(io, cb);
};

function generateFileID(count) {
    var _sym = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    var str = '';

    for(var i = 0; i < count; i++) {
        str += _sym[parseInt(Math.random() * (_sym.length))];
    }

    return str;
}

