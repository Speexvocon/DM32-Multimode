import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultModel,createTrunkSystem,clearTrunkSystem,upgradeModel,modelVersion,recordCount,
  encodePayload,decodePayload,exportFile,importFile} from '../model.js';

const system=()=>({...createTrunkSystem('EXACT SYSTEM'),mode:'experimental',wacn:0xabcde,systemId:0x123,nac:0x293,
  rfss:7,site:9,sourceId:0x123456,talkgroup:1000,controls:[440075000,440087500]});

test('V6 independently specified last-system fields occupy exact records without changing V5 data',()=>{
  const old=createDefaultModel(5);old.contacts[95]={name:'KEPT',protocol:'Both',type:'unit',id:0xffffff};
  old.vfos[0].privateCall=true;old.vfos[0].destinationId=0x123456;
  const before=encodePayload(old),model=upgradeModel(old,6);
  assert.equal(modelVersion(model),6);assert.equal(recordCount(6),499);
  assert.deepEqual(encodePayload(model).slice(0,before.length),before);
  model.trunkSystems[7]=system();model.settings.trunkSystem=8;model.settings.trunkStartAtBoot=true;
  const payload=encodePayload(model),at=497*32,data=new DataView(payload.buffer);
  assert.equal(payload.length,15968);assert.deepEqual([...payload.slice(at+12,at+28)],
    [1,2,0xde,0xbc,0x0a,0x23,1,0x93,2,7,9,0x56,0x34,0x12,0xe8,3]);
  assert.equal(data.getUint32(at+32,true),440075000);assert.equal(data.getUint32(at+36,true),440087500);
  assert.equal(payload[258*32+28],8);assert.equal(payload[258*32+29],1);
  assert.deepEqual(decodePayload(payload),model);assert.deepEqual(importFile(exportFile(model)).model,model);
  assert.deepEqual(encodePayload(old),before);assert.throws(()=>decodePayload(payload,5));
});

test('V6 rejects reserved bytes, dirty absent systems, duplicate/tail controls and invalid references',()=>{
  const model=createDefaultModel(6);model.trunkSystems[0]=system();const wire=encodePayload(model),at=483*32;
  for(const [offset,value] of [[at+28,1],[at+12,2],[at+13,9],[at+16,0x10],[at+40,1],[485*32+32,1],[258*32+28,2],[258*32+29,1]]) {
    const bad=wire.slice();bad[offset]=value;assert.throws(()=>decodePayload(bad),undefined,String(offset));
  }
  for(const edit of [s=>s.controls.push(s.controls[0]),s=>s.controls=[],s=>s.controls=[125000000],s=>s.systemId=0,
    s=>s.wacn=0,s=>s.sourceId=0x1000000,s=>s.sourceId=0xffffff,s=>s.talkgroup=0,s=>s.name='bad\nname']) {
    const bad=structuredClone(model);edit(bad.trunkSystems[0]);assert.throws(()=>encodePayload(bad));
  }
  const sparse=structuredClone(model);delete sparse.trunkSystems[0];sparse.trunkSystems.other=null;assert.throws(()=>encodePayload(sparse));
});

test('RX-only zero identity stays literal; deleting selected system repairs only startup references',()=>{
  const model=createDefaultModel(6);model.trunkSystems[0]=createTrunkSystem('RX SYSTEM');model.trunkSystems[1]=system();
  model.settings.trunkSystem=1;model.settings.trunkStartAtBoot=true;
  assert.deepEqual(decodePayload(encodePayload(model)),model);
  const channels=structuredClone(model.channels),other=structuredClone(model.trunkSystems[1]);clearTrunkSystem(model,0);
  assert.equal(model.settings.trunkSystem,0);assert.equal(model.settings.trunkStartAtBoot,false);
  assert.deepEqual(model.channels,channels);assert.deepEqual(model.trunkSystems[1],other);
  assert.throws(()=>upgradeModel(model,5));
});

test('every legacy upgrade is explicit and leaves startup off without mutating its source',()=>{
  for(const version of [3,4,5]) {
    const old=createDefaultModel(version),before=encodePayload(old),modern=upgradeModel(old,6);
    assert.equal(modern.trunkSystems.length,8);assert(modern.trunkSystems.every(x=>x===null));
    assert.equal(modern.settings.trunkSystem,0);assert.equal(modern.settings.trunkStartAtBoot,false);
    assert.deepEqual(encodePayload(old),before);assert.deepEqual(decodePayload(encodePayload(modern)),modern);
  }
});
