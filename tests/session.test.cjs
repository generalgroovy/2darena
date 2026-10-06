const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');

function setup(options={}){
 const elements=new Map(),peers=[],intervals=new Set(),frames=new Set(),timeouts=new Map();let serial=0;
 class Events {
  constructor(){this.handlers={};this.open=true;this.peer='guest';}
  on(name,fn){this.handlers[name]=fn;}
  emit(name,...args){this.handlers[name]?.(...args);}
  send(){} close(){this.open=false;this.emit('close');}
 }
 class Peer extends Events {
  constructor(){super();peers.push(this);}
  destroy(){this.destroyed=true;this.emit('close');}
  connect(){this.conn=new Events();return this.conn;}
 }
 const document={activeElement:null,getElementById(id){if(!elements.has(id))elements.set(id,{value:'arena-test',classList:{add(){},remove(){}},focus(){document.activeElement=this;},select(){this.selected=true;},addEventListener(){},getContext(){return {};}});return elements.get(id);}};
 const context=vm.createContext({ArenaModel:require("../arena-model.js"),Peer,document,URL,navigator:{clipboard:{writeText:options.writeText||(()=>Promise.resolve())}},window:{location:{href:options.url||"https://example.test/arena/"},addEventListener(){}},
 setInterval(){const id=++serial;intervals.add(id);return id;},clearInterval:id=>intervals.delete(id),
 requestAnimationFrame(){const id=++serial;frames.add(id);return id;},cancelAnimationFrame:id=>frames.delete(id),
 setTimeout(fn){const id=++serial;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id)});
 vm.runInContext(readFileSync(path.join(__dirname,'../game.js'),'utf8'),context);
 return {peers,elements,intervals,frames,timeouts,document,run:code=>vm.runInContext(code,context)};
}

test('double-click hosting creates one peer; leaving tears down timers and ignores stale callbacks',()=>{
 const app=setup();app.run('hostGame();hostGame()');assert.equal(app.peers.length,1);
 const old=app.peers[0];old.emit('open','host');assert.equal(app.intervals.size,2);assert.equal(app.frames.size,1);
 app.run('stopSession()');assert.equal(app.intervals.size,0);assert.equal(app.frames.size,0);assert.equal(old.destroyed,true);
 app.run('hostGame()');old.emit('open','old-host');assert.equal(app.intervals.size,0);
 app.peers[1].emit('open','new-host');assert.equal(app.run('myId'),'new-host');assert.equal(app.intervals.size,2);
});
test('host disconnection returns to a retryable lobby and clears held input',()=>{
 const app=setup();app.run('joinGame()');app.peers[0].emit('open','me');const conn=app.peers[0].conn;
 conn.emit('open');app.run('keys.add("w");mouse.down=true');conn.emit('close');
 assert.equal(app.elements.get('joinBtn').disabled,false);assert.equal(app.run('peer'),null);
 assert.equal(app.run('keys.size'),0);assert.equal(app.run('mouse.down'),false);assert.equal(app.frames.size,0);
 app.run('joinGame()');app.peers[1].emit('open','retry');conn.emit('close');assert.equal(app.run('myId'),'retry');
});
test('connection timeout and missing signaling dependency fail clearly and permit retry',()=>{
 const app=setup();app.run('joinGame()');[...app.timeouts.values()][0]();
 assert.match(app.elements.get('status').textContent,/timed out/);assert.equal(app.elements.get('hostBtn').disabled,false);
 app.run('Peer=undefined;hostGame()');assert.match(app.elements.get('status').textContent,/unavailable/);
 assert.equal(app.elements.get('hostBtn').disabled,false);
});
test('full room retains its reason and malformed snapshots do not replace last valid state',()=>{
 const app=setup();app.run('joinGame()');app.peers[0].emit('open','me');const conn=app.peers[0].conn;
 conn.emit('data',{type:'snapshot',snapshot:null});assert.equal(app.run('snapshot.wave'),1);
 conn.emit('data',{type:'full'});assert.match(app.elements.get('status').textContent,/full/);
 assert.equal(app.elements.get('joinBtn').disabled,false);
});

test('keyboard focus follows successful play and returns to the appropriate lobby control',()=>{
 const app=setup();app.elements.get('joinCode').focus();app.run('joinGame()');
 app.peers[0].emit('open','me');app.peers[0].conn.emit('open');
 assert.equal(app.document.activeElement,app.elements.get('game'));
 app.run('stopSession()');assert.equal(app.document.activeElement,app.elements.get('joinCode'));
 app.run('hostGame()');app.peers[1].emit('open','host');
 assert.equal(app.document.activeElement,app.elements.get('game'));
 app.run('stopSession()');assert.equal(app.document.activeElement,app.elements.get('hostBtn'));
 app.elements.get('joinCode').value='';app.run('joinGame()');
 assert.equal(app.document.activeElement,app.elements.get('joinCode'));
 assert.match(app.elements.get('status').textContent,/Enter a host code/);
});

test('room waits safely, then starts and restarts without dropping members',()=>{
 const app=setup();app.run('hostGame()');app.peers[0].emit('open','arena-host');
 app.run('hostTick()');assert.equal(app.run('world.enemies.length'),0);
 assert.equal(app.run('snapshot.phase'),'waiting');
 app.run('world.players.guest=makePlayer("guest","P2");startRound();hostTick()');
 assert.equal(app.run('snapshot.phase'),'playing');assert.equal(app.run('world.enemies.length'),1);
 app.run('world.score=700;world.players.guest.health=8;startRound()');
 assert.equal(app.run('world.score'),0);assert.equal(app.run('world.players.guest.health'),100);
 assert.equal(app.run('Object.keys(world.players).length'),2);
 assert.equal(app.peers.length,1);assert.equal(app.peers[0].destroyed,undefined);
});

test('death countdown is reset on restart and does not schedule stale timers',()=>{
 const app=setup();app.run('hostGame()');app.peers[0].emit('open','arena-host');
 app.run('startRound();world.players[myId].health=1;world.enemies=[{x:world.players[myId].x,y:world.players[myId].y,r:17,speed:0,health:1,damage:14}];hostTick()');
 assert.equal(app.run('world.players[myId].alive'),false);
 assert.equal(app.timeouts.size,0);
 app.run('startRound();world.players[myId].health=70;world.spawnTimer=100;for(let i=0;i<90;i++)hostTick()');
 assert.equal(app.run('world.players[myId].health'),70);
});

test('invite is explicit, copy has a selection fallback, and late clipboard results stay in their room',async()=>{
 const app=setup({url:'https://example.test/arena/?room=arena-friend',writeText:()=>Promise.reject(new Error('denied'))});
 assert.equal(app.elements.get('joinCode').value,'arena-friend');assert.equal(app.peers.length,0);
 app.run('hostGame()');app.peers[0].emit('open','arena-host');await app.run('copyInvite()');
 assert.equal(app.elements.get('inviteLink').value,'https://example.test/arena/?room=arena-host');
 assert.equal(app.elements.get('inviteLink').selected,true);
 let reject;const late=setup({writeText:()=>new Promise((_,r)=>{reject=r;})});
 late.run('hostGame()');late.peers[0].emit('open','arena-late');const pending=late.run('copyInvite()');
 late.run('stopSession()');reject(new Error('denied'));await pending;
 assert.equal(late.elements.get('inviteLink').hidden,true);
 assert.equal(late.elements.get('status').textContent,'Left room.');
});

test('solo does not need PeerJS and stale network callbacks cannot replace it',()=>{
 const app=setup();app.run('hostGame()');const old=app.peers[0];old.emit('open','arena-old');
 app.run('stopSession();Peer=undefined;soloGame();keys.add("d");hostTick()');
 assert.equal(app.run('isSolo'),true);assert.equal(app.run('world.phase'),'playing');
 assert.equal(app.run('myId'),'solo');assert.equal(app.intervals.size,1);assert.equal(app.peers.length,1);
 old.emit('open','stale');old.emit('error',{type:'late'});
 assert.equal(app.run('myId'),'solo');assert.equal(app.run('world.phase'),'playing');
 app.run('stopSession()');assert.equal(app.intervals.size,0);assert.equal(app.frames.size,0);assert.equal(app.elements.get('soloBtn').disabled,false);
 assert.equal(app.document.activeElement,app.elements.get('soloBtn'));
});

test('solo can cancel an unfinished connection without waiting for the timeout',()=>{
 const app=setup();app.run('hostGame()');const old=app.peers[0];
 assert.equal(app.elements.get('soloBtn').disabled,false);app.run('soloGame()');
 assert.equal(old.destroyed,true);assert.equal(app.timeouts.size,0);assert.equal(app.run('myId'),'solo');
 old.emit('open','arena-late');assert.equal(app.run('myId'),'solo');assert.equal(app.intervals.size,1);
});

test('guest snapshots reject malformed render geometry without replacing usable state',()=>{
 const app=setup();app.run('joinGame()');app.peers[0].emit('open','me');const conn=app.peers[0].conn;
 const M=require('../arena-model.js');const w=M.createWorld();w.players.me=M.makePlayer('me','You');M.startRound(w);
 conn.emit('data',{type:'snapshot',snapshot:M.snapshot(w)});assert.equal(app.run('snapshot.phase'),'playing');
 const bad=M.snapshot(w);bad.players.me.r=-4;bad.score=999;
 conn.emit('data',{type:'snapshot',snapshot:bad});assert.equal(app.run('snapshot.score'),0);assert.equal(app.run('snapshot.players.me.r'),14);
});
