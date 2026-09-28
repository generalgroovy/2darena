const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');

function setup(){
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
 const document={activeElement:null,getElementById(id){if(!elements.has(id))elements.set(id,{value:'arena-test',classList:{add(){},remove(){}},focus(){document.activeElement=this;},addEventListener(){},getContext(){return {};}});return elements.get(id);}};
 const context=vm.createContext({Peer,document,window:{addEventListener(){}},
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
