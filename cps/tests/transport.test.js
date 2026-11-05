// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { CpsClient } from '../transport.js';
import { crc32, createDefaultModel, encodePayload, decodePayload } from '../model.js';

const hex = value => (value >>> 0).toString(16).toUpperCase().padStart(8, '0');
const bytesHex = value => Array.from(value, byte => byte.toString(16).toUpperCase().padStart(2, '0')).join('');
const tick = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const origin = peer => ({ revision: peer.revision, crc: crc32(peer.active) });

function edited(payload) {
  const model = decodePayload(payload);
  model.settings.micGainDb = (model.settings.micGainDb + 1) % 43;
  return encodePayload(model);
}

/** Real WHATWG browser streams with a deterministic logical radio peer; no serial port is opened. */
class FakeSerial {
  constructor({ override, fragment = 0, revision = 19, protocol = 1 } = {}) {
    this.active = encodePayload(createDefaultModel());
    this.revision = revision;
    this.protocol = protocol;
    this.stage = null;
    this.requests = [];
    this.duringStage = [];
    this.override = override;
    this.fragment = fragment;
    this.commits = this.aborts = this.requestCount = this.closeCount = 0;
    this.listeners = new Set();
    this.busy = false;
    this.port = {
      open: async options => {
        this.openOptions = options;
        this.closed = false;
        this.port.readable = new ReadableStream({ start: controller => { this.controller = controller; } });
        this.port.writable = new WritableStream({ write: async bytes => {
          const request = new TextDecoder().decode(bytes);
          assert.match(request, /^CPS [ -~]+\r\n$/);
          assert.ok(bytes.length <= 120);
          const command = request.slice(0, -2);
          this.requests.push(command);
          const response = this.handle(command);
          const changed = this.override ? await this.override(command, response, this) : response;
          if (changed !== undefined && changed !== null) this.reply(changed);
        } });
      },
      close: async () => { this.closeCount++; this.closed = true; },
    };
  }

  async requestPort() { this.requestCount++; return this.port; }
  addEventListener(name, listener) { assert.equal(name, 'disconnect'); this.listeners.add(listener); }
  removeEventListener(name, listener) { assert.equal(name, 'disconnect'); this.listeners.delete(listener); }

  reply(text, controller = this.controller) {
    const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
    try {
      if (!this.fragment) controller.enqueue(bytes);
      else for (let offset = 0; offset < bytes.length; offset += this.fragment) {
        controller.enqueue(bytes.subarray(offset, offset + this.fragment));
      }
    } catch { /* A timed-out stream has been cancelled; late ACKs cannot be reused. */ }
  }

  unplug() {
    for (const listener of this.listeners) listener({ target: this.port });
    try { this.controller.close(); } catch { /* already cancelled */ }
  }

  handle(command) {
    if (this.busy) return 'CPS ERR BUSY\r\n';
    const parts = command.split(' ');
    if (command === 'CPS HELLO') {
      if (this.stage) return 'CPS ERR TRANSACTION\r\n';
      return `CPS HELLO DM32P25 ${this.protocol} 32 2 ${this.revision} ${hex(crc32(this.active))}\r\n`;
    }
    if (parts[1] === 'GET') {
      const index = Number(parts[2]);
      return `CPS DATA ${index} ${bytesHex(this.active.subarray(index * 32, (index + 1) * 32))}\r\n`;
    }
    if (parts[1] === 'BEGIN') {
      if (Number(parts[3]) !== this.revision || this.stage) return 'CPS ERR REVISION\r\n';
      this.tid = parts[2];
      this.stage = this.active.slice();
      return `CPS OK BEGIN ${this.tid}\r\n`;
    }
    if (!this.stage || parts[2] !== this.tid) return 'CPS ERR TRANSACTION\r\n';
    if (parts[1] === 'PUT') {
      const data = Uint8Array.from(parts[4].match(/../g), byte => parseInt(byte, 16));
      this.stage.set(data, Number(parts[3]) * 32);
      this.duringStage.push(this.active.slice());
      return `CPS OK PUT ${this.tid} ${parts[3]}\r\n`;
    }
    if (parts[1] === 'ABORT') {
      this.aborts++;
      this.stage = null;
      return `CPS OK ABORT ${this.tid}\r\n`;
    }
    if (parts[1] === 'COMMIT') {
      if (hex(crc32(this.stage)) !== parts[3]) return 'CPS ERR COMMIT\r\n';
      decodePayload(this.stage);
      this.active = this.stage.slice();
      this.stage = null;
      this.revision = (this.revision + 1) >>> 0;
      this.commits++;
      return `CPS OK COMMIT ${this.tid} ${this.revision} ${hex(crc32(this.active))}\r\n`;
    }
    throw new Error(`Unexpected fake command ${command}`);
  }
}

async function setup(t, peer = new FakeSerial(), options = {}) {
  // Parallel codec/property tests can stall a one-byte stream on busy CI hosts.
  // Deliberate deadline tests below retain their explicit short timeouts.
  const client = new CpsClient({ serial: peer, timeoutMs: 500, ...options });
  t.after(() => client.disconnect());
  await client.connect();
  return { client, peer };
}

test('explicit connect requests a port, opens exact UART settings and only sends HELLO', async t => {
  const peer = new FakeSerial();
  const client = new CpsClient({ serial: peer });
  t.after(() => client.disconnect());
  assert.equal(client.connected, false);
  assert.equal(peer.requestCount, 0);
  assert.deepEqual(await client.connect(), origin(peer));
  assert.equal(client.connected, true);
  assert.equal(peer.requestCount, 1);
  assert.deepEqual(peer.openOptions, { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
  assert.deepEqual(peer.requests, ['CPS HELLO']);
  await assert.rejects(client.write(edited(peer.active), origin(peer)), { code: 'NEED_READ' });
  assert.deepEqual(peer.requests, ['CPS HELLO']);
});

test('35 records download between matching HELLOs, strict CRC and one-byte stream chunks', async t => {
  const progress = [];
  const { client, peer } = await setup(t, new FakeSerial({ fragment: 1 }), { onProgress: event => progress.push(event) });
  peer.requests.length = 0;
  const read = await client.read();
  assert.deepEqual(read, { payload: peer.active, ...origin(peer) });
  assert.deepEqual(peer.requests, ['CPS HELLO', ...Array.from({ length: 35 }, (_, n) => `CPS GET ${n}`), 'CPS HELLO']);
  assert.equal(progress.length, 35);
  assert.deepEqual(progress.at(-1), { phase: 'read', current: 35, total: 35, message: 'Reading radio configuration' });
  read.payload[0] = 23;
  assert.equal(peer.active[0], 0, 'download buffer never aliases the radio state');
});

test('V2 DMR uploads and legacy V1 refuses DMR before BEGIN', async t => {
  for (const protocol of [1, 2]) {
    const {client, peer} = await setup(t, new FakeSerial({protocol}));
    const read = await client.read(); const model = decodePayload(read.payload);
    model.channels[0] = {name: 'DMR TEST', rxHz:145700000, txHz:145700000, mode:'DMR', rxOnly:false,
      scanLists:[0], destinationId:0xffffff, colorCode:0, timeslot:2, privateCall:true, repeater:true, filter:'PROM'};
    const payload = encodePayload(model);peer.requests.length=0;
    if (protocol === 1) {
      await assert.rejects(client.write(payload, read), {code:'UNSUPPORTED_MODE'});
      assert.deepEqual(peer.requests, []); assert.equal(peer.commits, 0);
    } else {
      await client.write(payload, read);assert.deepEqual(peer.active,payload);assert.equal(peer.commits,1);
    }
  }
});

test('schema changes within a connected baseline fail before programming', async t => {
  const {client, peer} = await setup(t, new FakeSerial({protocol:2}));
  const read = await client.read();peer.protocol=1;peer.requests.length=0;
  await assert.rejects(client.write(edited(read.payload), read), /protocol/);
  assert.deepEqual(peer.requests,['CPS HELLO']);assert.equal(peer.commits,0);
});

test('upload stages all records, publishes one atomic commit, verifies HELLO and advances origin', async t => {
  const { client, peer } = await setup(t);
  const baseline = await client.read();
  const next = edited(baseline.payload), before = peer.active.slice();
  peer.requests.length = 0;
  const result = await client.write(next, baseline);
  assert.deepEqual(result, { ...origin(peer), unchanged: false });
  assert.deepEqual(peer.active, next);
  assert.equal(peer.commits, 1);
  assert.equal(peer.duringStage.length, 35);
  for (const snapshot of peer.duringStage) assert.deepEqual(snapshot, before);
  assert.match(peer.requests[1], /^CPS BEGIN (?!00000000)[0-9A-F]{8} 19$/);
  assert.equal(peer.requests.filter(command => command.startsWith('CPS PUT')).length, 35);
  assert.equal(peer.requests.filter(command => command.startsWith('CPS COMMIT')).length, 1);
  assert.equal(peer.requests.at(-1), 'CPS HELLO');
  const second = await client.write(edited(next), result);
  assert.equal(second.revision, 21);
  assert.equal(peer.commits, 2);
});

test('unchanged upload sends HELLO only, writes no settings, and presentation exceptions are harmless', async t => {
  const { client, peer } = await setup(t, new FakeSerial(), { onProgress() { throw new Error('UI failed'); } });
  const read = await client.read();
  peer.requests.length = 0;
  assert.deepEqual(await client.write(read.payload, read), { ...origin(peer), unchanged: true });
  assert.deepEqual(peer.requests, ['CPS HELLO']);
  assert.equal(peer.commits, 0);
});

test('stale radio revision or CRC refuses before BEGIN and requires a new download', async t => {
  for (const change of [peer => peer.revision++, peer => { peer.active = edited(peer.active); }]) {
    const { client, peer } = await setup(t);
    const read = await client.read();
    change(peer);
    peer.requests.length = 0;
    await assert.rejects(client.write(edited(read.payload), read), { code: 'STALE' });
    assert.deepEqual(peer.requests, ['CPS HELLO']);
    await assert.rejects(client.write(edited(read.payload), origin(peer)), { code: 'NEED_READ' });
    assert.equal(peer.requests.length, 1);
  }
});

test('invalid payload or forged origin is rejected before any serial request', async t => {
  const { client, peer } = await setup(t);
  const read = await client.read();
  peer.requests.length = 0;
  const invalid = read.payload.slice(); invalid[31] = 1;
  await assert.rejects(client.write(invalid, read), /empty record contains data/);
  await assert.rejects(client.write(edited(read.payload), { revision: read.revision, crc: read.crc ^ 1 }), { code: 'NEED_READ' });
  assert.deepEqual(peer.requests, []);
});

test('clean staging refusal aborts once and preserves the old valid snapshot', async t => {
  const { client, peer } = await setup(t);
  const read = await client.read(), before = peer.active.slice();
  peer.override = (command, response) => command.startsWith('CPS PUT') && command.split(' ')[3] === '7'
    ? 'CPS ERR INVALID\r\n' : response;
  await assert.rejects(client.write(edited(read.payload), read), { code: 'REFUSED', radioCode: 'INVALID' });
  assert.deepEqual(peer.active, before);
  assert.equal(peer.commits, 0);
  assert.equal(peer.aborts, 1);
  assert.equal(peer.stage, null);
  assert.equal(client.connected, true);
});

test('ambiguous staging acknowledgement taints the stream, sends no more commands, keeps old snapshot', async t => {
  const { client, peer } = await setup(t);
  const read = await client.read(), before = peer.active.slice();
  peer.override = (command, response) => command.startsWith('CPS PUT') ? response.replace('CPS OK PUT', 'CPS OK WRONG') : response;
  await assert.rejects(client.write(edited(read.payload), read), { code: 'PROTOCOL' });
  assert.equal(client.connected, false);
  assert.deepEqual(peer.active, before);
  assert.equal(peer.commits, 0);
  assert.equal(peer.aborts, 0);
  const requests = peer.requests.length;
  await assert.rejects(client.read(), { code: 'NOT_CONNECTED' });
  assert.equal(peer.requests.length, requests);
});

test('lost COMMIT ACK is uncertain, never retried; reconnect and actual read resolve it', async t => {
  const { client, peer } = await setup(t, new FakeSerial(), { timeoutMs: 500 });
  const read = await client.read(), next = edited(read.payload);
  peer.override = (command, response) => command.startsWith('CPS COMMIT') ? undefined : response;
  await assert.rejects(client.write(next, read), { code: 'UNCERTAIN', uncertain: true });
  assert.deepEqual(peer.active, next);
  assert.equal(peer.commits, 1);
  assert.equal(peer.aborts, 0);
  assert.equal(client.connected, false);
  await assert.rejects(client.write(next, read), { code: 'NOT_CONNECTED' });
  assert.equal(peer.commits, 1);
  await client.disconnect();
  peer.override = null;
  await client.connect();
  await assert.rejects(client.write(edited(next), origin(peer)), { code: 'NEED_READ' });
  const resolved = await client.read();
  assert.deepEqual(resolved.payload, next);
  assert.equal(resolved.revision, 20);
});

test('wrong COMMIT acknowledgement and failed post-commit HELLO both require fresh read', async t => {
  for (const mode of ['commit', 'post']) {
    const { client, peer } = await setup(t);
    const read = await client.read();
    peer.override = (command, response, radio) => {
      if (mode === 'commit' && command.startsWith('CPS COMMIT')) return response.replace(' 20 ', ' 21 ');
      if (mode === 'post' && command === 'CPS HELLO' && radio.commits) return response.replace(' 20 ', ' 21 ');
      return response;
    };
    await assert.rejects(client.write(edited(read.payload), read), { code: 'UNCERTAIN', uncertain: true });
    assert.equal(peer.commits, 1);
    assert.equal(peer.aborts, 0);
    assert.equal(client.connected, false);
  }
});

test('all failures after COMMIT, including a clean refusal, remain uncertain without retries', async t => {
  const { client, peer } = await setup(t);
  const read = await client.read();
  peer.override = (command, response) => command.startsWith('CPS COMMIT') ? 'CPS ERR COMMIT\r\n' : response;
  await assert.rejects(client.write(edited(read.payload), read), { code: 'UNCERTAIN' });
  assert.equal(peer.commits, 1);
  assert.equal(peer.requests.filter(command => command.startsWith('CPS COMMIT')).length, 1);
  assert.equal(peer.aborts, 0);
});

test('USB disconnect after commit publication is uncertain, keeps published data and never retries', async t => {
  const { client, peer } = await setup(t);
  const read = await client.read(), next = edited(read.payload);
  peer.override = (command, response, radio) => {
    if (command.startsWith('CPS COMMIT')) radio.unplug();
    return response;
  };
  await assert.rejects(client.write(next, read), { code: 'UNCERTAIN', uncertain: true });
  assert.equal(peer.commits, 1);
  assert.equal(peer.aborts, 0);
  assert.deepEqual(peer.active, next);
  assert.equal(client.connected, false);
});

test('bad identity, revision overflow and malformed bounded frames close connect without settings commands', async t => {
  const replies = [
    'CPS HELLO STOCK-DM32 1 32 2 19 12345678\r\n',
    'CPS HELLO DM32P25 3 32 2 19 12345678\r\n',
    'CPS HELLO DM32P25 1 32 2 4294967296 12345678\r\n',
    'CPS HELLO DM32P25 1 32 2 19 12345678\n',
    'CPS HELLO DM32P25 1 32 2 19 12345678\rX\n',
    new Uint8Array([255, 13, 10]),
    'X'.repeat(120) + '\r\n',
    'CPS ERR BUSY\r\nCPS ERR BUSY\r\n',
  ];
  for (const reply of replies) {
    const peer = new FakeSerial({ override: () => reply });
    const client = new CpsClient({ serial: peer, timeoutMs: 30 });
    t.after(() => client.disconnect());
    await assert.rejects(client.connect());
    assert.equal(client.connected, false);
    assert.deepEqual(peer.requests, ['CPS HELLO']);
    assert.equal(peer.closeCount, 1);
  }
});

test('late response after deadline is discarded; no following command can consume its ACK', async t => {
  const { client, peer } = await setup(t, new FakeSerial(), { timeoutMs: 20 });
  const staleController = peer.controller;
  peer.override = (command, response) => {
    if (command === 'CPS GET 0') {
      setTimeout(() => peer.reply(response, staleController), 40);
      return undefined;
    }
    return response;
  };
  await assert.rejects(client.read(), { code: 'TIMEOUT' });
  const requests = peer.requests.length;
  await assert.rejects(client.read(), { code: 'NOT_CONNECTED' });
  await tick(50);
  assert.equal(peer.requests.length, requests);
  await client.disconnect();
  peer.override = null;
  await client.connect();
  assert.deepEqual((await client.read()).payload, peer.active);
});

test('physical disconnect rejects the pending read and clears qualification', async t => {
  const { client, peer } = await setup(t);
  await client.read();
  peer.override = command => {
    if (command === 'CPS GET 0') setTimeout(() => peer.unplug(), 0);
    return command.startsWith('CPS GET') ? undefined : peer.handle(command);
  };
  await assert.rejects(client.read(), { code: 'DISCONNECTED' });
  assert.equal(client.connected, false);
});

test('overlapping user operations are refused rather than interleaved on the stream', async t => {
  const { client, peer } = await setup(t, new FakeSerial(), { timeoutMs: 30 });
  const read = await client.read();
  peer.override = (command, response) => command === 'CPS GET 0' ? undefined : response;
  const pending = client.read();
  await assert.rejects(client.write(edited(read.payload), read), { code: 'IN_USE' });
  await assert.rejects(pending, { code: 'TIMEOUT' });
});

test('radio BUSY/PTT refuses programming without bypassing state or emitting BEGIN', async t => {
  const { client, peer } = await setup(t);
  const read = await client.read();
  peer.busy = true;
  peer.requests.length = 0;
  await assert.rejects(client.write(edited(read.payload), read), { code: 'REFUSED', radioCode: 'BUSY' });
  assert.deepEqual(peer.requests, ['CPS HELLO']);
  assert.equal(peer.commits, 0);
  assert.equal(client.connected, true);
});

test('download checksum, final revision and record identity failures never qualify an upload', async t => {
  for (const mode of ['crc', 'revision', 'record']) {
    const { client, peer } = await setup(t);
    let hellos = 0;
    peer.override = (command, response) => {
      if (command === 'CPS HELLO') {
        hellos++;
        if (mode === 'crc') return response.replace(/ [0-9A-F]{8}\r\n$/, ' 00000000\r\n');
        if (mode === 'revision' && hellos === 2) return response.replace(' 19 ', ' 20 ');
      }
      if (mode === 'record' && command === 'CPS GET 4') return response.replace('CPS DATA 4 ', 'CPS DATA 5 ');
      return response;
    };
    await assert.rejects(client.read());
    assert.equal(peer.commits, 0);
    if (client.connected) await assert.rejects(client.write(edited(peer.active), origin(peer)), { code: 'NEED_READ' });
  }
});

test('revision wrap uses uint32 acknowledgement and verification', async t => {
  const { client, peer } = await setup(t, new FakeSerial({ revision: 0xFFFFFFFF }));
  const read = await client.read();
  const result = await client.write(edited(read.payload), read);
  assert.equal(result.revision, 0);
  assert.equal(peer.commits, 1);
});

test('disconnect cancels a pending picker result before opening a port', async t => {
  const peer = new FakeSerial();
  let choose;
  peer.requestPort = () => new Promise(resolve => { choose = resolve; });
  const client = new CpsClient({ serial: peer });
  t.after(() => client.disconnect());
  const connecting = client.connect();
  await client.disconnect();
  choose(peer.port);
  await assert.rejects(connecting, { code: 'DISCONNECTED' });
  assert.equal(peer.openOptions, undefined);
  assert.deepEqual(peer.requests, []);
});

test('unsupported browser and user-cancelled chooser do not access any device', async () => {
  const unsupported = new CpsClient({ serial: {} });
  await assert.rejects(unsupported.connect(), { code: 'UNSUPPORTED' });
  const cancelled = new CpsClient({ serial: { requestPort: async () => { throw new Error('Chooser cancelled'); } } });
  await assert.rejects(cancelled.connect(), /Chooser cancelled/);
  assert.equal(cancelled.connected, false);
});

test('a hung browser write still reaches its deadline and bounded disconnect cleanup', { timeout: 700 }, async t => {
  const peer = new FakeSerial({ override: () => new Promise(() => {}) });
  const client = new CpsClient({ serial: peer, timeoutMs: 15 });
  t.after(() => client.disconnect());
  await assert.rejects(client.connect(), { code: 'TIMEOUT' });
  assert.equal(client.connected, false);
  assert.equal(peer.closeCount, 1);
  assert.deepEqual(peer.requests, ['CPS HELLO']);
});

test('an earlier staged transaction gives idle-timeout recovery guidance without issuing writes', async () => {
  const peer = new FakeSerial();
  peer.stage = peer.active.slice();
  const client = new CpsClient({serial: peer});
  await assert.rejects(client.connect(), error => error.code === 'REFUSED' &&
    error.radioCode === 'TRANSACTION' && /60 seconds/.test(error.message));
  assert.equal(client.connected, false);
  assert.deepEqual(peer.requests, ['CPS HELLO']);
  assert.equal(peer.commits, 0);
  assert.equal(peer.aborts, 0);
});
