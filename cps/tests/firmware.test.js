// SPDX-License-Identifier: GPL-3.0-or-later
// Exercise the browser client against the actual application parser and store.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {CpsClient} from '../transport.js';
import {decodePayload, encodePayload, crc32, createScanList, upgradeModel, setChannelMode} from '../model.js';

const library = process.env.CPS_ADAPTER_LIBRARY;
const bridge = fileURLToPath(new URL('../../../tests/web_cps_bridge.py', import.meta.url));

function fixture() {
  const child = spawn(process.env.CPS_TEST_PYTHON || 'python', ['-u', bridge, library], {stdio: ['pipe', 'pipe', 'pipe']});
  const waiting = [];
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  createInterface({input: child.stdout}).on('line', line => {
    const current = waiting.shift();
    if (!current) return;
    try { const value = JSON.parse(line); if (value.error) current.reject(new Error(value.error)); else current.resolve(value); }
    catch (error) { current.reject(error); }
  });
  child.on('error', error => { while (waiting.length) waiting.shift().reject(error); });
  child.on('exit', code => { while (waiting.length) waiting.shift().reject(new Error(`C bridge exited ${code}: ${stderr}`)); });
  const rpc = request => new Promise((resolve, reject) => {
    waiting.push({resolve, reject});
    child.stdin.write(JSON.stringify(request) + '\n');
  });
  const commands = [];
  const port = {
    dropCommitReply: false,
    async open(options) {
      assert.equal(options.baudRate, 115200);
      this.readable = new ReadableStream({start: controller => { this.controller = controller; }});
      this.writable = new WritableStream({write: async data => {
        const command = new TextDecoder().decode(data).trim();
        assert.match(command, /^CPS (HELLO|GET|BEGIN|PUT|COMMIT|ABORT|MSG|LIVE|SERVICES)( |$)/);
        commands.push(command);
        const {reply} = await rpc({action: 'command', command});
        if (this.dropCommitReply && command.startsWith('CPS COMMIT ')) return;
        const bytes = new TextEncoder().encode(reply);
        // Serial chunks are independent of the line/request boundary.
        for (let offset = 0; offset < bytes.length; offset += 7) this.controller.enqueue(bytes.slice(offset, offset + 7));
      }});
    },
    async close() { this.readable = this.writable = null; },
    getInfo() { return {}; }
  };
  const serial = {requestPort: async () => port};
  // Include process startup/scheduler cost; use the real client's request budget.
  const client = new CpsClient({serial, timeoutMs: 3000});
  return {client, port, rpc, commands, stop: () => { child.stdin.end(); child.kill(); }};
}

test('browser client uploads mixed P25/DMR/FM fields through real C parser and retains them on reboot', {skip: !library}, async t => {
  const f = fixture();
  t.after(async () => { await f.client.disconnect().catch(() => {}); f.stop(); });
  await f.client.connect();
  const original = await f.client.read();
  const model = decodePayload(original.payload);
  model.channels[0] = {...structuredClone(model.vfos[0]), name: 'P25 TEST', nac: 0x2a3, talkgroup: 123,
    filter: 'NAC+TG', scanLists: []};
  model.channels[1] = {...structuredClone(model.vfos[0]), name: 'FM TEST', mode: 'NFM', rxHz: 446000000,
    txHz: 446000000, rxOnly: true, scanLists: [], txTone: {type: 'ctcss', value: 885},
    rxTone: {type: 'dcs-inv', value: 0o23}, squelch: 4};
  delete model.channels[1].privateCall;delete model.channels[1].destinationId;
  // The actual C HAL fixture deliberately advertises only its UHF test band.
  model.channels[2] = {name:'DMR TEST', mode:'DMR', rxHz:440075000, txHz:440075000,
    destinationId:0x123456, colorCode:15, timeslot:2, privateCall:true, repeater:true, filter:'PROM', rxOnly:false, scanLists:[], powerLevel:8};
  model.channels[0].powerLevel = 4;
  model.channels[255] = {...structuredClone(model.channels[0]), name:'LAST P25'};
  model.zones[15] = {name:'ZONE LAST', channels:[1, 256]};
  model.scanLists[0] = {...createScanList('Mixed scan'), channels:[1, 2, 3, 256]};
  model.scanLists[15] = {...createScanList('P25 TG', 'p25-tg', 256), reply:'fixed', replyChannel:256, talkgroups:[1, 10, 100, 1000, 65535]};
  Object.assign(model.settings, {selectionA: 1, selectionB: 2, screenSeconds: 45, keypadSeconds: 10, scanList: 2,
    totSeconds:180, p1Action:4, p2Action:7, sk1Action:6, sk2Action:8, broadcastKHz:101700,
    selectionA:256, zoneA:16, zoneB:0, scanList:15});
  model.channels[0].privateCall=true;model.channels[0].destinationId=0xffffff;
  model.contacts[95]={protocol:'Both',type:'unit',id:0xffffff,name:'LAST CONTACT'};
  model.contacts[0]={protocol:'P25',type:'group',id:123,name:'LOCAL GROUP'};
  model.trunkSystems[7]={name:'EXACT SYSTEM',mode:'experimental',wacn:0xabcde,systemId:0x123,nac:0x293,
    rfss:1,site:2,sourceId:0,talkgroup:1000,controls:[440075000,440087500]};
  model.settings.trunkSystem=8;
  const payload = encodePayload(model);
  assert.equal(payload.length,15968);
  for (let key = 0; key < payload.length / 32; key++) {
    const record = Buffer.from(payload.slice(key * 32, key * 32 + 32)).toString('hex');
    assert.equal((await f.rpc({action: 'validate', key, record})).valid, true);
  }
  const written = await f.client.write(payload, original);
  assert.equal(written.revision, original.revision + 1);
  assert.equal(written.crc, crc32(payload));
  assert.equal(f.commands.filter(c => c.startsWith('CPS COMMIT ')).length, 1);
  const active = await f.rpc({action: 'active'});
  assert.deepEqual(Uint8Array.from(Buffer.from(active.payload, 'hex')), payload);
  await f.rpc({action: 'reboot'});
  const readback = await f.client.read();
  assert.equal(readback.revision, written.revision);
  assert.deepEqual(readback.payload, payload);
  assert.deepEqual(decodePayload(readback.payload), model);
});

test('explicit JS legacy upgrade equals the actual C legacy projection byte for byte', {skip:!library}, async t => {
  const f=fixture();t.after(()=>f.stop());
  const legacy=await f.rpc({action:'legacy'}),active=await f.rpc({action:'active'});
  const original=Uint8Array.from(Buffer.from(legacy.payload,'hex'));
  assert.equal(original.length,1120);
  assert.deepEqual(encodePayload(upgradeModel(decodePayload(original,3),6)),Uint8Array.from(Buffer.from(active.payload,'hex')));
});

test('lost COMMIT acknowledgement is uncertain once; reconnect/read recovers actual committed C image', {skip: !library}, async t => {
  const f = fixture();
  t.after(async () => { await f.client.disconnect().catch(() => {}); f.stop(); });
  await f.client.connect();
  const original = await f.client.read();
  const model = decodePayload(original.payload);
  model.settings.keypadSeconds = 20;
  const payload = encodePayload(model);
  f.port.dropCommitReply = true;
  await assert.rejects(f.client.write(payload, original), /commit|uncertain|confirm|read|timeout|timed out/i);
  assert.equal(f.commands.filter(c => c.startsWith('CPS COMMIT ')).length, 1);
  const active = await f.rpc({action: 'active'});
  assert.equal(active.revision, original.revision + 1);
  assert.deepEqual(Uint8Array.from(Buffer.from(active.payload, 'hex')), payload);
  await assert.rejects(f.client.write(payload, original));
  assert.equal(f.commands.filter(c => c.startsWith('CPS COMMIT ')).length, 1);
  f.port.dropCommitReply = false;
  await f.client.disconnect();
  await f.rpc({action: 'reboot'});
  await f.client.connect();
  const recovered = await f.client.read();
  assert.deepEqual(recovered.payload, payload);
  assert.equal(recovered.revision, original.revision + 1);
});


test('live browser mailbox RPC matches actual C parser, chunks literal text and distinguishes sent/delivered', {skip: !library}, async t => {
  const f=fixture();t.after(async()=>{await f.client.disconnect().catch(()=>{});f.stop();});
  await f.rpc({action:'mailFixture'});
  const caps=await f.client.connect({messaging:true});assert.equal(caps.capacity,16);assert.equal(caps.P25.transmit,true);
  const received=(await f.client.messages()).messages[0];
  assert.equal(received.state,'RECEIVED');assert.equal(received.protocol,'DMR');assert.equal(received.unread,true);assert.equal(received.truncated,true);
  assert.equal(received.text,'<img src=x> literal received text and a second chunk');
  await f.client.messageAction('READ',received.id);assert.equal((await f.client.messages()).messages[0].unread,false);
  const result=await f.client.sendMessage({protocol:'P25',type:'unit',destinationId:123456,text:'A'.repeat(80)},{token:4294967295});
  assert.equal((await f.client.messages()).messages.find(message=>message.id===result.id).state,'QUEUED');
  // Lost ACK retry on exactly the same token is idempotent in the actual radio parser.
  assert.equal((await f.rpc({action:'command',command:'CPS MSG SEND 4294967295'})).reply,`CPS MSG OK SEND 4294967295 ${result.id}\r\n`);
  assert.equal((await f.client.messages()).messages.length,2);
  await assert.rejects(f.client.messageAction('DELETE',result.id),{code:'REFUSED',radioCode:'BUSY'});
  await f.rpc({action:'mailState',id:result.id,state:3});assert.equal((await f.client.messages()).messages.find(message=>message.id===result.id).state,'SENT');
  await f.rpc({action:'mailState',id:result.id,state:4});assert.equal((await f.client.messages()).messages.find(message=>message.id===result.id).state,'DELIVERED');
  await f.client.messageAction('DELETE',result.id);await f.client.messageAction('DELETE',received.id);assert.equal((await f.client.messages()).messages.length,0);
  assert(f.commands.every(command=>command.startsWith('CPS MSG ')));
  await f.rpc({action:'reboot'});assert.equal((await f.client.messages()).messages.length,0);
});

test('actual message parser rejects PTT, partial drafts, conflicting tokens and codeplug ownership without transmission', {skip: !library}, async t => {
  const f=fixture();t.after(()=>f.stop());await f.rpc({action:'mailFixture'});
  const command=async(command,extra={})=>(await f.rpc({action:'command',command,...extra})).reply;
  assert.match(await command('CPS MSG BEGIN 7 1 1 123456 0 0 5',{ptt:true}),/^CPS MSG ERR BUSY/);
  assert.match(await command('CPS MSG BEGIN 7 1 1 123456 0 0 5',{rawReleased:false}),/^CPS MSG ERR BUSY/);
  assert.equal(await command('CPS MSG BEGIN 7 1 1 123456 0 0 5'),'CPS MSG OK BEGIN 7\r\n');
  assert.match(await command('CPS MSG SEND 7'),/^CPS MSG ERR INCOMPLETE/);
  assert.match(await command('CPS MSG BEGIN 8 1 1 123456 0 0 5'),/^CPS MSG ERR BUSY/);
  assert.equal(await command('CPS MSG CANCEL 7'),'CPS MSG OK CANCEL 7\r\n');
  // Decimal fields reject signs and uint32 overflow rather than wrapping to a
  // valid protocol, destination, offset or length in scanf.
  for(const malformed of [
    'CPS MSG LIST 4294967296', 'CPS MSG LIST -1', 'CPS MSG GET 1 4294967296',
    'CPS MSG BEGIN 7 4294967297 1 123456 0 0 5',
    'CPS MSG BEGIN 7 1 4294967297 123456 0 0 5',
    'CPS MSG BEGIN 7 1 1 4295090752 0 0 5',
    'CPS MSG BEGIN 7 1 1 123456 4294967296 0 5',
    'CPS MSG BEGIN 7 1 1 123456 0 4294967296 5',
    'CPS MSG BEGIN 7 1 1 123456 0 0 4294967301',
    'CPS MSG BEGIN 7 1 1 -1 0 0 5',
  ])assert.match(await command(malformed),/^CPS MSG ERR /,malformed);

  const active=await f.rpc({action:'active'});
  assert.match(await command(`CPS BEGIN 11223344 ${active.revision}`),/^CPS OK BEGIN/);
  assert.match(await command('CPS MSG HELLO'),/^CPS MSG ERR TRANSACTION/);
  assert.equal(await command('CPS ABORT 11223344'),'CPS OK ABORT 11223344\r\n');
});

test('message-only connection preserves a genuine active write on current firmware after read-only discovery', {skip: !library}, async t => {
  const f=fixture();t.after(async()=>{await f.client.disconnect().catch(()=>{});f.stop();});
  const active=await f.rpc({action:'active'});
  assert.match((await f.rpc({action:'command',command:`CPS BEGIN 11223344 ${active.revision}`})).reply,/^CPS OK BEGIN/);
  await assert.rejects(f.client.connect({messaging:true}),{code:'REFUSED',radioCode:'TRANSACTION'});
  assert.deepEqual(f.commands,['CPS MSG HELLO','CPS SERVICES']);
  assert.match((await f.rpc({action:'command',command:'CPS MSG HELLO'})).reply,/^CPS MSG ERR TRANSACTION/);
  assert.equal((await f.rpc({action:'command',command:'CPS ABORT 11223344'})).reply,'CPS OK ABORT 11223344\r\n');
  assert.equal((await f.rpc({action:'active'})).revision,active.revision);
});
