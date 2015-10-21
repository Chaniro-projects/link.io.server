/***********************************/
/******** Connect.IO model *********/
/***********************************/
var model = new Model();

function Model() {
     this.clients = [];
     this.groups = [];
     this.connectIO = undefined;
}

Model.prototype._init = function(cIO) {
     this.connectIO = cIO;
     return this;
}

/************************/
/******* CLIENT *********/
/************************/

/**
 * Constructor
 * @param l Login as string
 * @param s Socket (Socket.IO)
 * @constructor
 */
model.Client = function(l, s) {
     this.socket = s;
     this.login = l;
     this.group = undefined;

     model.clients.push(this);
}

/**
 * Join a group.
 * If the group doesn't exist, it will create it with the given ID and join it.
 * @param id Group identifier as string
 * @returns {Model.Group} The joined group
 */
model.Client.prototype.joinGroup = function(id) {
     var g = model.Group.findByID(id);
     if(typeof g != 'undefined') {
          this.group = g;
          g.users.push(this);
          this.socket.join(g.id);
          model.connectIO.log("[" + this.login + "] joined group [" + g.id + "]");

          return g;
     }
     else
          return new model.Group(this, id);
}

/**
 * Disconnect the user
 */
model.Client.prototype.disconnect = function() {
     var that = this;
     for(var j = 0; j<model.groups.length; j++) {
          model.groups[j].leave(that);
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

//All characters available for the group ID
var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Constructor
 * @param user The first user in this new group
 * @param id Unique identifier as string
 * @constructor
 */
model.Group = function(user, id) {
     this.id = id;
     this.users = [user];

     if(typeof this.id == 'undefined')
          this.id = model.Group.generateID();

     user.group = this;
     user.socket.join(this.id);
     model.groups.push(this);

     model.connectIO.log("[" + user.login + "] joined group [" + this.id + "]");
}

/**
 * Get all user logins in this group
 * @returns {Array} Logins
 */
model.Group.prototype.getAllLogin = function() {
     var ret = [];
     for(var i = 0; i<this.users.length; i++)
          ret.push(this.users[i].login);
     return ret;
}

/**
 * Remove an user from this group
 * @param user User
 */
model.Group.prototype.leave = function(user) {
     for(var i = 0; i< this.users.length; i++) {
          if(this.users[i].login == user.login)
               this.users.splice(i, 1);
     }

     if(this.users.length == 0) {
          for(var i = 0; i<model.groups.length; i++) {
               if(model.groups[i].id == this.id) {
                    model.groups.splice(i, 1);
               }
          }
     }

     user.socket.leave(this.id);
}

/**
 * Get the group object from his ID
 * @param id
 * @returns {*}
 */
model.Group.findByID = function(id) {
     for(var i = 0; i<model.groups.length; i++) {
          if(model.groups[i].id == id)
               return model.groups[i];
     }
}

/**
 * Generate a random identifier for a new group
 * @returns {*}
 */
model.Group.generateID = function() {
     var id;
     do {
          id = "";
          for (var i = 0; i < 4; i++)
               id += possible.charAt(Math.floor(Math.random() * possible.length));
     } while(model.Group.existID(id));

     return id;
}

/**
 * True if this ID is already in use
 * @param id
 * @returns {boolean}
 */
model.Group.existID = function(id) {
     model.groups.forEach(function(g) {
          if(g.id === id)
               return true;
     });
     return false;
}


module.exports = function(cIO) {
     return model._init(cIO);
};