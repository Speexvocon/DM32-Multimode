import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDefaultModel,createTrunkSystem,modelVersion,validateModel,encodePayload,
  decodePayload,exportFile,importFile,upgradeModel} from '../model.js';

// Execute the actual dialog build/apply code, with local input elements only.
// File, browser, transport and radio APIs are deliberately absent.
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('function editTrunkSystem(index) {');
const end=app.indexOf('\nfunction editContact(index)',start);
assert(start>=0&&end>start,'Actual trunking editor must remain discoverable');
const editorSource=app.slice(start,end);
const existing=mode=>({...createTrunkSystem('KEPT SYSTEM'),mode,wacn:0xBEE00,systemId:0xB8F,
  nac:0xB85,rfss:1,site:70,sourceId:123456,talkgroup:3075,controls:[172287500,172600000]});

function editor(model,index=0) {
  const state={model:structuredClone(model),busy:false};
  let dialog;
  const node=(tag,attrs={},...children)=>({tag,...(tag==='textarea'?{value:children.join('')}:{}),...attrs,children,
    append(...added){this.children.push(...added);}});
  const context={S:state,createTrunkSystem,modelVersion,validateModel,encodePayload,
    clone:structuredClone,h:node,
    input:(value,onchange,attrs={})=>node('input',{value:String(value??''),onchange,...attrs}),
    field:(label,control,help='',full=false)=>node('label',{label,help,full},control),
    fmtFrequency:hz=>(hz/1e6).toFixed(6),
    parseFrequency:text=>Math.round(Number(text)*1e6),
    change:(label,apply)=>{apply();state.model=structuredClone(state.model);},
    editorDialog:(title,build,apply)=>{
      const body=node('div');dialog={title,body,controls:build(body),apply};
    }};
  // Keep the real model's strict plain-object validation in the same realm.
  const open=Function(...Object.keys(context),editorSource+'\nreturn editTrunkSystem;')(...Object.values(context));
  open(index);
  return {state,dialog,save:()=>dialog.apply(dialog.controls)};
}

test('new systems default to the named no-affiliation checkbox without adding model fields',()=>{
  const original=createDefaultModel(6),{state,dialog,save}=editor(original);
  const checkbox=dialog.controls.doNotAffiliate;
  assert.equal(checkbox.type,'checkbox');assert.equal(checkbox.checked,true);
  assert.equal(checkbox['aria-label'],'Do not affiliate (receive only)');
  const panel=dialog.body.children[0];
  assert(panel.children.some(field=>field.label==='Do not affiliate (receive only)'
    &&field.help.includes('without registering, affiliating or transmitting')));
  save();assert.equal(state.model.trunkSystems[0].mode,'rx-only');
  assert.deepEqual(Object.keys(state.model.trunkSystems[0]).sort(),Object.keys(createTrunkSystem()).sort());
  assert.equal(original.trunkSystems[0],null);
});

test('existing mode loads correctly and saving unchanged is byte-for-byte stable',()=>{
  for(const mode of ['rx-only','experimental']) {
    const model=createDefaultModel(6);model.trunkSystems[0]=existing(mode);
    const before=encodePayload(model),{state,dialog,save}=editor(model);
    assert.equal(dialog.controls.doNotAffiliate.checked,mode==='rx-only');
    save();assert.deepEqual(encodePayload(state.model),before);
    assert.deepEqual(state.model,model);
  }
});

test('checking receive only changes only the existing mode byte and round-trips through JSON',()=>{
  const model=createDefaultModel(6);model.trunkSystems[0]=existing('experimental');
  model.trunkSystems[1]=existing('experimental');model.trunkSystems[1].name='OTHER SYSTEM';
  model.settings.trunkSystem=1;model.settings.trunkStartAtBoot=true;
  const before=encodePayload(model),original=structuredClone(model),{state,dialog,save}=editor(model);
  dialog.controls.doNotAffiliate.checked=true;save();
  const after=encodePayload(state.model),changed=[...before.keys()].filter(i=>before[i]!==after[i]);
  assert.deepEqual(changed,[483*32+12]);assert.equal(before[changed[0]],1);assert.equal(after[changed[0]],0);
  const expected=structuredClone(original);expected.trunkSystems[0].mode='rx-only';
  assert.deepEqual(state.model,expected);assert.deepEqual(model,original);
  assert.deepEqual(decodePayload(after),expected);
  assert.deepEqual(importFile(exportFile(state.model)).model,expected);
  assert.equal(editor(state.model).dialog.controls.doNotAffiliate.checked,true);
});

test('unchecking receive only restores existing experimental mode without erasing identity or startup',()=>{
  const model=createDefaultModel(6);model.trunkSystems[0]=existing('rx-only');
  model.settings.trunkSystem=1;model.settings.trunkStartAtBoot=true;
  const expected=structuredClone(model);expected.trunkSystems[0].mode='experimental';
  const {state,dialog,save}=editor(model);dialog.controls.doNotAffiliate.checked=false;save();
  assert.deepEqual(state.model,expected);assert.deepEqual(decodePayload(encodePayload(state.model)),expected);
});

test('editing a checkbox without saving cannot change a draft or legacy codeplug',()=>{
  const model=createDefaultModel(6);model.trunkSystems[0]=existing('experimental');
  const {state,dialog}=editor(model);dialog.controls.doNotAffiliate.checked=true;
  assert.deepEqual(state.model,model);
  for(const version of [3,4,5]) {
    const legacy=createDefaultModel(version),bytes=encodePayload(legacy);
    const upgraded=upgradeModel(importFile(exportFile(legacy)).model,6);
    const pending=editor(upgraded);pending.dialog.controls.doNotAffiliate.checked=false;
    assert.deepEqual(pending.state.model,upgraded);
    assert.deepEqual(encodePayload(legacy),bytes);
  }
});

test('unchecked new systems retain the existing experimental identity validation',()=>{
  const model=createDefaultModel(6),{state,dialog,save}=editor(model);
  dialog.controls.doNotAffiliate.checked=false;
  assert.throws(save,/nonzero WACN and system ID/);
  assert.deepEqual(state.model,model);
});
