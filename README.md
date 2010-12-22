# GabberTalk Client

Client code for interacting with [GabberTalk](http://gabbertalk.com)

The code currently provides a base client.  gabber-client.js and also a knockout client.

## Getting Started

First head over to [GabberTalk](http://gabbertalk.com) and sign up for an account

The gabber-client.js file provides a base object for communicating with the GabberTalk service.  It's setup to call a <code>gabberTalkBoot()</code> function.  Declare this function in your page, and then require the gabber-client.js file.

### Setting up on the page

This simple setup will get you connected

<pre><code>
<script>
  function gabberTalkBoot(){
    GabberTalk.connect({accountId: GabberEnv.accountId,  roomName: GabberEnv.roomName});
  }
</script>
<script src='/javascripts/gabber-client.js' async></script>
</code></pre>

### GabberEnv

When configuring GabberTalk, create a global GabberEnv object and put configuration in there.  You'll need to do this to configure your account id, and optionally the room you want to use.

GabberTalk, the ko client and in future other clients will use the GabberEnv object to configure.

<pre><code>GabberEnv = {
  accountId: 'myAccountId',
  roomName:  'myRoomName',
  activateLinks: true         // Used in the ko client to activate urls in messages
}
</code></pre>

## What can it do

### Persistant Messages

GabberTalk was primarily designed for chat. To send a message:

<pre><code>GabberTalk.persistentMessage("Hi There");</code></pre>

To receive these messages:

<pre><code>GabberTalk.on('message', function(msg){ doMessageStuff(msg) });</code></pre>

Each message is tagged with it's sender in the _from_ field.  There is at least a sessionId attribute in the from.  There can also be _username_ and _gravatar_ and _origin_ (the origin domain the mesage came from)

### Nicknames and Gravatar images

Gabbertalk allows you to claim nicknames with emails.  It does no checking on these however and duplicates are allowed on the server.

<pre><code>GabberTalk.claimNick('homer', 'homer@simpson.com');</code></pre>

This results in a _nickChange_ message coming from that session.  To subscribe to _nickChange_ events

<pre><code>GabberTalk.on('nickChange', function(msg){ alert(msg.from.username) });</code></pre>

There can be as many subscriptions as you like

### Currently connected clients

Ask for a list of currently connected clients

<pre><code>GabberTalk.clientList();</code></pre>

Results in a _clientList_ message.

<pre><code>GabberTalk.on('clientList', function(msg){msg.clients typof Array });</code></pre>

### Arbitrary Messages

The only kind of message that is persisted is a _message_ type of messge.  It's possible and useful to send any other kind of message however.

Assume someone on the page has uploaded a file via ajax to some file list on the page.

<pre><code>GabberTalk.sendMessage('refreshSection', {route: '#!/fileList'});</code></pre>

Subscribe to refresh messages:

<pre><code>GabberTalk.on('refreshSection', function(msg){
  app.trigger(msg.route)
});</code></pre>

All connected clients would now receive the instruction to refresh the _#!/fileList_ route on their pages.

### Recent message

<pre><code>GabberTalk.recentMessages()</code></pre>

<pre><code>GabberTalk.on('recentMessages', function(recents){ stuff(recents) });</code></pre>

### Message Pipelining

As messages are sent / received, you can inspect, modify and even halt them from progressing. This is done by adding _filters_.  Filters are run before the subscriptions are called and are run in the order they were declared.

Return false from the function to halt the message.

Set a send filter to strip bad words:
<pre><code>GabberTalk.sendFilter('message', function(txt){
  if(containsBadWords(txt)){
    return false; // prevent the message from going any further.  Subscriptions will not be called.
  }
});</code></pre>

Set a receive filter to tag mine on a logged in users username:
<pre><code>GabberTalk.receiveFilter('message', function(msg){
  if(msg.from && msg.from.username == currentLoggedInUsername){
    msg.mine = true;
  }
});</code></pre>


### Other Events

There's also a whole bunch of events you can subscribe to so you can be awesome

* load
* connect
* disconnect
* couldNotConnect
* couldNotLoad
