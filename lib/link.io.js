var linkIO = new LinkIO();
var Model = require("./model.js")(linkIO);
var Log = require("./link.io.log.js");
var SocketIOClient = require('socket.io-client');
var fs = require('fs');
var sizeof = require('sizeof');

/**
 * MongoDB
 */

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/linkio');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function(){});

/**
 * Application
 */

var applicationSchema = new mongoose.Schema({
    name : String,
    api_key : String,
    roles : [ { name : String, is_default : Boolean, users : [String], rights : [ ] } ]
});
var applicationModel = mongoose.model('application', applicationSchema, 'application');

/**
 * User
 */

var userSchema = new mongoose.Schema({
    name : String,
    fname : String,
    mail : String,
    password : String,
    api_role : String
});

var usersModel = mongoose.model('user', userSchema, 'user');

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
	
	var createApplications = applicationModel.find();
    createApplications.exec(function (err, applications){
        if (err) throw err;
        for(var i = 0; i < applications.length; i++){
            var g = new Model.Application(applications[i].api_key, applications[i].name);
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
                nbClients: Model.clients.length
            });
        }
    }, 1000);

    //Connection checking function
    io.use(function(socket, next) {
        var checkingUser = usersModel.find({"mail" : socket.handshake.query.mail, "password" : socket.handshake.query.password});
        checkingUser.exec(function (err, users) {
            if (err) {
                throw err;
            }
			if (users.length == 1) {
				var checkingConnection = applicationModel.find();
				checkingConnection.exec(function (err, applications) {
					if(err) {
						throw err;
					}
					var defaultRole = true;
					for(var j = 0; j < applications.length; j++) {
						if(applications[j].api_key == socket.handshake.query.api_key){
							for(var k = 0; k < applications[j].roles.length; k++){
								for(var l = 0; l < applications[j].roles[k].users.length; l++){
									if(applications[j].roles[k].users[l] == socket.handshake.query.mail){
										for(var m = 0; m < applications[j].roles[k].rights.length; m++){
											if(applications[j].roles[k].rights[m][0] == "CONNECT"){
												var r = [];
												for(var n = 0; n < applications[j].roles[k].rights.length; n++){
													r.push([applications[j].roles[k].rights[n][0],applications[j].roles[k].rights[n][1]]);
												}
												var c = new Model.Client(
													socket.handshake.query.mail,
													users[0].name,
													users[0].fname,
													applications[j].roles[k].name,
													socket,
													r,
													socket.handshake.query.api_key,
                                                    applications[j].name
												);
												defaultRole = false;
												socket._client = c;
												that.log.log("[" + c.mail + " - (" + c.application + "|" + c.role + ")] connected", Log.TYPE.INFO, Log.LEVEL.DEBUG);
												next();
											}
										}
									}
								}
							}
							if(defaultRole){
								for(var k = 0; k < applications[j].roles.length; k++){
										if(applications[j].roles[k].is_default){
											for(var m = 0; m < applications[j].roles[k].rights.length; m++){
												if(applications[j].roles[k].rights[m][0] == "CONNECT"){
													var r = [];
													for(var n = 0; n < applications[j].roles[k].rights.length; n++){
														r.push([applications[j].roles[k].rights[n][0],applications[j].roles[k].rights[n][1]]);
													}
													var c = new Model.Client(
														socket.handshake.query.mail,
														users[0].name,
														users[0].fname,
														applications[j].roles[k].name,
														socket,
														r,
														socket.handshake.query.api_key,
                                                        applications[j].name
													);
													defaultRole = false;
													socket._client = c;
                                                    that.log.log("[" + c.mail + " - (" + c.application + "|" + c.role + ")] connected", Log.TYPE.INFO, Log.LEVEL.DEBUG);
													next();
												}
											}

									}
								}
							}
						}
					}
				});
			}
        });
    });

    //New client connected
    io.on('connection', function(socket){

        socket.emit("info", {
            id: socket.id,
            name: socket._client.name,
            firstname: socket._client.fname,
            mail: socket._client.mail,
            role: socket._client.role
        });


        //Client is asking to create a new room
        socket.on("createRoom", function(callback) {

            for(var i = 0; i < socket._client.rights.length; i++){
                if(socket._client.rights[i][0] == "CREATE_ROOM"){
                    var room = new Model.Room(socket._client, socket._client.api_key);

                    //Return the generated room id
                    if (typeof callback != 'undefined')
                        callback(room.id);
                }
            }
        });

        //Client is asking to join a room
        socket.on("joinRoom", function(id, callback) {
            if(id == "crash")
                throw new Error("Crash de test !");
            if (typeof socket._client.room != 'undefined') {
                if (socket._client.room.id == id)
                    return;
                socket._client.room.leave(socket._client);
            }
            for(var i = 0; i < socket._client.rights.length; i++){
                if(socket._client.rights[i][0] == "JOIN_ROOM"){
                    var room = socket._client.joinRoom(id);
                    if (typeof  room != 'undefined') {
                        //Return the room id and users currently in this room
                        callback(room.id, room.getAllUsers());
                        socket.broadcast.to(room.id).emit("users", room.getAllUsers());
                    }
                }
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
            for(var i = 0; i < socket._client.rights.length; i++){
                if(socket._client.rights[i][0] == "SEND_MESSAGE"){
                    if (typeof e.idList != 'undefined') {
                        e.idList.forEach(function (clientID) {
                            socket.broadcast.to(clientID).emit("event", e);
                            that.log.log(JSON.stringify(e), Log.TYPE.EVENT);
                        })
						if(that.monitoringEnabled) {
							that.monitoringSocket.emit('event', e);
						}
                    }
                }
            }
        });
		
		// Client send an event to a role
        socket.on("eventToRole", function(e) {
            for(var i = 0; i < socket._client.rights.length; i++){
                if(socket._client.rights[i][0] == "SEND_MESSAGE"){
                    if (typeof e.role != 'undefined') {
                        socket._client.room.getAllUsersByRole(e.role).forEach(function (user) {
                            socket.broadcast.to(user.socket.id).emit("event", e);
                            that.log.log(JSON.stringify(e), Log.TYPE.EVENT);
                        })
						
						if(that.monitoringEnabled) {
							that.monitoringSocket.emit('event', e);
						}
                    }
                }
            }
        });

        //Client broadcast an event
        socket.on("event", function(e) {
            for(var i = 0; i < socket._client.rights.length; i++){
                if(socket._client.rights[i][0] == "SEND_MESSAGE"){
                    if (typeof socket._client.room != 'undefined') {
                        if (e.me == true)
                            io.to(socket._client.room.id).emit("event", e);
                        else
                            socket.broadcast.to(socket._client.room.id).emit("event", e);

                        if (that.monitoringEnabled) {
                            that.monitoringSocket.emit('event', e);
                        }
                    }
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
                that.log.log("[" + socket._client.mail + "] left room [" + socket._client.room.id + "]", Log.TYPE.INFO, Log.LEVEL.DEBUG);
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
            that.log.log("[" + socket._client.mail + "] disconnected", Log.TYPE.INFO, Log.LEVEL.DEBUG);

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
