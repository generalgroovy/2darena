const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
function setup(){
  const events={},elements=new Map();
  const context=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,{addEventListener(){},getContext(){return {};}});return elements.get(id);}},window:{addEventListener(name,fn){events[name]=fn;}},Math,Number,Map,Set});
  vm.runInContext(readFileSync(require('node:path').join(__dirname,'..','game.js'),'utf8'),context);
  return {events,elements,run:code=>vm.runInContext(code,context)};
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
  app.events.keydown({key:'w',target:{tagName:'CANVAS'}});
  app.run('mouse.down=true');
  assert.equal(app.run('localInput().up'),true);
  app.events.blur();
  assert.equal(app.run('localInput().up'),false);assert.equal(app.run('localInput().shoot'),false);
});
test('connection state remains visible while lobby is hidden',()=>{
  const app=setup();app.run("setStatus('Disconnected from host.')");
  assert.equal(app.elements.get('gameStatus').textContent,'Disconnected from host.');
});
