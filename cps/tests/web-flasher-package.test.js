// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as production from '../flasher/package.js';

const enc=new TextEncoder(),dec=new TextDecoder();
const digest=b=>createHash('sha256').update(b).digest('hex');
const json=b=>JSON.parse(dec.decode(b));
const pack=o=>enc.encode(JSON.stringify(o,null,2)+'\n');
const copyFiles=files=>new Map([...files].map(([k,v])=>[k,new Uint8Array(v)]));
const refs=[[0x19540,0x22754,0x26cac],[0x19540,0x22754,0x26cac],[0x19540,0x22754,0x26cac],[0x1e270,0x26d8c,0x2b2e4]];
function crc32(bytes) {let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;}
const contracts=production.nativeContracts();
function syntheticNative(index) {
  const row=contracts[index],code=Uint8Array.from({length:row.code_bytes},(_,i)=>(i*17+31+index)&255);
  const view=new DataView(code.buffer);view.setUint32(0,0x152514d8,true);view.setUint32(4,0x74c776cd,true);
  row.relocations.forEach((at,i)=>view.setUint32(at,refs[index][i],true));
  const tables=Uint8Array.from({length:row.tables_bytes},(_,i)=>(i*7+29)&255);
  if(index===3)tables[tables.length-1]^=1;
  return {code,tables};
}
// Production never accepts a caller-supplied codec contract. This isolated test
// module replaces fixed fingerprints with synthetic fixture fingerprints only;
// no native firmware/owner backup bytes are checked in or downloaded by tests.
let testSource=readFileSync(new URL('../flasher/package.js',import.meta.url),'utf8');
for(let i=0;i<contracts.length;i++)testSource=testSource.replaceAll(contracts[i].code_sha256,digest(syntheticNative(i).code));
testSource=testSource.replaceAll(contracts[0].tables_sha256,digest(syntheticNative(0).tables));
testSource=testSource.replaceAll(contracts[3].tables_sha256,digest(syntheticNative(3).tables));
testSource=testSource.replace('0x11475389',`0x${crc32(syntheticNative(0).tables.subarray(0,64)).toString(16)}`);
const engine=await import('data:text/javascript;base64,'+Buffer.from(testSource).toString('base64'));
function snapshot(index=0) {
  const program=new Uint8Array(production.PROGRAM_SIZE).fill(0xaa),data=new Uint8Array(production.DATA_SIZE).fill(0xff);
  const {code,tables}=syntheticNative(index);program.set(code,0x50000);program.set(tables,0x90000);data[0x1fff]=2;
  return {program,data};
}
const app=Uint8Array.from({length:256},(_,i)=>(i*3+21)&255);
function release(rows=engine.nativeContracts()) {
  const manifest={schema:'dm32-multimode-release/1',board:'dm32',version:'0.9.0-test',source_commit:'a'.repeat(40),
    application:{file:'test-application.bin',bytes:app.length,sha256:digest(app),load_address:'0x0300C000',contains_native_codec:false,directly_flashable:false},
    upstream:{radiofoundry_commit:production.UPSTREAM_COMMIT},
    supported_native_codecs:rows};
  return {manifest,bytes:pack(manifest),path:'firmware/v0.9.0-test/release.json'};
}
let baseFiles,baseBackup;
async function baseline() {
  if(!baseFiles){const s=snapshot();baseFiles=await engine.sealBackup(s,s,'test-radio','synthetic');baseBackup=await engine.validateBackup(baseFiles,'test-radio');}
  return {files:baseFiles,backup:baseBackup};
}
function withRelease(prepared,r=release()) {
  const files=copyFiles(prepared.files);files.set(r.path,r.bytes);files.set(r.path.replace('release.json','test-application.bin'),app);return files;
}

test('sealed two-read backup has the exact CLI file contract and independent copies',async()=>{
  const s=snapshot(),files=await engine.sealBackup(s,s,'fixture-radio','synthetic');
  const manifest=json(files.get('manifest.json'));
  assert.equal(manifest.verification,'two-full-reads-identical');assert.equal(manifest.upstream_commit,production.UPSTREAM_COMMIT);
  assert.deepEqual([...files.keys()].sort(),['bootloader-reference.bin','calibration/copy-710000.bin','calibration/factory-001000.bin',
    'data.bin','manifest.json','program.bin','readback/data.bin','readback/program.bin','restore-application.bin'].sort());
  for(const [name,bytes] of files)if(name!=='manifest.json')assert.deepEqual(manifest.files[name],{bytes:bytes.length,sha256:digest(bytes)});
  assert.notEqual(files.get('program.bin'),files.get('readback/program.bin'));
  s.program[0]=0;assert.equal(files.get('program.bin')[0],0xaa);
  const backup=await engine.validateBackup(files,'fixture-radio');files.get('program.bin')[0]=3;assert.equal(backup.program[0],0xaa);
});
test('backup refuses incomplete, blank, disagreeing, uncalibrated or mislabeled inputs',async()=>{
  const s=snapshot(),other={program:new Uint8Array(s.program),data:new Uint8Array(s.data)};other.data[100]^=1;
  await assert.rejects(engine.sealBackup(s,other,'fixture','synthetic'),/reads differ/);
  await assert.rejects(engine.sealBackup({...s,program:new Uint8Array(4)},s,'fixture','synthetic'),/Incomplete/);
  const blank=snapshot();blank.program.fill(0,0,16);await assert.rejects(engine.sealBackup(blank,blank,'fixture','synthetic'),/Blank bootloader/);
  blank.program.fill(0xaa,0,16);blank.program.fill(255,production.APP_START,production.APP_START+16);
  await assert.rejects(engine.sealBackup(blank,blank,'fixture','synthetic'),/Blank application/);
  const noCal=snapshot();noCal.data[0x1fff]=255;await assert.rejects(engine.sealBackup(noCal,noCal,'fixture','synthetic'),/calibration/);
  const {files}=await baseline();await assert.rejects(engine.validateBackup(files,'other-radio'),/Wrong radio label/);
});
test('every required backup file is content checked; extra log files are harmless',async()=>{
  const {files}=await baseline();
  for(const name of ['readback/program.bin','readback/data.bin','bootloader-reference.bin','restore-application.bin','calibration/factory-001000.bin']) {
    const bad=copyFiles(files);bad.get(name)[0]^=1;await assert.rejects(engine.validateBackup(bad),/checksum\/content/);
  }
  const extra=new Map(files);extra.set('read.log',enc.encode('Synthetic reader log'));await engine.validateBackup(extra);
  const missing=new Map(files);missing.delete('data.bin');await assert.rejects(engine.validateBackup(missing),/Missing required/);
  const manifest=json(files.get('manifest.json'));manifest.files['../escape']={bytes:1,sha256:'0'};
  const bad=new Map(files);bad.set('manifest.json',pack(manifest));await assert.rejects(engine.validateBackup(bad),/unexpected paths/);
});
test('preflight protects all calibration pages and bootloader while allowing ordinary app/settings changes',async()=>{
  const {backup}=await baseline(),s={program:new Uint8Array(backup.program),data:new Uint8Array(backup.data)};
  s.program[production.APP_START]^=1;s.data[0xd00000]^=1;engine.compareSnapshot(s,backup);
  assert.throws(()=>engine.compareSnapshot(s,backup,{full:true}),/Full memory/);
  s.program[0]^=1;assert.throws(()=>engine.compareSnapshot(s,backup),/Bootloader or factory/);s.program[0]^=1;
  s.data[0x1000]^=1;assert.throws(()=>engine.compareSnapshot(s,backup),/Bootloader or factory/);s.data[0x1000]^=1;
  s.data[0x2fff]=2;assert.throws(()=>engine.compareSnapshot(s,backup),/Bootloader or factory/);
});
test('real production contracts reject synthetic native code, with no configurable bypass',async()=>{
  const {files}=await baseline(),backup=await production.validateBackup(files);
  const r=release(production.nativeContracts());await assert.rejects(production.prepareRelease(r,app,backup),/not recognized/);
  const altered=production.nativeContracts();altered[0].run++;
  await assert.rejects(production.prepareRelease(release(altered),app,backup),/contract differs/);
});
test('all four slot contracts, raw/vendor wrapping and CRC match independent Python packing',async()=>{
  const python=String.raw`import sys,json,struct,zlib,hashlib,base64
p=json.load(sys.stdin); app=base64.b64decode(p['app']); out=[]
for i,r in enumerate(p['rows']):
 c=bytearray((n*17+31+i)&255 for n in range(r['code_bytes']));struct.pack_into('<II',c,0,0x152514D8,0x74C776CD)
 for at,value in zip(r['relocations'],p['refs'][i]):struct.pack_into('<I',c,at,value)
 t=bytearray((n*7+29)&255 for n in range(r['tables_bytes']))
 if i==3:t[-1]^=1
 rel=struct.pack('<3I',*r['relocations']);toff=128+((len(c)+3)&~3);roff=toff+((len(t)+3)&~3)
 crc=zlib.crc32(rel,zlib.crc32(t,zlib.crc32(c))); fields=[0x43524444,2,128,len(c),r['run'],toff,len(t),r['tables_ram']]+[r['entries'][k] for k in ['decode','encode','dec_init','dec_set','enc_init','enc_set','fec_init']]+[r['stock_tag'],crc,roff,3]
 head=struct.pack('<19I',*fields)+bytes(52);slot=head+c+bytes([255])*(toff-128-len(c))+t+bytes([255])*(roff-toff-len(t))+rel
 raw=app+bytes([255])*(0xDC000-len(app))+slot;vendor=bytearray([255])*256;vendor[:9]=b'BFUV32-V2';vendor[253:]=b'END';vendor+=raw
 h=lambda b:hashlib.sha256(b).hexdigest()
 out.append({'raw':h(raw),'vendor':h(vendor),'slot':h(slot),'crc':crc,'head':head.hex(),'length':len(slot)})
print(json.dumps(out))`;
  const result=spawnSync(process.env.CPS_TEST_PYTHON||'python',['-c',python],{input:JSON.stringify({app:Buffer.from(app).toString('base64'),rows:engine.nativeContracts(),refs}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const expected=JSON.parse(result.stdout);
  for(let i=0;i<4;i++) {
    const s=snapshot(i),files=await engine.sealBackup(s,s,'matrix-radio','synthetic'),backup=await engine.validateBackup(files);
    const p=await engine.prepareRelease(release(),app,backup),slot=p.raw.subarray(production.SLOT_OFFSET);
    assert.equal(digest(p.raw),expected[i].raw);assert.equal(digest(p.vendor),expected[i].vendor);assert.equal(digest(slot),expected[i].slot);
    assert.equal(Buffer.from(slot.subarray(0,128)).toString('hex'),expected[i].head);
    assert.equal(p.manifest.native_codec.crc,expected[i].crc);assert.equal(p.manifest.native_codec.length,expected[i].length);
    assert.deepEqual(p.raw.subarray(0,app.length),app);assert.ok(p.raw.subarray(app.length,production.SLOT_OFFSET).every(b=>b===255));
    assert.equal(dec.decode(p.vendor.subarray(0,9)),'BFUV32-V2');assert.equal(dec.decode(p.vendor.subarray(253,256)),'END');
    assert.deepEqual(p.vendor.subarray(256),p.raw);assert.deepEqual([...p.files.keys()].sort(),[production.RAW_NAME,production.VENDOR_NAME,'package.json'].sort());
    await engine.validatePrepared(withRelease(p),backup);
  }
});
test('release gate rejects bare apps, changed application, traversal, overlap, unknown or repeated contracts',async()=>{
  const {backup}=await baseline();
  await assert.rejects(engine.prepareRelease({},app,backup),/original release.json bytes/);
  const altered=new Uint8Array(app);altered[0]^=1;await assert.rejects(engine.prepareRelease(release(),altered,backup),/SHA-256/);
  for(const modify of [r=>r.manifest.application.file='../app.bin',r=>r.manifest.version='../bad',r=>r.manifest.source_commit='bad',
    r=>r.manifest.supported_native_codecs.push(r.manifest.supported_native_codecs[0]),r=>r.manifest.supported_native_codecs[0].entries.decode=2,
    r=>r.manifest.application.load_address='0x03000000',r=>r.manifest.application.contains_native_codec=true,
    r=>r.manifest.application.directly_flashable=true,r=>r.manifest.upstream.radiofoundry_commit='b'.repeat(40)]) {
    const r=release();modify(r);r.bytes=pack(r.manifest);await assert.rejects(engine.prepareRelease(r,app,backup));
  }
  const huge=new Uint8Array(production.SLOT_OFFSET+1).fill(0xaa),r=release();r.manifest.application.bytes=huge.length;r.manifest.application.sha256=digest(huge);r.bytes=pack(r.manifest);
  await assert.rejects(engine.prepareRelease(r,huge,backup),/overlaps/);
  await assert.rejects(engine.prepareRelease({...release(),path:'../release.json'},app,backup),/relative file path/);
});
test('historical single-codec releases retain their narrower qualification gate',async()=>{
  const {backup}=await baseline(),r=release();delete r.manifest.supported_native_codecs;
  const native=engine.nativeContracts()[2];r.manifest.qualified_native_codec={code_sha256:native.code_sha256,tables_sha256:native.tables_sha256};r.bytes=pack(r.manifest);
  await assert.rejects(engine.prepareRelease(r,app,backup),/not declared/);
});
test('prepared package binding/provenance/CRC/content cannot be bypassed by editing package hashes',async()=>{
  const {backup}=await baseline(),p=await engine.prepareRelease(release(),app,backup);
  const cases=[files=>{const m=json(files.get('package.json'));m.radio_label='other';files.set('package.json',pack(m));},
    files=>{const m=json(files.get('package.json'));m.release_manifest='../release.json';files.set('package.json',pack(m));},
    files=>{const m=json(files.get('package.json'));m.native_codec.crc^=1;files.set('package.json',pack(m));},
    files=>{const raw=files.get(production.RAW_NAME);raw[production.SLOT_OFFSET+128]^=1;const m=json(files.get('package.json'));m.files[production.RAW_NAME].sha256=digest(raw);files.set('package.json',pack(m));},
    files=>{const raw=files.get(production.RAW_NAME);raw[app.length]^=1;const m=json(files.get('package.json'));m.files[production.RAW_NAME].sha256=digest(raw);files.set('package.json',pack(m));},
    files=>files.get(production.VENDOR_NAME)[255]^=1,
    files=>{const m=json(files.get('package.json'));m.files.extra={bytes:0,sha256:digest(new Uint8Array())};files.set('package.json',pack(m));},
    files=>files.get(release().path)[0]^=1];
  for(const change of cases){const files=withRelease(p);change(files);await assert.rejects(engine.validatePrepared(files,backup));}
  const noRelease=copyFiles(p.files);await assert.rejects(engine.validatePrepared(noRelease,backup),/Missing required file/);
});
test('post-transfer verification requires the new merged application, not the original image',async()=>{
  const {backup}=await baseline(),p=await engine.prepareRelease(release(),app,backup),s={program:new Uint8Array(backup.program),data:new Uint8Array(backup.data)};
  await assert.rejects(engine.verifyInstalled(s,backup,p.raw),/differs from/);
  s.program.set(p.raw,production.APP_START);s.data[0xd00000]^=1;
  const result=await engine.verifyInstalled(s,backup,p.raw);assert.equal(result.application_sha256,digest(p.raw));assert.equal(result.application_matches,true);
  s.data[0x1001]^=1;await assert.rejects(engine.verifyInstalled(s,backup,p.raw),/calibration differs/);
});
test('validated backup mutation is rechecked before packaging; outputs do not alias raw/vendor',async()=>{
  const {files}=await baseline(),backup=await engine.validateBackup(files),p=await engine.prepareRelease(release(),app,backup);
  p.files.get(production.RAW_NAME)[0]^=1;assert.equal(p.raw[0],app[0]);p.files.get(production.VENDOR_NAME)[0]^=1;assert.equal(p.vendor[0],66);
  backup.program[0x50020]^=1;await assert.rejects(engine.prepareRelease(release(),app,backup),/changed in memory/);
  backup.manifest.radio_label='tampered';await assert.rejects(engine.prepareRelease(release(),app,backup),/manifest changed/);
  assert.throws(()=>engine.compareSnapshot(snapshot(),backup),/Validate the complete/);
  assert.throws(()=>engine.compareSnapshot(snapshot(),snapshot()),/Validate the complete/);
});
test('preparation uses private validated bytes across asynchronous hashing, not mutable caller arrays',async()=>{
  const {files}=await baseline(),backup=await engine.validateBackup(files),originalHash=digest(backup.program);
  const preparation=engine.prepareRelease(release(),app,backup);
  backup.program[0x50020]^=1;backup.data[0x1000]^=1;backup.manifest.radio_label='changed-after-start';
  const prepared=await preparation;
  assert.equal(prepared.manifest.radio_label,'test-radio');assert.equal(prepared.manifest.backup_program_sha256,originalHash);
  assert.equal(prepared.manifest.native_codec.code_sha256,engine.nativeContracts()[0].code_sha256);
});
