/***********************************/
/******** Connect.IO model *********/
/***********************************/
var model = new Model();

function Model() {
     this.clients = [];
     this.rooms = [];
     this.linkIO = undefined;
}

Model.prototype._init = function(cIO) {
     this.linkIO = cIO;
     return this;
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
model.Client = function(l, r, s) {
     this.socket = s;
     this.login = l;
     this.role = r;
     this.room = undefined;

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
          g.users.push(this);
          this.socket.join(g.id);
          model.linkIO.log("[" + this.login + " - (" + this.role + ")] joined room [" + g.id + "]");

          return g;
     }
     else
          return new model.Room(this, id);
}

/**
 * Disconnect the user
 */
model.Client.prototype.disconnect = function() {
     var that = this;
     for(var j = 0; j<model.rooms.length; j++) {
          model.rooms[j].leave(that);
     };
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
model.Room = function(user, id) {
     this.id = id;
     this.users = [user];

     if(typeof this.id == 'undefined')
          this.id = model.Room.generateID();

     user.room = this;
     user.socket.join(this.id);
     model.rooms.push(this);

     model.linkIO.log("[" + user.login + " - (" + user.role + ")] created and joined room [" + this.id + "]");
}

/**
 * Get all user logins in this room
 * @returns {Array} Logins
 */
model.Room.prototype.getAllLogin = function() {
     var ret = [];
     for(var i = 0; i<this.users.length; i++)
          ret.push(this.users[i].login);
     return ret;
}

/**
 * Remove an user from this room
 * @param user User
 */
model.Room.prototype.leave = function(user) {
     for(var i = 0; i< this.users.length; i++) {
          if(this.users[i].login == user.login)
               this.users.splice(i, 1);
     }

     if(this.users.length == 0) {
          for(var i = 0; i<model.rooms.length; i++) {
               if(model.rooms[i].id == this.id) {
                    model.rooms.splice(i, 1);
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
     for(var i = 0; i<model.rooms.length; i++) {
          if(model.rooms[i].id == id)
               return model.rooms[i];
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
     model.rooms.forEach(function(g) {
          if(g.id === id)
               return true;
     });
     return false;
}


module.exports = function(cIO) {
     return model._init(cIO);
};