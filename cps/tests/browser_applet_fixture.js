// SPDX-License-Identifier: GPL-3.0-or-later
// Test init script only. Replaces Web Serial before app.js; no real port or RF.
(() => {
  const listeners = new Set();
  let controller, api, pending = null;
  const peer = window.__appletPeer = {
    simulated: true, connected: false, requestCount: 0, commands: [],
    supported: true, readOnly: false, trunk: false, running: 0, failCommit: false,
    slots: Array.from({length: 8}, (_, i) => i === 0 ? {name:'Weather demo', size:72, revision:1} : null),
    unplug() {
      this.connected = false;
      try { controller.error(new DOMException('Simulated unplug', 'NetworkError')); } catch {}
      for (const callback of listeners) callback({port});
    },
  };
  const ready = peer.ready = new Promise(resolve => document.addEventListener('DOMContentLoaded', async () => {
    api = await import(new URL('./model.js', location.href));
    peer.payload = api.encodePayload(api.createDefaultModel(6)); resolve();
  }, {once:true}));
  const hex = value => (value >>> 0).toString(16).toUpperCase().padStart(8,'0');
  const hexBytes = bytes => Array.from(bytes, byte => byte.toString(16).toUpperCase().padStart(2,'0')).join('');
  function reply(command) {
    if (command === 'CPS HELLO') return `CPS HELLO DM32P25 6 256 2 19 ${hex(api.crc32(peer.payload))}`;
    if (command === 'CPS LIVE') return 'CPS OK LIVE';
    if (command.startsWith('CPS GET ')) {
      const i = Number(command.split(' ').at(-1));
      return `CPS DATA ${i} ${hexBytes(peer.payload.slice(i*32,(i+1)*32))}`;
    }
    if (peer.trunk) return 'ERR stop Trunk RX first';
    if (!peer.supported) return 'APP ERROR unsupported';
    if (command === 'APP STORE STATUS' && peer.running) return 'APP ERROR busy';
    if (command === 'APP STORE STATUS') return [
      'APP STORE slots=8 bank_bytes=65536 partition_bytes=1048576 max_package=32768',
      ...(peer.readOnly ? ['APP STORE READ_ONLY foreign_data'] : []),
      ...peer.slots.map((slot,i) => slot ? `APP SLOT ${i+1} name=${slot.name} size=${slot.size} seq=${slot.revision}` : `APP SLOT ${i+1} EMPTY`),
      'APP OK STORE STATUS',
    ].join('\r\n');
    if (command === 'APP STATUS') return `APP STATUS slot=${peer.running} running=${peer.running ? 1 : 0} operation=${peer.running ? 5 : 0} state=${peer.running ? 2 : 0} instructions=7`;
    let m = /^APP RUN ([1-8])$/.exec(command);
    if (m) { peer.running = Number(m[1]); return `APP OK RUN ${m[1]}`; }
    if (command === 'APP STOP') { peer.running = 0; return 'APP STOPPED; normal radio operation restored'; }
    m = /^APP REMOVE ([1-8])$/.exec(command);
    if (m) { peer.slots[Number(m[1])-1] = null; return `APP OK REMOVE ${m[1]}`; }
    m = /^APP INSTALL BEGIN ([1-8]) (\d+) (\d+)$/.exec(command);
    if (m) { pending = {slot:Number(m[1]), data:new Uint8Array(Number(m[2]))}; return 'APP OK INSTALL BEGIN'; }
    m = /^APP INSTALL DATA (\d+) ([0-9A-F]+)$/.exec(command);
    if (m && pending) {
      const offset = Number(m[1]), bytes = Uint8Array.from(m[2].match(/../g), hex => parseInt(hex,16));
      pending.data.set(bytes,offset); return `APP OK INSTALL DATA ${offset+bytes.length}`;
    }
    if (command === 'APP INSTALL COMMIT' && pending) {
      const name = String.fromCharCode(...pending.data.slice(32,56)).split('\0')[0];
      peer.slots[pending.slot-1] = {name, size:pending.data.length, revision:(peer.slots[pending.slot-1]?.revision || 0)+1};
      pending = null; return peer.failCommit ? null : 'APP OK INSTALL COMMIT';
    }
    if (command === 'APP INSTALL ABORT') { pending = null; return 'APP OK INSTALL ABORT'; }
    throw new Error(`Unexpected simulated command: ${command}`);
  }
  const port = {
    async open() {
      await ready; peer.connected = true;
      this.readable = new ReadableStream({start(value) {controller = value;}});
      this.writable = new WritableStream({write(bytes) {
        const command = new TextDecoder().decode(bytes).trim(); peer.commands.push(command);
        const response = reply(command); if (response === null) return;
        const encoded = new TextEncoder().encode(response+'\r\n');
        for (let offset=0;offset<encoded.length;offset+=11) controller.enqueue(encoded.slice(offset,offset+11));
      }});
    },
    async close() {peer.connected = false; this.readable = this.writable = null;},
  };
  Object.defineProperty(navigator,'serial',{configurable:true,value:{
    async requestPort() {await ready; peer.requestCount++; return port;},
    addEventListener(type, callback) {if (type==='disconnect') listeners.add(callback);},
    removeEventListener(type, callback) {if (type==='disconnect') listeners.delete(callback);},
  }});
})();
