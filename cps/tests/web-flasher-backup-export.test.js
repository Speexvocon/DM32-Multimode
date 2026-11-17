// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildBackupZip,createFullDump,backupCompatibility} from '../flasher/backup-export.js';
import {sealBackup,validateBackup} from '../flasher/package.js';

const encoder=new TextEncoder(),decoder=new TextDecoder();
const digest=b=>createHash('sha256').update(b).digest('hex');
const parse=b=>JSON.parse(decoder.decode(b));
function snapshot(blank=false) {
  return {program:new Uint8Array(0x100000).fill(blank?0:0xaa),data:new Uint8Array(0x1000000).fill(255)};
}
function pythonZip(zip) {
  const script=String.raw`import sys,io,zipfile,hashlib,json
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None
files={}
for info in z.infolist():
 data=z.read(info.filename)
 files[info.filename]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'compression':info.compress_type,'date':list(info.date_time),'flags':info.flag_bits,'extra':info.extra.hex()}
for manifest in ['manifest.json','full-dump.json']:
 if manifest in z.namelist():
  declared=json.loads(z.read(manifest))
  for name,record in declared['files'].items():assert {k:files[name][k] for k in ['bytes','sha256']}==record
print(json.dumps({'files':files,'names':z.namelist(),'readme':z.read('README-PRIVATE-BACKUP.txt').decode('utf8'),'comment':z.comment.decode()}))`;
  const p=spawnSync(process.env.CPS_TEST_PYTHON||'python',['-c',script],{input:zip,encoding:'utf8',maxBuffer:1024*1024});
  assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);
}

test('diagnostic full dump accepts blank application and unknown calibration without pretending to seal it',async()=>{
  const s=snapshot(true),files=await createFullDump(s,s,'test-radio','DM32.NRFB.01.050');
  assert.deepEqual([...files.keys()],['program.bin','data.bin','full-dump.json']);
  const m=parse(files.get('full-dump.json'));
  assert.equal(m.schema,'dm32-private-full-dump/1');assert.equal(m.board,'dm32');assert.equal(m.radio_label,'test-radio');
  assert.equal(m.installed_firmware,'DM32.NRFB.01.050');assert.equal(m.verification,'two-full-reads-identical');
  assert.match(m.scope,/not a sealed installer backup/);assert.match(m.scope,/no cross-radio restore/);
  assert.ok(Number.isFinite(Date.parse(m.created_utc)));
  for(const memory of ['program','data']) {
    const expected={bytes:s[memory].length,sha256:digest(s[memory])};
    assert.deepEqual(m.reads.first[memory],expected);assert.deepEqual(m.reads.second[memory],expected);assert.deepEqual(m.files[memory+'.bin'],expected);
  }
  assert.equal(files.has('manifest.json'),false);
  const loaded=pythonZip(buildBackupZip(files));assert.equal(loaded.names.length,4);assert.match(loaded.readme,/NOT a sealed installer backup/);
});
test('full dump rejects partial reads, byte mismatches and missing labels or versions',async()=>{
  const s=snapshot(),other={program:new Uint8Array(s.program),data:new Uint8Array(s.data)};
  other.program[0]^=1;await assert.rejects(createFullDump(s,other,'test','stock'),/reads differ/);other.program[0]^=1;
  other.data[other.data.length-1]^=1;await assert.rejects(createFullDump(s,other,'test','stock'),/reads differ/);
  await assert.rejects(createFullDump({...s,program:s.program.subarray(1)},s,'test','stock'),/1 MiB program and 16 MiB data/);
  await assert.rejects(createFullDump(s,{...s,data:s.data.buffer},'test','stock'),/1 MiB program and 16 MiB data/);
  for(const [label,firmware] of [['','stock'],['test',' '],[null,'stock'],['x'.repeat(201),'stock']])
    await assert.rejects(createFullDump(s,s,label,firmware));
});
test('full dump owns independent copies across asynchronous hashes and subsequent input mutation',async()=>{
  const s=snapshot(),before={program:digest(s.program),data:digest(s.data)};
  const promise=createFullDump(s,s,'fixture','stock');s.program[0]^=1;s.data[0]^=1;
  const files=await promise,m=parse(files.get('full-dump.json'));
  assert.equal(digest(files.get('program.bin')),before.program);assert.equal(digest(files.get('data.bin')),before.data);
  assert.equal(m.reads.first.program.sha256,before.program);assert.equal(m.reads.second.data.sha256,before.data);
  files.get('program.bin')[1]^=1;assert.equal(s.program[1],0xaa);
});
test('ZIP STORE is deterministic, Unicode-safe, independently readable by Python and preserves every byte',()=>{
  const backing=Uint8Array.from([99,0,1,2,3,88]);
  const files=new Map([['nested/caf\u00e9.bin',backing.subarray(1,5)],['manifest-example.json',encoder.encode('{"example":true}\n')],['empty.bin',new Uint8Array()]]);
  const original=new Map([...files].map(([name,content])=>[name,new Uint8Array(content)]));
  const zip=buildBackupZip(files),again=buildBackupZip(new Map([...files].reverse()));assert.deepEqual(zip,again);
  const before=digest(zip);backing[1]=42;assert.equal(digest(zip),before);
  const inspected=pythonZip(zip);assert.equal(inspected.comment,'');assert.deepEqual(inspected.names,[...files.keys(),'README-PRIVATE-BACKUP.txt'].sort());
  for(const [name,content] of original)assert.deepEqual({bytes:inspected.files[name].bytes,sha256:inspected.files[name].sha256},{bytes:content.length,sha256:digest(content)});
  for(const row of Object.values(inspected.files)) {
    assert.equal(row.compression,0);assert.deepEqual(row.date,[1980,1,1,0,0,0]);assert.equal(row.flags,0x800);assert.equal(row.extra,'');
  }
  assert.match(inspected.readme,/Keep this ZIP private/);assert.match(inspected.readme,/No files are uploaded automatically/);
  assert.match(inspected.readme,/public GitHub issue/);assert.match(inspected.readme,/Never restore one radio/);
  // Re-exporting an extracted archive retains its identical instructions file.
  original.set('README-PRIVATE-BACKUP.txt',encoder.encode(inspected.readme));assert.deepEqual(buildBackupZip(original),zip);
});
test('sealed installer backup files retain their original manifest and remain valid with export instructions',async()=>{
  const s=snapshot();s.data[0x1fff]=2;
  const files=await sealBackup(s,s,'synthetic-radio','synthetic stock');
  const manifestBefore=new Uint8Array(files.get('manifest.json')),before=new Map([...files].map(([name,b])=>[name,digest(b)]));
  const inspected=pythonZip(buildBackupZip(files));
  for(const [name,hash] of before)assert.equal(inspected.files[name].sha256,hash);
  assert.deepEqual(files.get('manifest.json'),manifestBefore);assert.equal(files.has('README-PRIVATE-BACKUP.txt'),false);
  const withInstructions=new Map(files);withInstructions.set('README-PRIVATE-BACKUP.txt',encoder.encode(inspected.readme));
  await validateBackup(withInstructions,'synthetic-radio');
});
test('ZIP refuses path traversal, extraction collisions, invalid paths, excessive size and excessive entry count',()=>{
  for(const name of ['../program.bin','/program.bin','C:/program.bin','folder\\program.bin','a//b','a/./b','a/../b','a/','a\0b','a\nb','a:b','a?b','CON','con.txt','dir/COM1.bin','file.','file ', '\ud800', 'a'.repeat(256),'a/'.repeat(256)+'b'])
    assert.throws(()=>buildBackupZip(new Map([[name,new Uint8Array()]])),/unsafe|too long|Unicode/i,name);
  for(const names of [['program.bin','PROGRAM.BIN'],['caf\u00e9.bin','cafe\u0301.bin']])
    assert.throws(()=>buildBackupZip(new Map(names.map(name=>[name,new Uint8Array()]))),/collide/);
  assert.throws(()=>buildBackupZip(new Map([['README-PRIVATE-BACKUP.txt',encoder.encode('different private original')]])),/not be overwritten/);
  assert.throws(()=>buildBackupZip(new Map(Array.from({length:1024},(_,i)=>['f'+i,new Uint8Array()]))),/too many files/);
  assert.throws(()=>buildBackupZip(new Map([['large.bin',new Uint8Array(64*1024*1024)]])),/64 MiB/);
  for(const files of [null,[],new Map(),{x:'not bytes'}])assert.throws(()=>buildBackupZip(files));
});
test('compatibility warning recognizes explicit NRFB050 labels with common punctuation and casing',()=>{
  for(const version of ['DM32.NRFB.01.050','NRFB050','nrfb 050','DM-32 NRFB 01 050','DM32/NRFB/01/050','NRFB:#01#050','Stock dm32.nrfb.01.050 (original)']) {
    const result=backupCompatibility({manifest:{installed_firmware:version}});
    assert.equal(result.incompatible,true,version);assert.equal(result.stockVersion,'DM32.NRFB.01.050');assert.match(result.reason,/currently incompatible; support planned/);
    assert.equal(backupCompatibility(null,version).incompatible,true);
  }
});
test('compatibility warning also checks program ASCII and never infers RF section from a flash ID',()=>{
  const s=snapshot(),program=s.program;program.set(encoder.encode('DM32.NRFB.01.050'),0xc080);
  assert.equal(backupCompatibility({program,manifest:{installed_firmware:'unknown'}}).incompatible,true);
  assert.equal(backupCompatibility({program,manifest:{installed_firmware:'049'}},'stock 049').incompatible,true);
  for(const label of ['DM32.NRF.01.049','NRFB051','DM32.NRFB.01.0500','NRFB050preview','NRFB','852018','C84018','unknown',''])
    assert.deepEqual(backupCompatibility({manifest:{installed_firmware:label},flash_jedec:'852018'}),{incompatible:false,reason:'',stockVersion:''});
  assert.deepEqual(backupCompatibility(),{incompatible:false,reason:'',stockVersion:''});
  assert.deepEqual(backupCompatibility({program:new Uint8Array([0x85,0x20,0x18]),flash_jedec:'852018'}),{incompatible:false,reason:'',stockVersion:''});
});
