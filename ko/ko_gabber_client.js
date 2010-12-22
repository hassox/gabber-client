// A client for use with GabberTalk http://gabbertalk.com
// This client makes use of the ko javascript library
//
// For an example of it in use see http://gabbertalk.com/demo

if(typeof GabberEnv === 'undefined'){
  throw "GabberEnv must be defined and have an 'accountId' property, and an optional 'roomName' propery";
}

if(!GabberEnv.accountId)
  throw "GabberEnv must have an 'accountId' field";

if(!GabberEnv.roomName)
  throw "GabberEnv must have a roomName field";

if(!GabberEnv.host){
  GabberEnv.host = "chat.gabbertalk.com";
}

GabberEnv.protocol = GabberEnv.protocol || 'http';

gabberData = {data: {}};
gabberTalkBoot = null; // The function for gabbertalk

(function(){
  gabberTalkBoot = function(){
    GabberTalk.loadFile('script',   {src: '/javascripts/jquery.tmpl.js', async: true   }, function(){
      GabberTalk.loadFile('script', {src: '/javascripts/knockout-1.1.0.js', async: true}, function(){
        setupKoGabber();
        GabberTalk.connect({accountId: GabberEnv.accountId,  roomName: GabberEnv.roomName});
        gabberKoClientSetup();
      });
    });
  };

  var bodyNode = document.getElementsByTagName('body')[0];
	var node     = document.createElement('script');
  var host     = GabberEnv.protocol+"://"+GabberEnv.host;

  node.src = host+"/0.1.0/boot.js";
  node.async = true;
  bodyNode.appendChild(node);

  // Setup the gabbertalk boot client
  function setupKoGabber(opts){
    opts = opts || {};
    gabberData.currentUser      = ko.observable(undefined);
    gabberData.anonUserCount    = ko.observable(0);
    gabberData.claimedUsers     = ko.observableArray([]);
    gabberData.usersBySessionId = {};
    gabberData.connectionStatus = ko.observable('Not Connected');
    gabberData.anonUserCountDisplay = ko.dependentObservable(function(){
      return "("+this.anonUserCount()+")";
    }, gabberData);

    gabberData.currentUsername = ko.dependentObservable(function(){
      if(this.currentUser() && this.currentUser().username()){
        return this.currentUser().username();
      } else {
        return 'Anonymous';
      }
    }, gabberData);

    gabberData.messages         = ko.observableArray([]);
    gabberData.submitComment    = function(form){
      var txt = $('textarea', $(form)).val();
      if(txt && txt.length > 0){
        GabberTalk.persistentMessage(txt);
      }
      $('textarea', $(form)).val('');
    }

    function Client(hash){
      this.username = ko.observable(hash.username);
      this.displayUsername = ko.dependentObservable(function(){
        return this.username() ? this.username() : 'Anonymous';
      }, this);

      this.origin   = ko.observable(hash.origin);
      this.sessionId = hash.sessionId;
      this.gravatar  = ko.observable(hash.gravatar || 'http://www.gravatar.com/avatar/XXXXXX');

      this.update = function(client){
        this.username(client.username);
        this.origin(client.origin);
        this.gravatar(client.gravatar);
      }
    }

    GabberTalk.on('join', function(){
      gabberData.connectionStatus('Connected');
      setTimeout(GabberTalk.clientList, 300);
    });

    GabberTalk.onDisconnect(function(){ gabberData.connectionStatus('Not Connected'); });

    function addClient(client){
      var _client = new Client(client);
      gabberData.usersBySessionId[client.sessionId] = _client;
      if(_client.username()){
        gabberData.claimedUsers.push(_client);
      } else {
        gabberData.anonUserCount(gabberData.anonUserCount()+1);
      }
    }

    function removeClient(client){
      var _client = gabberData.usersBySessionId[client.sessionId];
      if(_client){
        delete gabberData.usersBySessionId[client.sessionId]
        if(_client.username()){
          gabberData.claimedUsers.remove(_client);
        } else {
          gabberData.anonUserCount(gabberData.anonUserCount()-1);
        }
      }
    }

    function tagMine(msg){
      msg.mine = (msg.from.sessionId == GabberTalk.currentUser.sessionId);
    }


    function findMention(msg){
      var myUsername = GabberTalk.currentUser.username;
      // mentions
      if(msg.body.match('@'+myUsername)){
        msg.mention = true;
      } else {
        msg.mention = false;
      }
    }

    GabberTalk.onDisconnect(function(){
      gabberData.usersBySessionId = {};
      gabberData.claimedUsers.removeAll(gabberData.claimedUsers());
      gabberData.anonUserCount(0);
    });


    GabberTalk.on('join', function(msg){
      addClient(msg.from);
      setTimeout(GabberTalk.recentMessages, 500);
    });

    GabberTalk.on('leave', function(msg){
      removeClient(msg.from);
    });

    GabberTalk.on('clientList', function(msg){
      gabberData.usersBySessionId = {};
      gabberData.claimedUsers.removeAll(gabberData.claimedUsers());
      gabberData.anonUserCount(0);

      for(var i=0;i<msg.clients.length;i++){
        addClient(msg.clients[i]);
      }
    });

    GabberTalk.on('nickChange', function(msg){
      removeClient(msg.from);
      addClient(msg.from);

      if(msg.from.sessionId === GabberTalk.currentUser.sessionId){
        gabberData.currentUser().username(msg.from.username);
        gabberData.currentUser().gravatar(msg.from.gravatar);
      }
    });

    GabberTalk.receiveFilter('message', findMention);

    GabberTalk.on('message', function(msg){
      tagMine(msg);
      gabberData.messages.push(msg);
      if(gabberData.messages().length > 50){
        gabberData.messages.shift();
      }
    });

    GabberTalk.on('currentUser', function(msg){
      var c = new Client(msg.from);
      if(!c.username())
        c.username('');
      c.email = ko.observable('');
      gabberData.currentUser(c);
    });

    GabberTalk.on('recentMessages', function(msg){
      gabberData.messages.removeAll(gabberData.messages());
      for(var i=0; i<msg.recentMessages.length;i++){
        var __msg = JSON.parse(msg.recentMessages[i]);
        __msg.type = 'message';
        GabberTalk.receiveMessage(__msg);
      }
    });

    if(GabberEnv.activateLinks){
      var linkRegexp = /(http\:\/\/[^\b\s<]+)/gi;
      GabberTalk.receiveFilter('message', function(msg){
        msg.body = msg.body.replace(linkRegexp,function(str){
          return "<a href='"+str+"' target='_blank' rel='external'>"+str+"</a>";
        });
     });
    }
  }

})();
