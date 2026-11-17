// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {CpsClient} from '../transport.js';
import {createDefaultModel, encodePayload, crc32} from '../model.js';

const encode = text => new TextEncoder().encode(text);
const hex = value => value.toString(16).toUpperCase().padStart(8, '0');
function serialPeer() {
  const payload = encodePayload(createDefaultModel(6));
  const peer = {commands: [], requests: 0};
  const port = {
    open: async () => {
      port.readable = new ReadableStream({start(controller) {peer.controller = controller;}});
      port.writable = new WritableStream({write(bytes) {
        const command = new TextDecoder().decode(bytes).trim();
        peer.commands.push(command);
        let response;
        if (command === 'CPS HELLO') response = `CPS HELLO DM32P25 6 256 2 19 ${hex(crc32(payload))}`;
        else if (command === 'CPS LIVE') response = 'CPS OK LIVE';
        else if (command.startsWith('CPS GET ')) {
          const index = Number(command.split(' ').at(-1));
          response = `CPS DATA ${index} ${Array.from(payload.slice(index*32, (index+1)*32), n => n.toString(16).toUpperCase().padStart(2,'0')).join('')}`;
        } else if (command === 'APP STATUS') response = 'APP STATUS slot=1 running=1 operation=0 state=1 instructions=7';
        else if (command === 'APP STOP') response = 'APP STOPPED; normal radio operation restored';
        else assert.fail(`Unexpected command: ${command}`);
        peer.controller.enqueue(encode(response + '\r\n'));
      }});
    },
    close: async () => {},
  };
  return Object.assign(peer, {port, requestPort: async () => {peer.requests++; return port;}});
}
async function appLine(session, command) {
  await session.write(encode(command+'\n'));
  const {value, done} = await session.read();
  assert.equal(done, false);
  return new TextDecoder().decode(value).trim();
}

test('applet connection opens once without CPS takeover or automatic APP commands', async t => {
  const peer = serialPeer(), client = new CpsClient({serial: peer});
  t.after(() => client.disconnect());
  assert.deepEqual(await client.connect({applets: true}), {service: 'applets'});
  assert.equal(client.connected, true); assert.equal(client.appletMode, true);
  assert.equal(client.protocolVersion, null); assert.deepEqual(peer.commands, []);
  const status = await client.runAppletSession(session => appLine(session, 'APP STATUS'));
  assert.match(status, /running=1/); assert.equal(peer.requests, 1);
  await assert.rejects(client.read(), {code: 'APPLET_ACTIVE'});
  await assert.rejects(client.messages(), {code: 'APPLET_ACTIVE'});
  assert.deepEqual(peer.commands, ['APP STATUS']);
});

test('shared connection resumes CPS once, invalidates the write baseline and requires explicit APP STOP', async t => {
  const peer = serialPeer(), client = new CpsClient({serial: peer});
  t.after(() => client.disconnect());
  await client.connect();
  const snapshot = await client.read();
  peer.commands.length = 0;
  await client.runAppletSession(session => appLine(session, 'APP STATUS'));
  await client.runAppletSession(session => appLine(session, 'APP STATUS'));
  assert.deepEqual(peer.commands, ['CPS LIVE', 'APP STATUS', 'APP STATUS']);
  await client.runAppletSession(async session => {
    assert.match(await appLine(session, 'APP STOP'), /^APP STOPPED/);
    session.release();
  });
  assert.equal(client.appletMode, false);
  await assert.rejects(client.write(snapshot.payload, snapshot), {code: 'NEED_READ'});
  assert.equal(peer.requests, 1);
  assert.equal((await client.read()).payload.length, 499*32);
  assert.equal(client.protocolVersion, 6);
});

test('applet session is exclusive and refuses arbitrary serial/RF commands', async t => {
  const peer = serialPeer(), client = new CpsClient({serial: peer});
  t.after(() => client.disconnect()); await client.connect({applets: true});
  let finish, oldSession;
  const pending = client.runAppletSession(async session => {
    oldSession = session;
    for (const command of ['TRUNK STOP', 'CPS HELLO', 'APP PCM OPEN VOICE P25 TX 145700000', 'APP RUN 9', 'APP RUN 1\nAPP STOP']) {
      await assert.rejects(session.write(encode(command+'\n')), {code: 'COMMAND'});
    }
    await new Promise(resolve => {finish = resolve;});
  });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(client.read(), {code: 'IN_USE'});
  await assert.rejects(client.runAppletSession(() => {}), {code: 'IN_USE'});
  finish(); await pending;
  await assert.rejects(oldSession.read(), {code: 'DISCONNECTED'});
  assert.deepEqual(peer.commands, []);
});

test('disconnect or invalidation rejects a borrowed pending read and never reuses its late response', async t => {
  for (const disconnect of [true, false]) {
    const peer = serialPeer(), client = new CpsClient({serial: peer, timeoutMs: 50});
    t.after(() => client.disconnect()); await client.connect({applets: true});
    let borrowed;
    const pending = client.runAppletSession(async session => {borrowed = session; return session.read();});
    const rejected = assert.rejects(pending, {code: disconnect ? 'DISCONNECTED' : 'TIMEOUT'});
    if (disconnect) await client.disconnect();
    else borrowed.invalidate(Object.assign(new Error('APP deadline expired'), {code: 'TIMEOUT'}));
    await rejected;
    assert.equal(client.connected, false);
    await assert.rejects(client.runAppletSession(() => {}), {code: 'NOT_CONNECTED'});
  }
});
