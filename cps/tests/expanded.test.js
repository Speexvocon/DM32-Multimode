// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultModel, createScanList, encodePayload, decodePayload, upgradeModel,
  exportFile, importFile, validateModel, moveChannel, clearChannels, bulkEditChannels,
  exportChannelsCsv, importChannelsCsv, modelVersion, crc32} from '../model.js';

function fixture() {
  const model = createDefaultModel();
  for (const slot of [1, 2, 3, 32, 33, 255, 256]) model.channels[slot - 1] = {...structuredClone(model.vfos[0]), name:`CH${slot}`};
  model.zones[15] = {name:'ZONE 16', channels:[1, 33, 256]};
  model.scanLists[0] = {...createScanList('CH SCAN'), channels:[1, 2, 33, 255]};
  model.scanLists[15] = {...createScanList('TG SCAN', 'p25-tg', 256), reply:'fixed', replyChannel:255, talkgroups:[1, 10, 100, 1000, 65535]};
  Object.assign(model.settings, {selectionA:256, selectionB:255, zoneA:16, scanList:15});
  return model;
}

test('V4 geometry, CH256 selector, zone bit255 and final TG descriptor match independent offsets', () => {
  const model = fixture(), payload = encodePayload(model), global = 258 * 32, list = 381 * 32;
  assert.equal(modelVersion(model), 4); assert.equal(payload.length, 12384);
  assert.equal(payload[global + 10], 0); assert.equal(payload[global + 24], 1);
  assert.equal(payload[global + 11], 255); assert.equal(payload[global + 25], 0);
  assert.equal(payload[global + 26], 16); assert.equal(payload[global + 12], 15);
  assert.equal(payload[290 * 32 + 31], 128); // Zone16 membership CH256.
  assert.deepEqual([...payload.slice(list + 12, list + 23)], [1, 2, 0, 1, 255, 0, 232, 3, 208, 7, 5]);
  assert.deepEqual([...payload.slice(list + 64, list + 74)], [1, 0, 10, 0, 100, 0, 232, 3, 255, 255]);
  assert.deepEqual(decodePayload(payload), model);
  assert.deepEqual(importFile(exportFile(model)).model, model);
});

test('V4 rejects reserved fields, orphan references, invalid mode combinations and duplicate TGs', () => {
  for (const mutate of [
    m => {m.channels[255].scanLists=[0];}, m => {m.settings.selectionA=257;}, m => {m.settings.zoneA=17;},
    m => {m.zones[15].name='';}, m => {m.zones[15].channels=[256,256];}, m => {m.zones[15].channels=[254];},
    m => {m.settings.selectionB=2;m.settings.zoneB=16;}, m => {m.scanLists[15].talkgroups=[1,1];},
    m => {m.scanLists[15].talkgroups=Array.from({length:65},(_,i)=>i+1);}, m => {m.scanLists[15].baseChannel=254;},
    m => {m.scanLists[15].baseChannel=2;m.channels[1].mode='NFM';}, m => {m.scanLists[15].channels=[1];},
    m => {m.scanLists[15].replyChannel=254;}, m => {m.scanLists[15].reply='selected';},
    m => {m.scanLists[0].talkgroups=[10];}, m => {m.scanLists[0].baseChannel=1;},
    m => {m.scanLists[0].dwellMs=99;}, m => {m.scanLists[0].dwellMs=5001;}, m => {m.scanLists[0].holdMs=10001;},
  ]) {const model=fixture();mutate(model);assert(validateModel(model).length);assert.throws(()=>encodePayload(model));}
  for (const [key, offset] of [[0,13],[258,28],[289,12],[381,23],[381,31],[386,31]]) {
    const bytes=encodePayload(fixture());bytes[key*32+offset]=1;assert.throws(()=>decodePayload(bytes),`${key}:${offset}`);
  }
  for (const bytes of [new Uint8Array(12383),new Uint8Array(12385)]) assert.throws(()=>decodePayload(bytes,4),/12384/);
});

test('V4 all 256 channels and 64 independent talkgroups round-trip with upper limits', () => {
  const model=createDefaultModel();
  model.channels=Array.from({length:256},(_,i)=>({...structuredClone(model.vfos[0]),name:`CH${i+1}`,talkgroup:65535-i}));
  model.zones=Array.from({length:16},(_,i)=>({name:`ZONE${i+1}`,channels:Array.from({length:256},(_,n)=>n+1)}));
  model.scanLists=Array.from({length:16},(_,i)=>({...createScanList(`TGS${i+1}`,'p25-tg',i+1),dwellMs:5000,holdMs:10000,talkgroups:Array.from({length:64},(_,n)=>65535-n)}));
  model.settings.selectionB=256;model.settings.zoneB=16;
  const payload=encodePayload(model);assert.deepEqual(decodePayload(payload),model);
  assert.deepEqual(encodePayload(importFile(exportFile(model)).model),payload);
});

test('explicit legacy upgrade retains channels, VFOs, settings and all four membership maps', () => {
  const legacy=createDefaultModel(3);legacy.channels[31]={...structuredClone(legacy.vfos[0]),name:'LAST LEGACY',scanLists:[0,3]};
  legacy.vfos[0].scanLists=[1];Object.assign(legacy.settings,{selectionA:32,scanList:3});
  const before=encodePayload(legacy),model=upgradeModel(legacy);
  assert.deepEqual(encodePayload(legacy),before);assert.equal(model.channels.length,256);
  assert.deepEqual(model.scanLists[0].channels,[32]);assert.deepEqual(model.scanLists[3].channels,[32]);assert.deepEqual(model.scanLists[1].channels,[]);
  assert.equal(model.scanLists[0].name,'Scan 1');assert.equal(model.scanLists[3].name,'Scan 4');assert(model.scanLists.slice(0,4).every(list=>list.reply==='last-heard'));
  assert.equal(model.channels[31].name,'LAST LEGACY');assert.equal(model.settings.selectionA,32);
  assert.deepEqual(model.vfos[0].scanLists,[]);assert.deepEqual(decodePayload(encodePayload(model)),model);
  const file=exportFile(legacy);assert.equal(JSON.parse(file).version,3);assert.deepEqual(encodePayload(importFile(file).model),before);
});

test('slot movement follows every reference in both directions without changing identities', () => {
  const model=fixture(),original=structuredClone(model);
  moveChannel(model,256,1);
  assert.equal(model.channels[0].name,'CH256');assert.equal(model.settings.selectionA,1);assert.equal(model.settings.selectionB,256);
  assert.deepEqual(model.zones[15].channels,[1,2,34]);assert.equal(model.scanLists[15].baseChannel,1);assert.equal(model.scanLists[15].replyChannel,256);
  moveChannel(model,1,256);assert.deepEqual(model,original);
  assert.throws(()=>moveChannel(model,254,1),/empty/);assert.deepEqual(model,original);
});

test('clearing repairs references; bulk edits and imports are atomic and reject incompatible modes', () => {
  const model=fixture();clearChannels(model,[255,256]);assert.equal(model.settings.selectionA,0);assert.equal(model.scanLists[15],null);
  assert.deepEqual(model.zones[15].channels,[1,33]);assert.deepEqual(validateModel(model),[]);
  const before=JSON.stringify(model);assert.throws(()=>bulkEditChannels(model,[1,2],{colorCode:1}),/incompatible/);assert.equal(JSON.stringify(model),before);
  assert.throws(()=>bulkEditChannels(model,[1,2],{talkgroup:0}));assert.equal(JSON.stringify(model),before);
  bulkEditChannels(model,[1,2],{powerLevel:8,filter:'NAC+TG'});assert.equal(model.channels[0].powerLevel,8);assert.equal(model.channels[1].filter,'NAC+TG');
});

test('CSV exact field export/import preserves modes, quotes and references without coercion or partial changes', () => {
  const model=fixture();model.channels[0].name='Comma, "Q"';
  const csv=exportChannelsCsv(model),before=JSON.stringify(model);
  assert(csv.includes('"Comma, ""Q"""'));assert.deepEqual(importChannelsCsv(csv,model),model);
  for (const input of [csv.replace('channel,name','slot,name'),csv.replace('145700000','145.7'),csv.replace('false','0'),csv.replace('P25','DMR'),csv+csv.split('\r\n')[1]+'\r\n',csv.slice(0,-2)+'"']) assert.throws(()=>importChannelsCsv(input,model));
  assert.equal(JSON.stringify(model),before);
  const legacy=createDefaultModel(3);legacy.channels[0]={...structuredClone(legacy.vfos[0]),scanLists:[0,3]};assert.deepEqual(importChannelsCsv(exportChannelsCsv(legacy),legacy),legacy);
  assert.equal(crc32(encodePayload(importChannelsCsv(csv,model))),crc32(encodePayload(model)));
});
