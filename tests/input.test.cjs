const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
function setup(){
  const events={},elements=new Map(),canvasEvents={};
  const context=vm.createContext({ArenaModel:require("../arena-model.js"),document:{getElementById(id){if(!elements.has(id))elements.set(id,{focus(){},setPointerCapture(){},width:960,height:540,getBoundingClientRect(){return {left:0,top:0,width:960,height:540};},addEventListener(name,fn){if(id==='game')canvasEvents[name]=fn;},getContext(){return {};}});return elements.get(id);}},window:{addEventListener(name,fn){events[name]=fn;}},Math,Number,Map,Set});
  vm.runInContext(readFileSync(require('node:path').join(__dirname,'..','game.js'),'utf8'),context);
  return {events,elements,canvasEvents,run:code=>vm.runInContext(code,context)};
}
test('malformed remote input becomes finite neutral controls',()=>{
  const app=setup();
  for(const value of ['null','undefined','42','{mx:NaN,my:Infinity,up:"true",shoot:1}','[]']){
    const input=app.run(`sanitizeInput(${value})`);
    assert.equal(input.mx,480);assert.equal(input.my,270);assert.equal(input.shoot,false);assert.equal(input.up,false);
  }
  const input=app.run('sanitizeInput({mx:-999,my:99999,shoot:true,right:true})');
  assert.equal(input.mx,0);assert.equal(input.my,540);assert.equal(input.shoot,true);assert.equal(input.right,true);
});
test('losing focus clears held movement and firing; code input does not move player',()=>{
  const app=setup();
  app.events.keydown({key:'w',target:{tagName:'INPUT'}});
  assert.equal(app.run('localInput().up'),false);
  app.events.keydown({key:'w',target:app.elements.get('game')});
  app.run('mouse.down=true');
  assert.equal(app.run('localInput().up'),true);
  app.events.blur();
  assert.equal(app.run('localInput().up'),false);assert.equal(app.run('localInput().shoot'),false);
});

test('links and non-arena controls keep Space and arrow keys without queuing abilities',()=>{
  const app=setup();let prevented=false;
  for(const target of [{tagName:'A'}, {tagName:'BUTTON'}, {tagName:'DIV',role:'button'}]) {
    app.events.keydown({key:' ',target,preventDefault(){prevented=true;}});
    app.events.keydown({key:'ArrowDown',target,preventDefault(){prevented=true;}});
  }
  assert.equal(prevented,false);assert.equal(app.run('localInput().dash'),false);assert.equal(app.run('keys.size'),0);
});

test('quick ability taps survive until the next simulation input, then clear',()=>{
  const app=setup(),target=app.elements.get('game');
  app.events.keydown({key:'q',target});app.events.keyup({key:'q'});
  assert.equal(app.run('localInput().pulse'),true);assert.equal(app.run('localInput().pulse'),false);
});
test('connection state remains visible while lobby is hidden',()=>{
  const app=setup();app.run("setStatus('Disconnected from host.')");
  assert.equal(app.elements.get('gameStatus').textContent,'Disconnected from host.');
});

test('only the primary mouse button fires',()=>{
  const app=setup();
  app.canvasEvents.pointerdown({button:2,pointerId:1});assert.equal(app.run('localInput().shoot'),false);
  app.canvasEvents.pointerdown({button:0,pointerId:1,clientX:400,clientY:300,preventDefault(){}});assert.equal(app.run('localInput().shoot'),true);
  app.events.pointerup({pointerId:1});assert.equal(app.run('localInput().shoot'),false);
});
