var Log = require("./link.io.log.js");

/***********************************/
/******** Connect.IO model *********/
/***********************************/
var model = new Model();

function Model() {
     this.clients = [];
     this.linkIO = undefined;
	 this.applications = [];
}

Model.prototype._init = function(cIO) {
     this.linkIO = cIO;
     return this;
}

/************************/
/******* APPLICATION ****/
/************************/

model.Application = function(id, n) {
     this.api_key = id;
     this.rooms = [];
     this.name = n;

     model.applications.push(this);
}

/************************/
/******* CLIENT *********/
/************************/

/**
 * Constructor
 * @param l Login as string
 * @param r Role as string
 * @param s Socket (Socket.IO)
 * @constructor
 */
model.Client = function(l, name, fname, r, s, rights, api_key, appName) {
     this.socket = s;
     this.mail = l;
     this.name = name;
     this.fname = fname;
     this.role = r;
     this.room = undefined;
     this.api_key = api_key;
     this.rights = rights;
     this.application = appName;

     model.clients.push(this);
}

/**
 * Join a room.
 * If the room doesn't exist, it will create it with the given ID and join it.
 * @param id Room identifier as string
 * @returns {Model.Room} The joined room
 */
model.Client.prototype.joinRoom = function(id) {
     var g = model.Room.findByID(id);

     if(typeof g != 'undefined') {
          this.room = g;
          this.api_key = g.api_key;
          g.users.push(this);
          this.socket.join(g.id);
          model.linkIO.log.log("[" + this.mail + " - (" + this.role + ")] joined room [" + g.id + "]", Log.TYPE.INFO, Log.LEVEL.DEBUG);

          return g;
     }
     else {
          var r = new model.Room(this, this.api_key, id);
          for (var i = 0; i < model.applications.length; i++){
               if (model.applications[i].api_key == this.api_key){
                    model.applications[i].rooms.push(r);
                    return r;
               }
          }
     }
}

/**
 * Disconnect the user
 */
model.Client.prototype.disconnect = function() {
     var that = this;
     for(var i = 0; i<model.applications.length; i++) {
          for(var j = 0; j<model.applications[i].rooms.length; j++) {
               model.applications[i].rooms[j].leave(that);
          }
     }
}

/**
 * Get an user from the Socket.IO socket object
 * @param socket
 */
model.Client.getFromSocket = function(socket) {
     model.clients.forEach(function(c) {
          if(socket.id == c.socket.id)
               return c;
     })
}



/************************/
/******** GROUP *********/
/************************/

//All characters available for the room ID
var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Constructor
 * @param user The first user in this new room
 * @param id Unique identifier as string
 * @constructor
 */
model.Room = function(user, api_key, id) {
     this.id = id;
     this.users = [user];
     this.api_key = api_key;

     if(typeof this.id == 'undefined')
          this.id = model.Room.generateID();

     user.room = this;
     user.socket.join(this.id);
     for(var i = 0; i < model.applications.length; i++){
          if(model.applications[i].api_key == api_key){
               model.applications[i].rooms.push(this);
          }
     }
     model.linkIO.log.log("[" + user.mail + " - (" + user.role + ")] created and joined room [" + this.id + "]", Log.TYPE.INFO, Log.LEVEL.DEBUG);
}

/**
 * Get all user logins in this room
 * @returns {Array} Logins
 */
model.Room.prototype.getAllLogin = function() {
     var ret = [];
     for(var i = 0; i<this.users.length; i++)
          ret.push(this.users[i].mail);
     return ret;
}

model.Room.prototype.toObject = function() {
     return {
          id: this.id,
          nbUser: this.users.length
     };
}

/**
 * Get all users in this room
 * @returns {Array[{mail,id}]} Users
 */
model.Room.prototype.getAllUsers = function() {
      var ret = [];
      for(var i = 0; i<this.users.length; i++)
           ret.push({
                mail: this.users[i].mail,
                id: this.users[i].socket.id,
                name: this.users[i].name,
                fname: this.users[i].fname,
                role: this.users[i].role
           });
      return ret;
}

/**
 * Get all users belong to a role in this room
 * @returns {Array[{mail,id}]} Users
 */
model.Room.prototype.getAllUsersByRole = function(role) {
      var ret = [];
      for(var i = 0; i<this.users.length; i++) {
		   if (this.users[i].role == role) {
               ret.push(this.users[i]);
			}
	  }
      return ret;
}

/**
 * Remove an user from this room
 * @param user User
 */
model.Room.prototype.leave = function(user) {
     for(var i = 0; i< this.users.length; i++) {
          if(this.users[i].mail == user.mail)
               this.users.splice(i, 1);
     }

     if(this.users.length == 0) {
          for(var j = 0; j<model.applications.length; j++){
               for(var k = 0; k<model.applications[j].rooms.length; k++) {
                    if(model.applications[j].rooms[k].id == this.id) {
                         model.applications[j].rooms.splice(k, 1);
                    }
               }
          }
     }

     user.socket.leave(this.id);
}

/**
 * Get the room object from his ID
 * @param id
 * @returns {*}
 */
model.Room.findByID = function(id) {
     for(var j = 0; j<model.applications.length; j++){
          for(var i = 0; i<model.applications[j].rooms.length; i++) {
               if(model.applications[j].rooms[i].id == id)
                    return model.applications[j].rooms[i];
          }
     }
}

/**
 * Generate a random identifier for a new room
 * @returns {*}
 */
model.Room.generateID = function() {
     var id;
     do {
          id = "";
          for (var i = 0; i < 4; i++)
               id += possible.charAt(Math.floor(Math.random() * possible.length));
     } while(model.Room.existID(id));

     return id;
}

/**
 * True if this ID is already in use
 * @param id
 * @returns {boolean}
 */
model.Room.existID = function(id) {
     model.applications.forEach(function (f){
          f.rooms.forEach(function(g) {
               if(g.id === id)
                    return true;
          });
     });
     return false;
}


module.exports = function(cIO) {
     return model._init(cIO);
};
