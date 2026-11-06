// SPDX-License-Identifier: GPL-3.0-or-later
// Browser-test initScript only. Never import this file from the production CPS.
// It replaces Web Serial completely; no real port, firmware or RF access occurs.
(() => {
  const hex32 = value => (value >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const hexBytes = bytes => Array.from(bytes, byte => byte.toString(16).toUpperCase().padStart(2, '0')).join('');
  const listeners = new Set();
  let api, controller, stage = null, transaction = null, activity = 0;
  const peer = {
    simulated: true,
    commands: [],
    revision: 19,
    payload: null,
    commitCount: 0,
    abortCount: 0,
    requestCount: 0,
    openCount: 0,
    closeCount: 0,
    connected: false,
    protocol: 3,
    async useV4() {
      await this.ready;
      if (this.connected) throw new Error('Disconnect the simulated radio before changing geometry');
      const model = api.upgradeModel(api.decodePayload(this.payload, this.protocol));
      this.payload = api.encodePayload(model); this.protocol = 4; this.discardStage();
    },
    busy: false,
    dropCommitReply: false,
    openOptions: null,
    bumpRevision() { this.revision = (this.revision + 1) >>> 0; return this.revision; },
    discardStage() { stage = transaction = null; },
    unplug() {
      this.connected = false;
      for (const listener of listeners) listener({ target: port });
      try { controller?.close(); } catch { /* already cancelled */ }
    },
    get staged() { return stage !== null; },
    get crc() { return this.payload ? api.crc32(this.payload) : null; },
  };
  // Install synchronously so production feature detection cannot see native Web Serial.
  window.__cpsPeer = peer;

  const ready = import(new URL('./model.js', document.baseURI).href).then(modelApi => {
    api = modelApi;
    const model = api.createDefaultModel(3);
    Object.assign(model.settings, { sourceId: 1234567, micGainDb: 22, selectionA: 1, selectionB: 2 });
    Object.assign(model.vfos[0], { talkgroup: 10 });
    model.channels[0] = { ...structuredClone(model.vfos[0]), name: 'P25 TEST',
      filter: 'NAC+TG', scanLists: [0, 2] };
    model.channels[1] = { ...structuredClone(model.vfos[0]), name: 'FM TEST', mode: 'NFM',
      rxHz: 446000000, txHz: 446000000, rxOnly: true, scanLists: [1, 2],
      txTone: { type: 'ctcss', value: 885 }, rxTone: { type: 'dcs-inv', value: 0o23 }, squelch: 4 };
    peer.payload = api.encodePayload(model);
    return peer;
  });
  peer.ready = ready;

  function validRecord(index, record) {
    // Validate each PUT independently, as firmware does; selected-memory references
    // are checked against the whole staged image only at COMMIT.
    if (peer.protocol === 4) return true; // Whole V4 descriptor/reference validation occurs at COMMIT.
    const fixture = api.createDefaultModel(3);
    if (index === 34) fixture.channels = Array.from({ length: 32 }, () => structuredClone(fixture.vfos[0]));
    const isolated = api.encodePayload(fixture);
    isolated.set(record, index * api.RECORD_BYTES);
    try { api.decodePayload(isolated); return true; } catch { return false; }
  }

  function commandReply(command) {
    if (stage && Date.now() - activity >= 60000) peer.discardStage();
    if (peer.busy) return 'CPS ERR BUSY';
    if (command === 'CPS HELLO') {
      if (stage) return 'CPS ERR TRANSACTION';
      return `CPS HELLO DM32P25 ${peer.protocol} ${peer.protocol === 4 ? 256 : 32} 2 ${peer.revision} ${hex32(peer.crc)}`;
    }
    let match = /^CPS GET ([0-9]+)$/.exec(command);
    if (match) {
      const index = Number(match[1]);
      if (index >= api.recordCount(peer.protocol)) return 'CPS ERR RECORD';
      return `CPS DATA ${index} ${hexBytes(peer.payload.subarray(index * 32, (index + 1) * 32))}`;
    }
    match = /^CPS BEGIN ([0-9A-F]{8}) ([0-9]+)$/.exec(command);
    if (match) {
      if (match[1] === '00000000' || Number(match[2]) > 0xFFFFFFFF) return 'CPS ERR TRANSACTION';
      if (stage || Number(match[2]) !== peer.revision) return 'CPS ERR REVISION';
      transaction = match[1];
      stage = peer.payload.slice();
      activity = Date.now();
      return `CPS OK BEGIN ${transaction}`;
    }
    if (!stage) return 'CPS ERR TRANSACTION';
    match = /^CPS PUT ([0-9A-F]{8}) ([0-9]+) ([0-9A-F]{64})$/.exec(command);
    if (match) {
      const index = Number(match[2]);
      if (match[1] !== transaction || index >= api.recordCount(peer.protocol)) return 'CPS ERR RECORD';
      const record = Uint8Array.from(match[3].match(/../g), byte => parseInt(byte, 16));
      if (!validRecord(index, record)) return 'CPS ERR INVALID';
      stage.set(record, index * 32);
      activity = Date.now();
      return `CPS OK PUT ${transaction} ${index}`;
    }
    match = /^CPS ABORT ([0-9A-F]{8})$/.exec(command);
    if (match && match[1] === transaction) {
      const reply = `CPS OK ABORT ${transaction}`;
      peer.discardStage();
      peer.abortCount++;
      return reply;
    }
    match = /^CPS COMMIT ([0-9A-F]{8}) ([0-9A-F]{8})$/.exec(command);
    if (match && match[1] === transaction) {
      if (api.crc32(stage) !== parseInt(match[2], 16)) return 'CPS ERR COMMIT';
      try { api.decodePayload(stage); } catch { return 'CPS ERR COMMIT'; }
      const committedTid = transaction;
      peer.payload = stage.slice();
      peer.bumpRevision();
      peer.commitCount++;
      peer.discardStage();
      return peer.dropCommitReply ? null
        : `CPS OK COMMIT ${committedTid} ${peer.revision} ${hex32(peer.crc)}`;
    }
    return 'CPS ERR COMMAND';
  }

  const port = {
    readable: null,
    writable: null,
    async open(options) {
      await ready;
      if (peer.connected) throw new DOMException('Simulated port already open', 'InvalidStateError');
      peer.openOptions = { ...options };
      peer.openCount++;
      peer.connected = true;
      this.readable = new ReadableStream({ start(value) { controller = value; } });
      this.writable = new WritableStream({ write(bytes) {
        if (!peer.connected) throw new DOMException('Simulated USB cable disconnected', 'NetworkError');
        const request = new TextDecoder().decode(bytes);
        const command = request.endsWith('\r\n') ? request.slice(0, -2) : request;
        peer.commands.push(command);
        const valid = bytes.length <= 120 && /^[ -~]+\r\n$/.test(request);
        const response = valid ? commandReply(command) : 'CPS ERR COMMAND';
        if (response === null) return; // COMMIT was applied but its ACK was lost.
        const encoded = new TextEncoder().encode(response + '\r\n');
        // USB chunks intentionally do not share the ASCII record boundaries.
        for (let offset = 0; offset < encoded.length; offset += 7) {
          controller.enqueue(encoded.slice(offset, offset + 7));
        }
      } });
    },
    async close() {
      peer.closeCount++;
      peer.connected = false;
      this.readable = this.writable = null;
    },
    getInfo() { return { usbVendorId: 0xFFFF, usbProductId: 0xFFFF }; },
  };

  const serial = {
    async requestPort() { await ready; peer.requestCount++; return port; },
    addEventListener(type, listener) { if (type === 'disconnect') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'disconnect') listeners.delete(listener); },
  };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: serial });
})();
