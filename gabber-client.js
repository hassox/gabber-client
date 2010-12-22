// Global namespace
GabberTalk = {version: '0.1.0' };
if( typeof GabberEnv === 'undefined' ){
	GabberEnv  = {};
}

(function(){
	// scoped variables for use in closures
	var cachedUsername,
			cachedEmail;

	if ( !GabberEnv.host ){
		GabberEnv.host = "chat.gabbertalk.com"; // it is only useful to set host in development of the gabbertalk server. Never do this in general
	}

	GabberTalk.isLoaded      = false; // Tracks if GabberTalk and dependent scripts are all loaded
	GabberTalk.isConnected   = false; // Checks if GabberTalk is connected
	GabberTalk.loadTimeOut   = 5000;  // Proivdes the timeout for gabbertalk to be loaded (including all dependent files)
	GabberTalk.eventHandlers = {};    // The collection of the event handlers that have been setup
	GabberTalk.currentUser   = null;  // Provides access to the current user if known
	GabberTalk.logEnabled    = true;  // Enables logging if supported
	GabberTalk.filters       = {send: {}, receive: {}};    // Filters for sending and receiving messages


	// Sends a message to the server.  Server recognized messages are
	//   'message'        - a room comment (stored on the server)
	//   'nickChange'     - the current user is changing nicks
	//   'recentMessage' - Requests the server to send down the recent comments (one at a time).  Not broadcast
	//   'userList'       - Requests a user list.  Not broadcast
	// All other messages are passed untouched to all clients attached to the room
	// They are not however stored
	//
	// @return boolean
	GabberTalk.sendMessage = function(type, data){
		throw "GabberTalk not Connected"; // will be implemented in the connect function
	};

	// Claims a nickname for the current user in the room
	// The email is used for gravatar lookup
	GabberTalk.claimNick = function(_name, _email){
		cachedUsername = _name;
		cachedEmail = _email;
		GabberTalk.sendMessage('nickChange', {username: _name, email: _email});
	};

	GabberTalk.recentMessages = function(){
		GabberTalk.sendMessage('recentMessages', {});
	};

	GabberTalk.persistentMessage = function(text){
		GabberTalk.sendMessage('message', {type: 'message', body: text});
	};

	GabberTalk.clientList = function(){
		GabberTalk.sendMessage('clientList', {type: 'clientList'});
	};

	function fetchFilters(kind, type){
		GabberTalk.filters[kind] = GabberTalk.filters[kind] || {};
		GabberTalk.filters[kind][type] = GabberTalk.filters[kind][type] || [];
		return GabberTalk.filters[kind][type];
	};

	// Applying filters to incomming message
	// Filters work on a message by executing one after another (in defined order) to manipulate
	// The message on it's way through the filters.  The filters could be used to
	//   - activate markup (links?)
	//   - remove swearing
	//   - any purpose decided on by the site
	//
	// If a message is received that should not be handled, simply return false from
	// the function.  The returned value must be false to halt, undefined or null will not halt
	//
	// @example
	//   GabberTalk.receiveFilter('comment', function(data){
	//     if( data.body.match(/bad words/)
	//      return false;
	//   });
	GabberTalk.receiveFilter = function(type, fn){
		fetchFilters('receive', type).push(fn);
		return fn;
	};

	// Apply filters to sent messages
	// These filters can act as a spam mechanism to allow the site to throttle a user
	// Or, to implement a command interface local to the site
	//
	// The operate similary to receive filters, you return false, and the propergation is stopped
	// @example
	//   GabberTalk.sendFilter('comment', function(data){
	//     var match = data.body.match(/^\/([^\s]+) (.*)$/g);
	//     if(match){
	//       handleCommand(match[1], match[2]);
	//       return false;
	//     }
	//    });
	GabberTalk.sendFilter = function(type, fn){
		fetchFilters('send', type).push(fn);
		return fn;
	};

	// Establishes a connection to GabberTalk.
	// connect() is called as part of the setup but may be called after a couldNotConnect if conditions change

	GabberTalk.connect = function(opts){
		GabberTalk.log("Connecting");
		if(opts){
			if (opts.accountId)
				GabberTalk.accountId = opts.accountId;

			if (opts.roomName)
				GabberTalk.roomName = opts.roomName;

			if (opts.host)
				GabberEnv.host = opts.host;
		}

		if( GabberTalk.isConnected )
			return true;

		if (!GabberTalk.isLoaded){
			GabberTalk.log("Not loaded");
			GabberTalk.onLoad(function(){
				GabberTalk.connect(opts);
			});
			return false
		}

		GabberTalk.users = [];

		var uri   = GabberEnv.host.split(':'),
				port  = uri[1] || 80,
				host  = uri[0];

		var socket = new io.Socket(host, {'port': port, transports: ['websocket', 'flashsocket', 'xhr-multipart']});
		socket.connect();

		socket.on('connect', function(){
			GabberTalk.log("Connected");
			firstConnectionAttemp = null;
			GabberTalk.sendMessage = function(type,data){
				if( !type )
					throw "No Type set for message";

				if( !GabberTalk.isConnected )
					throw "GabberTalk Not Connected";

				data = data || {};

				data.type = type;
				GabberTalk.log('Sending Message: '+type);
				GabberTalk.log(data);
				if( GabberTalk.runFilters('send',type, data) ){
					socket.send(JSON.stringify(data));
					return true;
				} else {
					return false;
				}
			};

			GabberTalk.isConnected = true;
			GabberTalk.runHandlers('connect');
			GabberTalk.log("Connected...");
			return true;
		});

		socket.on('disconnect', function(){
			firstConnectionAttemp = null;
			GabberTalk.isConnected = false;
			GabberTalk.log("You've been disconnected");
			socket.disconnect();
			GabberTalk.runHandlers('disconnect');
			tryConnect();
		});

		socket.on('message', function(obj){
			obj = parseJson(obj);
			GabberTalk.log("RECEIVED: "+ obj.type);
			GabberTalk.log(obj);

			if(GabberTalk.currentUser){
				obj.mine = (obj.from.sessionId == GabberTalk.currentUser.sessionId)
			} else {
				obj.mine = false;
			}

			GabberTalk.receiveMessage(obj);
		});
	};

	GabberTalk.receiveMessage = function(obj){
		if(GabberTalk.runFilters('receive', obj.type, obj)){
			GabberTalk.runHandlers(obj.type, obj);
		}
	}

	var connectionAttempts = 1,
			retryTimeout = 1000;
	// Used for re-connecting.  Will only attempt 5 reconnects
	function tryConnect(){
		if(!GabberTalk.isConnected){
			if(connectionAttempts > 5){
				GabberTalk.log("Too many connection attempts");
				retryTimeout = 1000;
				connectionAttempts = 1;
				GabberTalk.runHandlers('couldNotConnect');
			} else {
				setTimeout(function(){
					retryTimeout = retryTimeout * 1.2;
					if(!GabberTalk.connect()){
						GabberTalk.log("Failed attempt "+connectionAttempts+"… Retrying in "+(retryTimeout/1000)+"s");
						connectionAttempts++;
						setTimeout(tryConnect, retryTimeout);
					}
				}, retryTimeout);
			}
		} else {
			retryTimeout = 1000;
			connectionAttempts = 1;
		}
	};

	function addHandler(type, fn){
		fetchHandlers(type).push(fn);
		return fn;
	};

	function fetchHandlers(type){
		GabberTalk.eventHandlers[type] = GabberTalk.eventHandlers[type] || [];
		return GabberTalk.eventHandlers[type];
	};

	// A set of handlers setup to run after GabberTalk and all dependant files are loaded
	GabberTalk.onLoad = function(fn){
		return addHandler('load', fn);
	};

	// Add handlers to be called whenever GabberTalk connects
	GabberTalk.onConnect = function(fn){
		return addHandler('connect', fn);
	};

	// Add handlers to be called whenver GabberTalk disconnects
	GabberTalk.onDisconnect = function(fn){
		return addHandler('disconnect', fn);
	};

	// When GabberTalk has retried to connect and failed, any handlers added here will be called
	GabberTalk.onCouldNotConnect = function(fn){
		return addHandler('couldNotConect', fn);
	};

	// When GabberTalk loading has timed out (assuming GabberTalk itself is loaded)
	GabberTalk.onCouldNotLoad = function(fn){
		return addHandler('couldNotLoad', fn);
	};

	// Arbitrary GabberTalk event handler
	GabberTalk.on = function(event, fn){
		return addHandler(event, fn);
	};

	// Safely logs to console if available
	// and GabberEnv.enableLogging or GabberTalk.enableLoggin are not false
	GabberTalk.log = function(message){
		if(GabberTalk.logEnabled){
			if(window.console){
				window.console.log(message);
			};
		};
	};

	// Running handlers for a given type with any provided arguments
	GabberTalk.runHandlers = function(type, msg){
		var handlers = fetchHandlers(type);
		// Run them
		for(i in handlers){
			handlers[i](msg);
		};
	};

	// Runs the filters, allowing each one to halt the following ones
	// kind == send or receive
	// type == comment, nickChange or similar
	GabberTalk.runFilters = function(kind, type, data){
		var halted  = false,
				filters = fetchFilters(kind, type);

		for(i in filters){
			if(filters[i](data) === false){
				halted = true;
				break;
			};
		};

		return halted ? false : true;
	};

	GabberTalk.loadFile = function (tag, opts, callback){
		var bodyNode = document.getElementsByTagName('body')[0];
		var node     = document.createElement(tag);
		for(key in opts)
			node[key] = opts[key];

		if( tag == 'script' ){
			node.onload = node.onreadystatechange = function(){
				if(callback)
					callback();
			};
		}
		bodyNode.appendChild(node);
	};

	function parseJson(string){
		try {
			return JSON.parse(string);
		} catch(e) {
			return {};
		};
	};

	GabberTalk.loadFile('script', {src: 'http://'+GabberEnv.host+'/socket.io/socket.io.js', async: true}, function(){
		GabberTalk.isLoaded = true;
		GabberTalk.runHandlers('onLoad');
		gabberTalkBoot();
	})

	// When the socket connects we need to join
	// And claim the nick if it's available
	GabberTalk.onConnect( function() {
		joinMsg = {accountId: GabberTalk.accountId, url: window.location.href};
		if (GabberTalk.roomName)
			joinMsg.roomName = GabberTalk.roomName;

		GabberTalk.sendMessage('join', joinMsg);

		if(cachedUsername){
			GabberTalk.claimNick(cachedUsername, cachedEmail);
		}
	});

	GabberTalk.receiveFilter('currentUser', function(msg){
		GabberTalk.currentUser = msg.from;
	});

	GabberTalk.receiveFilter('nickChange', function(msg){
		if(GabberTalk.currentUser){
			if(msg.from.sessionId === GabberTalk.currentUser.sessionId){
				GabberTalk.currentUser = msg.from;
			}
		}
	});

})();

