// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTACT_COUNT, CONTACT_NAME_BYTES, RECORD_COUNT, createDefaultModel, modelVersion,
  encodePayload, decodePayload, validateModel, upgradeModel, exportFile, importFile,
  exportContactsCsv, importContactsCsv, setChannelMode, exportChannelsCsv, importChannelsCsv} from '../model.js';

const contact=(protocol='Both',type='unit',id=0xffffff,name='PORTABLE ONE')=>({protocol,type,id,name});

test('V5 contacts occupy the last 96 records with independently checked byte layout',()=>{
  const model=createDefaultModel();assert.equal(modelVersion(model),5);
  assert.equal(CONTACT_COUNT,96);assert.equal(CONTACT_NAME_BYTES,24);assert.equal(RECORD_COUNT,499);
  model.contacts[95]=contact('Both','unit',0x123456,'ABCDEFGHIJKLMNOPQRSTUVWX');
  const payload=encodePayload(model),offset=482*32;
  assert.equal(payload.length,15456);
  assert.deepEqual([...payload.slice(offset,offset+4)],[7,0x56,0x34,0x12]);
  assert.equal(new TextDecoder().decode(payload.slice(offset+4,offset+28)),'ABCDEFGHIJKLMNOPQRSTUVWX');
  assert(payload.slice(offset+28,offset+32).every(x=>x===0));
  assert.deepEqual(decodePayload(payload),model);assert.deepEqual(importFile(exportFile(model)).model,model);
  model.contacts=Array.from({length:96},(_,i)=>contact('Both','unit',i+1));
  assert.deepEqual(decodePayload(encodePayload(model)),model);
});

test('contact identities are typed and protocol-scoped; invalid or ambiguous names fail closed',()=>{
  const valid=createDefaultModel();valid.contacts[0]=contact('P25','unit',1);
  valid.contacts[1]=contact('DMR','unit',1);valid.contacts[2]=contact('Both','group',1);
  assert.deepEqual(validateModel(valid),[]);
  for(const mutate of [
    m=>{m.contacts[3]=contact('Both','unit',1);},m=>{m.contacts[0].protocol='p25';},m=>{m.contacts[0].protocol='constructor';},
    m=>{m.contacts[0].name='';},m=>{m.contacts[0].name='A'.repeat(25);},m=>{m.contacts[0].name='A\nB';},
    m=>{m.contacts[0].id=0;},m=>{m.contacts[0].id=0x1000000;},m=>{m.contacts[2].id=65536;},
    m=>{m.contacts[0].type='private';},m=>{m.contacts.pop();},m=>{delete m.contacts[0];},
    m=>{m.contacts[0].extra=1;},
  ]){const m=structuredClone(valid);mutate(m);assert(validateModel(m).length);assert.throws(()=>encodePayload(m));}
  const m=createDefaultModel();m.contacts[0]=contact('DMR','group',0xffffff);assert.deepEqual(validateModel(m),[]);
  for(const byte of [0,28,31]){const bytes=encodePayload(m);bytes[387*32+byte]=byte===0?17:1;assert.throws(()=>decodePayload(bytes));}
  const bytes=encodePayload(createDefaultModel());bytes[387*32+4]=65;assert.throws(()=>decodePayload(bytes),/empty contact/);
});

test('V5 P25 individual IDs retain the group and never overlap DMR or analog unions',()=>{
  const m=createDefaultModel(),p=m.vfos[0];p.talkgroup=65535;p.privateCall=true;p.destinationId=0xffffff;
  const bytes=encodePayload(m),o=256*32;
  assert.deepEqual([...bytes.slice(o+26,o+30)],[255,255,255,1]);
  assert.deepEqual([...bytes.slice(o+10,o+12)],[255,255]);assert.deepEqual(decodePayload(bytes),m);
  for(const id of [0,0x1000000,1.5]){p.destinationId=id;assert.throws(()=>encodePayload(m));}
  p.destinationId=1;p.privateCall=false;assert(encodePayload(m).slice(o+26,o+30).every(x=>!x));
  setChannelMode(p,'DMR',5);p.destinationId=0xffffff;p.privateCall=true;assert.deepEqual(decodePayload(encodePayload(m)),m);
  setChannelMode(p,'P25',5);assert.equal(p.privateCall,false);assert.equal(p.destinationId,1);
  setChannelMode(p,'FM',5);assert.equal(p.privateCall,undefined);assert.equal(p.destinationId,undefined);
  assert.deepEqual(decodePayload(encodePayload(m)),m);
});

test('V4 imports preserve original bytes and upgrade explicitly without losing references or IDs',()=>{
  const v4=createDefaultModel(4);v4.channels[255]={...structuredClone(v4.vfos[0]),name:'LAST',talkgroup:65535};
  v4.settings.selectionA=256;v4.zones[15]={name:'HOME',channels:[256]};v4.settings.zoneA=16;
  const original=encodePayload(v4),saved=exportFile(v4),read=importFile(saved).model;
  assert.equal(modelVersion(read),4);assert.equal(read.contacts,undefined);assert.deepEqual(encodePayload(read),original);
  const modern=upgradeModel(read);assert.equal(modelVersion(modern),5);assert.equal(modern.contacts.length,96);
  assert.equal(modern.channels[255].talkgroup,65535);assert.equal(modern.channels[255].privateCall,false);
  assert.deepEqual(modern.zones,v4.zones);assert.equal(modern.settings.selectionA,256);
  assert.deepEqual(encodePayload(read),original);assert.deepEqual(decodePayload(encodePayload(modern)),modern);
  read.unknown='keep?';assert.throws(()=>upgradeModel(read),/Unknown field/);
});

test('contact CSV imports are atomic slot merges and preserve channel CSV call addressing',()=>{
  const m=createDefaultModel();m.contacts[0]=contact('P25','unit',1,'A, "B"');m.contacts[95]=contact('DMR','group',98638,'NET');
  assert.deepEqual(importContactsCsv(exportContactsCsv(m),createDefaultModel()),m);
  const partial=importContactsCsv('contact,protocol,type,id,name\r\n2,P25,unit,2,TWO\r\n',m);
  assert.deepEqual(partial.contacts[0],m.contacts[0]);assert.equal(partial.contacts[1].name,'TWO');assert.deepEqual(m.contacts[1],null);
  for(const csv of ['contact,protocol,type,id,name\n97,P25,unit,2,X\n',
    'contact,protocol,type,id,name\n2,P25,unit,1,DUP\n',
    'contact,protocol,type,id,name\n2,P25,unit,2,X\n2,DMR,unit,3,Y\n']) {
    const before=exportFile(m);assert.throws(()=>importContactsCsv(csv,m));assert.equal(exportFile(m),before);
  }
  m.channels[0]={...structuredClone(m.vfos[0]),privateCall:true,destinationId:0xffffff};
  assert.deepEqual(importChannelsCsv(exportChannelsCsv(m),m),m);
});


test('Last heard button action is explicit V5 data and old schemas keep their exact bounds',()=>{
  for(const key of ['p1Action','p2Action','sk1Action','sk2Action']) {
    const current=createDefaultModel();current.settings[key]=9;
    assert.deepEqual(decodePayload(encodePayload(current)),current);
    for(const version of [3,4]){const old=createDefaultModel(version);old.settings[key]=9;assert.throws(()=>encodePayload(old));}
  }
});
