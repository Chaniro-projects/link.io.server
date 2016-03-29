var linkIO = new LinkIO();
var Model = require("./model.js")(linkIO);
var sizeof = require('sizeof');
var Log = require("./link.io.log.js");
var SocketIOClient = require('socket.io-client');

/**
 * MongoDB
 */

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/linkio');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'coonection error:'));
db.once('open', function(){});

/**
 * Application
 */

var applicationSchema = new mongoose.Schema({
    name : String,
    api_key : String,
    roles : [ { name : String, mails : [String], rights : [String] } ]
});
var applicationModel = mongoose.model('applications', applicationSchema);

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

var usersModel = mongoose.model('users', userSchema);

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

    var createApplications = applicationModel.find();
    createApplications.exec(function (err, applications){
        if (err) throw err;
        for(var i = 0; i < applications.length; i++){
            var g = new Model.Application(applications[i].api_key, applications[i].name);
            console.log("Application " + g.name +  " created");
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

        var checkingUser = usersModel.find();
        checkingUser.exec(function (err, users) {
            if (err) {
                throw err;
            }
            for (var i = 0; i < users.length; i++) {
                if (users[i].mail == socket.handshake.query.mail && users[i].password == socket.handshake.query.password) {
                    var checkingConnection = applicationModel.find();
                    checkingConnection.exec(function (err, applications) {
                        if(err) {
                            throw err;
                        }
                        for(var j = 0; j < applications.length; j++) {
                            if(applications[j].api_key == socket.handshake.query.api_key){
                                for(var k = 0; k < applications[j].roles.length; k++){
                                    for(var l = 0; l < applications[j].roles[k].mails.length; l++){
                                        if(applications[j].roles[k].mails[l] == socket.handshake.query.mail){
                                            for(var m = 0; m < applications[j].roles[k].rights.length; m++){
                                                if(applications[j].roles[k].rights[m] == "CONNECT"){
                                                    var c = new Model.Client(
                                                        socket.handshake.query.mail,
                                                        applications[j].roles[k].name,
                                                        socket,
                                                        applications[j].roles[k].rights,
                                                        socket.handshake.query.api_key
                                                    );
                                                    socket._client = c;
                                                    that.log.log("[" + c.login + " - (" + c.role + ")] connected", Log.TYPE.INFO, Log.LEVEL.DEBUG);
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
            }
        });
    });

    //New client connected
    io.on('connection', function(socket){

        //Client is asking to create a new room
        socket.on("createRoom", function(callback) {

            for(var i = 0; i < socket._client.rights.length; i++){
                if(socket._client.rights[i] == "CREATE_ROOM"){
                    var room = new Model.Room(socket._client, socket._client.api_key);
                    console.log(room);

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
                if(socket._client.rights[i] == "JOIN_ROOM"){
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

        // Client send an event to a list of Id's
        socket.on("eventToList", function(e) {
            for(var i = 0; i < socket._client.rights.length; i++){
                if(socket._client.rights[i] == "SEND_EVENT_LIST"){
                    if (typeof e.idList != 'undefined') {
                        e.idList.forEach(function (clientID) {
                            socket.broadcast.to(clientID).emit("event", e);
                            that.log.log(JSON.stringify(e), Log.TYPE.EVENT);
                        })
                    }
                }
            }
        });

        //Client broadcast an event
        socket.on("event", function(e) {
            nbEventsPerSecond++;

            for(var i = 0; i < socket._client.rights.length; i++){
                if(socket._client.rights[i] == "SEND_EVENT_EVERYBODY"){
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

