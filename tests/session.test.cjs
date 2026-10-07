const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');

function setup(options={}){
 const elements=new Map(),peers=[],intervals=new Set(),frames=new Set(),timeouts=new Map(),events={},documentEvents={};let serial=0;
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
 const document={activeElement:null,addEventListener(name,fn){documentEvents[name]=fn;},getElementById(id){if(!elements.has(id))elements.set(id,{value:'arena-test',handlers:{},classList:{add(){},remove(){}},focus(){document.activeElement=this;},select(){this.selected=true;},addEventListener(name,fn){this.handlers[name]=fn;},getContext(){return {};}});return elements.get(id);}};
 const context=vm.createContext({ArenaModel:require("../arena-model.js"),Peer,document,URL,navigator:{clipboard:{writeText:options.writeText||(()=>Promise.resolve())}},window:{location:{href:options.url||"https://example.test/arena/"},addEventListener(name,fn){events[name]=fn;}},
 setInterval(){const id=++serial;intervals.add(id);return id;},clearInterval:id=>intervals.delete(id),
 requestAnimationFrame(){const id=++serial;frames.add(id);return id;},cancelAnimationFrame:id=>frames.delete(id),
 setTimeout(fn){const id=++serial;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id)});
 vm.runInContext(readFileSync(path.join(__dirname,'../game.js'),'utf8'),context);
 return {peers,elements,intervals,frames,timeouts,document,events,documentEvents,makeConnection(id){const conn=new Events();conn.peer=id;return conn;},run:code=>vm.runInContext(code,context)};
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

test('host owns guest state, rejects duplicate members and caps actual room membership',()=>{
 const app=setup();app.run('hostGame()');const host=app.peers[0];host.emit('open','arena-host');
 const guest=app.makeConnection('guest');host.emit('connection',guest);guest.emit('open');
 guest.emit('data',{type:'input',input:{right:true,mx:Infinity,pulse:'true'},score:50000});
 assert.equal(app.run('world.score'),0);assert.equal(app.run('world.players.guest.input.mx'),480);assert.equal(app.run('world.players.guest.input.pulse'),false);
 const duplicate=app.makeConnection('guest');host.emit('connection',duplicate);duplicate.emit('open');
 assert.equal(duplicate.open,false);assert.equal(app.run('Object.keys(world.players).length'),2);assert.equal(app.run('conns.size'),1);
 for(let i=0;i<14;i++){const conn=app.makeConnection('member'+i);host.emit('connection',conn);conn.emit('open');}
 assert.equal(app.run('Object.keys(world.players).length'),16);
 const full=app.makeConnection('extra');host.emit('connection',full);full.emit('open');assert.equal(full.open,false);
 host.emit('open','another-open');assert.equal(app.intervals.size,2);assert.equal(app.run('myId'),'arena-host');
 app.run('stopSession();soloGame()');guest.emit('data',{type:'input',input:{shoot:true}});guest.emit('close');
 assert.equal(app.run('Object.keys(world.players).length'),1);assert.equal(app.run('myId'),'solo');
});

test('solo pause freezes every simulation value and resumes with neutral controls and canvas focus',()=>{
 const app=setup();app.run('soloGame();keys.add("d");mouse.down=true;queueAbility("pulse");hostTick();setSoloPaused(true)');
 assert.equal(app.elements.get('pauseBtn').textContent,'Resume');
 assert.equal(app.document.activeElement,app.elements.get('pauseBtn'));
 const frozen=app.run('JSON.stringify(world)');
 app.run('keys.add("w");touchKeys.add("a");mouse.down=true;queueAbility("dash");for(let i=0;i<120;i++)hostTick()');
 assert.equal(app.run('JSON.stringify(world)'),frozen);
 assert.equal(app.run('localInput().shoot'),false);
 assert.equal(app.run('localInput().up'),false);
 app.run('setSoloPaused(false)');
 assert.equal(app.document.activeElement,app.elements.get('game'));
 assert.equal(app.elements.get('pauseBtn').textContent,'Pause');
 assert.equal(app.run('localInput().up'),false);assert.equal(app.run('localInput().left'),false);
 assert.equal(app.run('localInput().shoot'),false);assert.equal(app.run('localInput().dash'),false);
 const cooldown=app.run('world.players.solo.pulseCooldown');app.run('hostTick()');
 assert.ok(app.run('world.players.solo.pulseCooldown')<cooldown);
 assert.equal(app.run('world.players.solo.dashCooldown'),0);
});

test('solo auto-pauses for focus loss, hidden document and help; help closing never auto-resumes',()=>{
 const app=setup();app.run('soloGame()');app.events.blur();
 assert.equal(app.run('soloPaused'),true);
 app.run('setSoloPaused(false)');app.document.hidden=true;app.documentEvents.visibilitychange();
 assert.equal(app.run('soloPaused'),true);
 app.document.hidden=false;app.documentEvents.visibilitychange();assert.equal(app.run('soloPaused'),true);
 app.run('setSoloPaused(false)');const help=app.elements.get('gameHelp');help.open=true;help.handlers.toggle();
 assert.equal(app.run('soloPaused'),true);
 help.open=false;help.handlers.toggle();assert.equal(app.run('soloPaused'),true);
 app.run('startRound()');assert.equal(app.run('soloPaused'),false);assert.equal(help.open,false);
 assert.equal(app.elements.get('pauseBtn').textContent,'Pause');
});

test('OS keyboard repeat cannot reactivate held movement or fire after pause and resume',()=>{
 const app=setup();app.run('soloGame()');const target=app.elements.get('game');
 for(const key of ['f','w']) app.events.keydown({key,target});
 assert.equal(app.run('localInput().shoot'),true);assert.equal(app.run('localInput().up'),true);
 app.run('setSoloPaused(true);setSoloPaused(false)');
 for(const key of ['f','w']) app.events.keydown({key,target,repeat:true});
 assert.equal(app.run('localInput().shoot'),false);assert.equal(app.run('localInput().up'),false);
 for(const key of ['f','w']) {app.events.keyup({key});app.events.keydown({key,target,repeat:false});}
 assert.equal(app.run('localInput().shoot'),true);assert.equal(app.run('localInput().up'),true);
});

test('multiplayer never pauses from focus loss, help or solo controls',()=>{
 const app=setup();app.run('hostGame()');app.peers[0].emit('open','arena-host');app.run('startRound()');
 assert.equal(app.elements.get('pauseBtn').hidden,true);
 assert.match(app.elements.get('pauseHelp').textContent,/keeps running/);
 app.run('setSoloPaused(true)');app.events.blur();
 const help=app.elements.get('gameHelp');help.open=true;help.handlers.toggle();
 app.run('hostTick()');assert.equal(app.run('soloPaused'),false);assert.equal(app.run('world.enemies.length'),1);
});

test('cancel pending connection tears down the attempt, retains code and ignores late success',()=>{
 const app=setup();app.run('joinGame()');const pending=app.peers[0];
 assert.equal(app.elements.get('cancelConnectBtn').hidden,false);
 app.elements.get('cancelConnectBtn').handlers.click();
 assert.equal(app.timeouts.size,0);assert.equal(pending.destroyed,true);
 assert.equal(app.elements.get('cancelConnectBtn').hidden,true);
 assert.equal(app.elements.get('joinCode').value,'arena-test');
 assert.equal(app.document.activeElement,app.elements.get('joinCode'));
 assert.match(app.elements.get('status').textContent,/cancelled/);
 pending.emit('open','late');assert.equal(app.run('myId'),null);
 app.run('soloGame()');assert.equal(app.run('soloPaused'),false);
});

test('requesting a solo restart preserves progress and cancel resumes neutral play',()=>{
 const app=setup();app.run('soloGame();world.score=700;world.wave=4;world.players.solo.health=42;keys.add("d");mouse.down=true;requestRestart()');
 assert.equal(app.run('soloPaused'),true);assert.equal(app.run('world.score'),700);
 assert.equal(app.elements.get('restartPrompt').hidden,false);
 assert.equal(app.elements.get('pauseBtn').hidden,true);
 assert.equal(app.document.activeElement,app.elements.get('cancelRestartBtn'));
 assert.equal(app.elements.get('cancelRestartBtn').textContent,'Keep playing');
 const frozen=app.run('JSON.stringify(world)');
 app.run('setSoloPaused(false);queueAbility("pulse");for(let i=0;i<120;i++)hostTick()');
 assert.equal(app.run('JSON.stringify(world)'),frozen);
 app.elements.get('cancelRestartBtn').handlers.click();
 assert.equal(app.run('soloPaused'),false);assert.equal(app.run('world.wave'),4);
 assert.equal(app.run('world.players.solo.health'),42);assert.equal(app.run('world.score'),700);
 assert.equal(app.run('localInput().right || localInput().shoot || localInput().pulse'),false);
 assert.equal(app.document.activeElement,app.elements.get('game'));
 assert.equal(app.elements.get('restartPrompt').hidden,true);
});

test('cancel and Escape preserve an already paused run',()=>{
 const app=setup();app.run('soloGame();setSoloPaused(true);requestRestart()');
 assert.equal(app.elements.get('cancelRestartBtn').textContent,'Keep paused');
 const frozen=app.run('JSON.stringify(world)');let prevented=false;
 app.elements.get('restartPrompt').handlers.keydown({key:'Escape',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(app.run('soloPaused'),true);
 assert.equal(app.run('JSON.stringify(world)'),frozen);
 assert.equal(app.document.activeElement,app.elements.get('pauseBtn'));
 assert.equal(app.elements.get('pauseBtn').hidden,false);
 assert.equal(app.elements.get('pauseBtn').textContent,'Resume');
});

test('confirmed restart resets the full run exactly once and restores play focus',()=>{
 const app=setup();app.run('soloGame();world.score=700;world.wave=4;world.players.solo.health=42;world.players.solo.pulseCooldown=2;requestRestart()');
 app.elements.get('confirmRestartBtn').handlers.click();
 assert.equal(app.run('world.score'),0);assert.equal(app.run('world.wave'),1);
 assert.equal(app.run('world.players.solo.health'),100);assert.equal(app.run('world.players.solo.pulseCooldown'),0);
 assert.equal(app.run('world.enemies.length'),0);assert.equal(app.run('soloPaused'),false);
 assert.equal(app.document.activeElement,app.elements.get('game'));
 assert.equal(app.elements.get('startBtn').textContent,'Restart run');
 assert.equal(app.elements.get('restartPrompt').hidden,true);assert.equal(app.intervals.size,1);
 app.run('world.score=23;confirmRestart()');assert.equal(app.run('world.score'),23);
});

test('host starts waiting rooms directly but confirms a shared reset without pausing or dropping members',()=>{
 const app=setup();app.run('hostGame()');const peer=app.peers[0];peer.emit('open','arena-host');
 const guest=app.makeConnection('guest');peer.emit('connection',guest);guest.emit('open');
 app.elements.get('startBtn').handlers.click();assert.equal(app.run('world.phase'),'playing');
 assert.equal(app.run('pendingRestart'),null);
 app.run('world.score=88;world.players.guest.health=25;requestRestart()');
 assert.match(app.elements.get('restartHeading').textContent,/everyone/);
 assert.match(app.elements.get('restartDetails').textContent,/keeps running/);
 assert.equal(app.run('soloPaused'),false);app.run('hostTick()');assert.equal(app.run('world.enemies.length'),1);
 app.run('cancelRestart()');assert.equal(app.run('world.score'),88);assert.equal(app.run('world.players.guest.health'),25);
 app.run('requestRestart();confirmRestart()');
 assert.equal(app.run('world.score'),0);assert.equal(app.run('world.players.guest.health'),100);
 assert.equal(app.run('Object.keys(world.players).length'),2);assert.equal(app.run('conns.size'),1);
 assert.equal(app.intervals.size,2);assert.equal(app.peers.length,1);assert.equal(guest.open,true);
});

test('leaving clears restart choice and late confirm cannot reset another run or a guest',()=>{
 const app=setup();app.run('soloGame();requestRestart();stopSession();soloGame();world.score=99;confirmRestart()');
 assert.equal(app.run('world.score'),99);assert.equal(app.run('pendingRestart'),null);
 assert.equal(app.elements.get('restartPrompt').hidden,true);
 app.run('stopSession();joinGame()');app.peers[0].emit('open','me');app.peers[0].conn.emit('open');
 app.run('requestRestart();confirmRestart()');assert.equal(app.run('pendingRestart'),null);
 assert.equal(app.elements.get('startBtn').hidden,true);
});
