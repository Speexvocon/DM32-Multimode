// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {crc32} from '../model.js';
import {AppletClient, APPLET_LIMITS, parseAppletPackage, parseAppletStatus, parseAppletCatalogue} from '../applets.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const builder=fileURLToPath(new URL('../applets/applet-builder.zip',import.meta.url));
const python=`import importlib.util,json,pathlib,sys,tempfile,zipfile
with tempfile.TemporaryDirectory(prefix='dm32-web-applet-') as temporary:
 directory=pathlib.Path(temporary)
 with zipfile.ZipFile(sys.argv[1]) as archive:
  for name in ('tools/dm32_applet.py','examples/counter.dappsrc','examples/counter.dapp','examples/same-watch.dappsrc','examples/same-watch.dapp'):
   target=directory/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(name))
 p=directory/'tools/dm32_applet.py';s=importlib.util.spec_from_file_location('web_dapp_reference',p)
 m=importlib.util.module_from_spec(s);sys.modules[s.name]=m;s.loader.exec_module(m)
 examples=[]
 for p in sorted((directory/'examples').glob('*.dappsrc')):
  package=m.load_package(p)
  assert package.data==p.with_suffix('.dapp').read_bytes(), 'Bundled binary differs from bundled source: '+p.name
  examples.append(dict(package.describe(),data=package.data.hex()))
 print(json.dumps(examples))`;
const examples=JSON.parse(execFileSync('python',['-B','-c',python,builder],{encoding:'utf8'}));
assert(examples.length>0,'Use the real Python compiler examples');
const input=Uint8Array.from(Buffer.from(examples[0].data,'hex'));
const info=parseAppletPackage(input);

function repaired(data) {
  const output=data.slice(), body=new Uint8Array(output.length-4);
  body.set(output.subarray(0,60));body.set(output.subarray(64),60);
  new DataView(output.buffer).setUint32(60,crc32(body),true);return output;
}
function packageWith(op=0,a=0,b=0,imm=0,caps=0,strings='') {
  const data=new Uint8Array(72+strings.length),view=new DataView(data.buffer);
  data.set(new TextEncoder().encode('DAPP'));view.setUint16(4,1,true);view.setUint16(6,64,true);
  view.setUint32(8,data.length,true);view.setUint32(12,caps,true);view.setUint32(16,64,true);
  view.setUint16(20,1,true);view.setUint32(24,72,true);view.setUint32(28,strings.length,true);
  data.set(new TextEncoder().encode('Test'),32);data[64]=op;data[65]=a;
  view.setUint16(66,b,true);view.setUint32(68,imm,true);data.set(new TextEncoder().encode(strings),72);
  return repaired(data);
}

class Peer {
  constructor({fragment=0,override}={}) {
    this.fragment=fragment;this.override=override;this.commands=[];this.queue=[];this.waiters=[];
    this.slots=Array.from({length:8},(_,i)=>({slot:i+1,present:false,name:null,size:0,revision:0}));
    this.running=false;this.current=0;this.foreign=false;this.invalidations=[];this.releases=0;this.sessions=0;
    this.data=[];this.begin=null;this.active=false;
    this.session={read:()=>this.read(),write:data=>this.write(data),
      invalidate:fault=>{this.invalidations.push(fault);while(this.waiters.length)this.waiters.shift()({done:true});},
      release:()=>{this.releases++;}};
    this.client=new AppletClient({runSession:async operation=>{
      if(this.active)throw Object.assign(new Error('Serial busy'),{code:'IN_USE'});
      this.sessions++;this.active=true;
      try{return await operation(this.session);}finally{this.active=false;}
    },timeoutMs:200,operationTimeoutMs:300});
  }
  read() {return this.queue.length?Promise.resolve(this.queue.shift()):new Promise(resolve=>this.waiters.push(resolve));}
  reply(text) {
    const data=typeof text==='string'?new TextEncoder().encode(text):text;
    const fragment=this.fragment||data.length;
    for(let offset=0;offset<data.length;offset+=fragment) {
      const row={value:data.subarray(offset,offset+fragment),done:false};
      if(this.waiters.length)this.waiters.shift()(row);else this.queue.push(row);
    }
  }
  catalogue() {
    return ['APP STORE slots=8 bank_bytes=65536 partition_bytes=1048576 max_package=32768',
      ...(this.foreign?['APP STORE READ_ONLY foreign_data']:[]),
      ...this.slots.map(s=>s.present?`APP SLOT ${s.slot} name=${s.name} size=${s.size} seq=${s.revision}`:`APP SLOT ${s.slot} EMPTY`),
      'APP OK STORE STATUS'].join('\r\n')+'\r\n';
  }
  write(bytes) {
    const wire=new TextDecoder().decode(bytes);assert.match(wire,/^APP [ -~]+\r\n$/);assert(bytes.length<=121);
    const command=wire.slice(0,-2);this.commands.push(command);
    const parts=command.split(' ');let reply;
    if(command==='APP STORE STATUS')reply=this.running?'APP ERROR stop applet before listing storage\r\n':this.catalogue();
    else if(command==='APP STATUS')reply=`APP STATUS slot=${this.current} running=${Number(this.running)} operation=0 state=${this.running?2:0} instructions=20\r\n`;
    else if(parts[1]==='RUN'){this.running=true;this.current=Number(parts[2]);reply=`APP OK RUN ${parts[2]}\r\n`;}
    else if(command==='APP STOP'){this.running=false;reply='APP STOPPED; normal radio operation restored\r\n';}
    else if(parts[1]==='INSTALL'&&parts[2]==='BEGIN') {
      this.begin={slot:Number(parts[3]),size:Number(parts[4]),crc:Number(parts[5])};this.data=[];reply='APP OK INSTALL BEGIN\r\n';
    } else if(parts[1]==='INSTALL'&&parts[2]==='DATA') {
      assert.equal(Number(parts[3]),this.data.length);const data=Buffer.from(parts[4],'hex');assert(data.length<=32);
      this.data.push(...data);reply=`APP OK INSTALL DATA ${this.data.length}\r\n`;
    } else if(command==='APP INSTALL COMMIT') {
      assert.equal(this.data.length,this.begin.size);assert.equal(crc32(Uint8Array.from(this.data)),this.begin.crc);
      const packageInfo=parseAppletPackage(Uint8Array.from(this.data));const slot=this.slots[this.begin.slot-1];
      Object.assign(slot,{present:true,name:packageInfo.name,size:packageInfo.size,revision:((slot.revision+1)>>>0)||1});
      reply='APP OK INSTALL COMMIT\r\n';
    } else if(command==='APP INSTALL ABORT'){this.begin=null;reply='APP OK INSTALL ABORT\r\n';}
    else if(parts[1]==='REMOVE'){this.slots[Number(parts[2])-1].present=false;reply=`APP OK REMOVE ${parts[2]}\r\n`;}
    else assert.fail(command);
    if(this.override)reply=this.override(command,reply,this);
    if(reply!=null)this.reply(reply);
  }
}

test('local DAPP inspection matches the actual Python compiler without serial access',()=>{
  for(const example of examples) {
    const parsed=parseAppletPackage(Uint8Array.from(Buffer.from(example.data,'hex')));
    assert.equal(parsed.name,example.name);assert.equal(parsed.size,example.bytes);
    assert.equal(parsed.instructions,example.instructions);assert.equal(parsed.entry,example.entry);
    assert.deepEqual(parsed.capabilities,example.capabilities);
    assert.equal(parsed.crc32,example.package_crc32);assert.equal(parsed.uploadCrc32,example.upload_crc32);
  }
  const peer=new Peer();assert.equal(peer.sessions,0);assert.equal(peer.commands.length,0);
  const parsed=parseAppletPackage(input);parsed.data[0]=0;assert.equal(input[0],68,'Inspection owns a copy');
});

test('package header, canonical name, CRC, strings, VM operands and capabilities fail locally',()=>{
  for(const modify of [data=>data[0]=0,data=>data[56]=1,data=>data[55]=1,
    data=>new DataView(data.buffer).setUint16(22,65535,true),data=>data[12]=16]) {
    const data=input.slice();modify(data);assert.throws(()=>parseAppletPackage(repaired(data)),{code:'PACKAGE'});
  }
  const corrupt=input.slice();corrupt[corrupt.length-1]^=1;
  assert.throws(()=>parseAppletPackage(corrupt),/CRC32/);
  for(const args of [[16],[0,1],[1,8],[3,0,1],[6,0,0,60001],[8,0,1,0,0,'A'],
    [10,0,0,162412500,1],[14,0,14],[15,0,16,1,15]])
    assert.throws(()=>parseAppletPackage(packageWith(...args)),{code:'PACKAGE'});
  assert.throws(()=>parseAppletPackage(new Uint8Array(32769)),{code:'PACKAGE'});
  assert.equal(parseAppletPackage(packageWith(8,0,1,0,2,'A')).name,'Test');
});

const hasFirmwareValidator=existsSync(path.join(root,'src','firmware','radio_applet_vm.c'));
test('browser package acceptance agrees with the actual compiled firmware VM validator',{
  skip:hasFirmwareValidator?false:'Canonical firmware source is absent from this standalone CPS bundle'
},()=>{
  const folder=path.join(root,'build','web-applet-validator');mkdirSync(folder,{recursive:true});
  const executable=path.join(folder,process.platform==='win32'?'validator.exe':'validator');
  const source=String.raw`#include "radio_applet_vm.h"
#include <stdio.h>
#include <string.h>
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif
static unsigned length; static unsigned char data[32769];
static bool read_package(void *ctx,uint32_t offset,void *out,size_t count) {
 (void)ctx;if(offset>length || count>length-offset)return false;memcpy(out,data+offset,count);return true;
}
int main(void) {
#ifdef _WIN32
 _setmode(_fileno(stdin),_O_BINARY);
#endif
 unsigned char size[4];while(fread(size,1,4,stdin)==4) {
  length=(unsigned)size[0]|(unsigned)size[1]<<8|(unsigned)size[2]<<16|(unsigned)size[3]<<24;
  if(length>sizeof data || fread(data,1,length,stdin)!=length)return 2;
  radio_applet_package package;radio_applet_error error;
  printf("%u\n",radio_applet_vm_validate(read_package,NULL,&package,&error)?1u:0u);
 }return ferror(stdin)?3:0;
}`;
  execFileSync('gcc',['-std=c11','-O2','-Wall','-Wextra','-Werror','-Isrc/firmware',
    '-x','c','-','src/firmware/radio_applet_vm.c','-o',executable],{cwd:root,input:source});
  const cases=examples.map(example=>Uint8Array.from(Buffer.from(example.data,'hex')));
  for(const args of [[0],[1,7,0,0xffffffff],[2,0],[3,0,0,5],[4,0,0,6],[5],[6,0,0,60000],[7],
    [8,0,4,0,2,'Text'],[9,0,4,0,4,'Text'],[10,0,0,162550000,1],[11,0,0,0,3],
    [12,0,0,0,5],[13,7,0,0,2],[14,0,9],[14,0,8,0,8],[15,7,15,60000,15],
    [16],[0,1],[1,8],[3,0,1],[6,0,0,60001],[8,0,1,0,0,'A'],[10,0,0,162412500,1],
    [14,0,14],[15,0,16,1,15]])cases.push(packageWith(...args));
  for(const offset of [0,4,6,8,12,16,20,22,24,28,32,55,56,60]) {
    const data=packageWith();data[offset]^=0xff;cases.push(offset===60?data:repaired(data));
  }
  const inputBytes=Buffer.concat(cases.map(data=>{
    const size=Buffer.alloc(4);size.writeUInt32LE(data.length);return Buffer.concat([size,Buffer.from(data)]);
  }));
  const native=execFileSync(executable,[],{input:inputBytes,encoding:'utf8'}).trim().split(/\r?\n/).map(Number);
  const browser=cases.map(data=>{try{parseAppletPackage(data);return 1;}catch(fault){assert.equal(fault.code,'PACKAGE');return 0;}});
  assert.equal(native.length,cases.length);assert.deepEqual(browser,native);
});

test('fragmented multirow inventory and status keep the exact actual APP formats',async()=>{
  const peer=new Peer({fragment:3});Object.assign(peer.slots[2],{present:true,name:'SAME monitor',size:input.length,revision:5});
  const listed=await peer.client.list();assert.equal(listed.slots.length,8);assert.equal(listed.slots[2].revision,5);
  assert.equal(listed.slots[2].name,'SAME monitor');assert.equal(listed.readOnly,false);
  assert.deepEqual(await peer.client.status(),{slot:0,running:false,operation:0,state:0,stateName:'idle',instructions:20});
  assert.equal(peer.releases,0);assert.deepEqual(peer.commands,['APP STORE STATUS','APP STATUS']);
  assert.throws(()=>parseAppletStatus('APP STATUS slot=9 running=0 operation=0 state=0 instructions=1'));
  assert.throws(()=>parseAppletCatalogue(peer.catalogue().trim().split('\r\n').slice(0,-1)));
});

test('install acknowledges sequential32-byte chunks and verifies committed slot metadata without running',async()=>{
  const peer=new Peer();const events=[];peer.client.onProgress=value=>events.push(value);
  const installed=await peer.client.install(2,input);
  assert.equal(installed.verified,true);assert.equal(installed.name,info.name);assert.equal(installed.size,input.length);
  assert.equal(installed.uploadCrc32,crc32(input));assert.deepEqual(peer.data,[...input]);
  assert.equal(peer.commands.filter(command=>command==='APP STORE STATUS').length,2);
  assert.equal(peer.commands.filter(command=>command==='APP INSTALL COMMIT').length,1);
  assert(!peer.commands.some(command=>command.startsWith('APP RUN')));assert.equal(events.at(-1).current,input.length);
  assert.equal(peer.invalidations.length,0);
});

test('the maximum valid package and slot revision wrap match firmware bounds',async()=>{
  const data=new Uint8Array(32768),small=packageWith();data.set(small.subarray(0,64));
  const view=new DataView(data.buffer);view.setUint32(8,data.length,true);view.setUint16(20,4088,true);
  view.setUint32(24,data.length,true);view.setUint32(28,0,true);
  const maximum=repaired(data);assert.equal(parseAppletPackage(maximum).instructions,4088);
  const full=new Peer();const installed=await full.client.install(8,maximum);
  assert.equal(installed.size,32768);assert.equal(installed.verified,true);
  assert.equal(full.commands.filter(command=>command.startsWith('APP INSTALL DATA')).length,1024);
  const peer=new Peer();Object.assign(peer.slots[0],{present:true,name:'Old',size:input.length,revision:0xffffffff});
  assert.equal((await peer.client.install(1,input)).revision,1);
});

test('stop drains a long valid output backlog and asynchronous VM fault before its own ACK',async()=>{
  const peer=new Peer({override:(command,reply)=>command==='APP STOP'?
    Array.from({length:700},(_,i)=>`APP COUNT ${i}\r\n`).join('')+'APP ERROR runtime fuel\r\n'+reply:reply});
  // Real serial reads may combine lines, but remain bounded per delivered chunk.
  peer.fragment=2048;
  assert.deepEqual(await peer.client.stop(),{stopped:true});assert.equal(peer.releases,1);
  assert.equal(peer.commands.filter(command=>command==='APP STOP').length,1);
  assert.equal(peer.invalidations.length,0);
  const failed=new Peer({override:(command,reply)=>command==='APP STATUS'?'APP ERROR runtime service\r\n'+reply:reply});
  assert.equal((await failed.client.status()).running,false);assert.equal(failed.invalidations.length,0);
});

test('foreign partition is read-only and invalid packages never begin a flash transaction',async()=>{
  const peer=new Peer();peer.foreign=true;
  await assert.rejects(peer.client.install(1,input),{code:'READ_ONLY'});
  await assert.rejects(peer.client.remove(1),{code:'READ_ONLY'});
  assert(peer.commands.every(command=>command==='APP STORE STATUS'));
  assert.throws(()=>peer.client.install(1,new Uint8Array(64)),{code:'PACKAGE'});
  assert.throws(()=>peer.client.run(9),{code:'SLOT'});
});

test('run and stop preserve unsolicited output, release bridge only after complete stop ACK',async()=>{
  const peer=new Peer({override:(command,reply)=>command==='APP STATUS'?'APP COUNT 1\r\n'+reply:reply});
  const output=[];peer.client.onOutput=line=>output.push(line);
  assert.deepEqual(await peer.client.run(1),{slot:1,started:true});
  assert.equal((await peer.client.status()).running,true);assert(output.includes('APP COUNT 1'));assert.equal(peer.releases,0);
  assert.deepEqual(await peer.client.stop(),{stopped:true});assert.equal(peer.releases,1);
  const tailed=new Peer({override:(command,reply)=>command==='APP STOP'?reply+'extra\r\n':reply});
  await assert.rejects(tailed.client.stop(),{code:'FRAME'});assert.equal(tailed.releases,0);assert(tailed.invalidations.length);
});

test('remove verifies the tombstone; mismatched postcommit inventory is uncertain',async()=>{
  const peer=new Peer();Object.assign(peer.slots[0],{present:true,name:info.name,size:input.length,revision:5});
  assert.deepEqual(await peer.client.remove(1),{slot:1,removed:true,verified:true});
  const wrong=new Peer({override:(command,reply,p)=>{
    if(command==='APP INSTALL COMMIT')p.slots[0].name='Wrong name';return reply;
  }});
  await assert.rejects(wrong.client.install(1,input),{code:'UNCERTAIN'});assert(wrong.invalidations.length);
  assert(!wrong.commands.includes('APP INSTALL ABORT'),'Never undo a confirmed commit');
});

test('explicit data refusal aborts its admitted upload once, never retries or starts it',async()=>{
  const peer=new Peer({override:(command,reply)=>command.startsWith('APP INSTALL DATA')?'APP ERROR data readback failed\r\n':reply});
  await assert.rejects(peer.client.install(1,input),{code:'REFUSED'});
  assert.equal(peer.commands.filter(command=>command.startsWith('APP INSTALL DATA')).length,1);
  assert.equal(peer.commands.filter(command=>command==='APP INSTALL ABORT').length,1);
  assert(!peer.commands.includes('APP INSTALL COMMIT'));
});

test('lost mutating ACK invalidates the stream and never retries or sends an unsafe abort',async()=>{
  const peer=new Peer({override:(command,reply)=>command==='APP INSTALL COMMIT'?null:reply});peer.client.operationTimeoutMs=15;
  await assert.rejects(peer.client.install(1,input),{code:'UNCERTAIN'});
  assert.equal(peer.commands.filter(command=>command==='APP INSTALL COMMIT').length,1);
  assert(!peer.commands.includes('APP INSTALL ABORT'));assert(peer.invalidations.length);
});

test('malformed and oversized lines taint; clean firmware refusals remain actionable',async()=>{
  for(const reply of ['APP STATUS bad\n','A'.repeat(513)+'\r\n','APP STATUS x\0\r\n']) {
    const peer=new Peer({override:()=>reply});await assert.rejects(peer.client.status(),{code:'FRAME'});assert(peer.invalidations.length);
  }
  for(const [reply,code] of [['ERR stop Trunk RX first\r\n','TRUNK_ACTIVE'],
    ['APP ERROR programming session active\r\n','PROGRAMMING_ACTIVE'],['APP ERROR unknown app\r\n','UNSUPPORTED']]) {
    const peer=new Peer({override:()=>reply});await assert.rejects(peer.client.status(),{code});assert.equal(peer.invalidations.length,0);
  }
});

test('concurrent operations and invalid timeout bounds cannot interleave commands',async()=>{
  const peer=new Peer({override:()=>null});peer.client.timeoutMs=15;
  const waiting=peer.client.status();await assert.rejects(peer.client.stop(),{code:'IN_USE'});
  await assert.rejects(waiting,{code:'TIMEOUT'});assert.deepEqual(peer.commands,['APP STATUS']);
  assert.throws(()=>new AppletClient({runSession:()=>{},operationTimeoutMs:Infinity}),TypeError);
  assert.equal(APPLET_LIMITS.maxPackage,32768);
});
