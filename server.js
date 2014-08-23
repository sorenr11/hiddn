var PORT = process.env.OPENSHIFT_NODEJS_PORT || 8080  
, IPADDRESS = process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1";


var express = require('express');
var HashTable = require('hashes');
var server;
var io;
var app;
// Import our common modules.
var Handlebars = require('./common/handlebars').Handlebars;
var Message = require('./common/models').Message;
var User = require('./common/models').User;
var Key = require('./common/models').Key;


var myHashTable = new HashTable.HashTable();
myHashTable.add(1,"hey");

// Setup a very simple express application.
app = express();
// The client path is for client specific code.
app.use('/client', express.static(__dirname + '/client'));
// The common path is for shared code: used by both client and server.
app.use('/common', express.static(__dirname + '/common'));
// The root path should serve the client HTML.
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/client/index.html');
});



// Our express application functions as our main listener for HTTP requests
// in this example which is why we don't just invoke listen on the app object.
server = require('http').createServer(app);
server.listen(PORT, IPADDRESS);



// Our pool of users.
var users = {
    // The actual list of users.
    list: [],
    // Add a user to the pool. We do not filter for duplicates.
    add: function(user) {
        this.list.push(user);
        io.sockets.emit('user-list', {
            'users': this.list
        });
    },
    // Remove a user from the pool.
    // If the user was actually removed from the pool we return true,
    // otherwise we return false.
    remove: function(user) {
        var index = this.list.indexOf(user);
        if (index != -1) {
            // remove our name from the list and update everyone.
            this.list.splice(index, 1);
            io.sockets.emit('user-list', {
                'users': this.list
            });
            return true;          
        }
        // no user removed
        return false;
    }
};



// List of message templates, compiled as handlebars template functions.
// To keep with the theme, all messages are handlebars functions, even the 
// ones that don't do substitution.
var messages = {
    // Do not expect a context object.
    "welcome": Handlebars.compile('Welcome to Hiddn. This is a secure chat client for temporary and anonymous communication. Begin by either generating a key to host conversations or enter a key you have been given from somewhere to communicate on that key. A new key has already been generated for you currently. Brought to you by Ethan Byrd and some other people.'),
    "invalidRequireName": Handlebars.compile('sorry, you need to tell me your name first.'),
    "invalidNameChange": Handlebars.compile('not sure what you did, but please do not change your username midchat.'),
    // Expect a context object.
    "leftChatroom": Handlebars.compile("{{name}} has left the chatroom."),
    "haveFun": Handlebars.compile('have fun {{name}}.'),
    "hasJoinedRoom": Handlebars.compile('{{name}} has joined the chatroom.'),
    "invalidName": Handlebars.compile('sorry, {{name}} is an invalid username. make sure there are no spaces or bizarre characters in your name (underscores are okay). disconnecting.'),
    "attemptToSendMessage": Handlebars.compile('You have successfully sent a message to the server with the key {{keyData}}'),
    "noMessageForKey": Handlebars.compile('There is no message available for {{key}}.'),
};



// socket.io augments our existing HTTP server instance.
io = require('socket.io').listen(server);
// Called on a new connection from the client. The socket object should be
// referenced for future communication with an explicit client.
io.sockets.on('connection', function (socket) {
    
    //the key? for this socket?
    var key = Key();


    // The username for this socket.
    var user = User();
    // Cleans up a bit when we disconnect.
    var disconnectSocket = function() {
        var wasUserRemoved = users.remove(user);
        if (user.name && wasUserRemoved) {
            io.sockets.emit('chat', Message(messages.leftChatroom(user)));
        }
        // We let the client deliver the final response.
        socket.disconnect();
    };
    
    key.keyData = "this_is_a_key";
    
    // Welcome message.
    socket.emit('chat', Message(messages.welcome()));
    //socket.emit('chat', Message(messages.attemptToSendMessage(key)));
    
    
    
    // Set up listeners on the server side.
    socket.once('disconnect', function() {
        // Respond if the client side voluntarily disconnects, but respond
        // only once. It appears that disconnecting will fire more disconnect
        // messages, whether from the client or server. So respond once and
        // only once for each client.
        disconnectSocket();
    });

    socket.on('get_messages', function(data){
        //ask the server to get messages from the hashtable and then give them to you
        //not sure what to do about the age thing
        //var tempMessage = myHashTable.get(data.key).value;
        //var tempMessage = data.key;
        //var tempkey = Key();
        //tempkey.keyData = "this_is_a_key";
        //tempKey.keyData = data.key;

        //if (myHashTable.get(data.key).value != null) {
        //    tempMessage = myHashTable.get(data.key).value;
        //}

        if (myHashTable.get(data.key) == null) {
           socket.emit('chat', Message(messages.noMessageForKey(data)));
        } else {

        socket.emit('chat', Message(myHashTable.get(data.key).value));
        }   
    });


    

    
    socket.on('set-name', function(data){
        // Allows a user to set their username.
        // Very simple username. Must be alphanumeric characters, no spaces.
        user.name = data.username;
        if (user.isValid()) {
            users.add(user);
            // Update the chatroom.
            socket.emit('chat', Message(messages.haveFun(user)));
            io.sockets.emit('chat', Message(messages.hasJoinedRoom(user)));
        }
        else {
            socket.emit('chat', Message(messages.invalidName(user), User('server'), 'error'));
            disconnectSocket();
        }
    });
    
    
    
    socket.on('chat', function (data) {
        // Message passed by a client to the server with the intent of
        // broadcasting to the chatroom.
        console.log("******A message has been sent. ",io.sockets.clients().length," have connected so far.");
        key.keyData = data.key;
        socket.emit('chat', Message(messages.attemptToSendMessage(key)));
        //if (data.user && data.user.name == user.name) {
        //    io.sockets.emit('chat', Message(data.message, user, "chat"));
        myHashTable.add(data.key, data.message, true);
        //}
        //else if (!user.name) {
            // Do not allow people to communicate without having a saved user
            // name.
        //    socket.emit('chat', Message(messages.invalidRequireName(), User('server'), 'error'));
        //    disconnectSocket();
        //}
        //else {
            // Do not allow people to change their name in the request alone
            // on this socket. (Example of a very pathetic amount of security).
            //socket.emit('chat', Message(messages.invalidNameChange(), User('server'), 'error'));
            //disconnectSocket();
        //}
    });
});
