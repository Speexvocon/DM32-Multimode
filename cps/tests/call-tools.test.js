// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { findContact, channelAddress, MESSAGE_DRAFT_LIMIT, validateMessageDraft, exportMessageDraft, importMessageDraft } from '../call-tools.js';

test('directory lookup keeps radio/group and protocol namespaces distinct', () => {
  const p25 = { protocol: 'P25', type: 'unit', id: 123, name: 'P25 caller' };
  const dmr = { protocol: 'DMR', type: 'unit', id: 123, name: 'DMR caller' };
  const group = { protocol: 'Both', type: 'group', id: 123, name: 'Local group' };
  assert.equal(findContact([null, p25, dmr, group], 'P25', 'unit', 123), p25);
  assert.equal(findContact([null, p25, dmr, group], 'DMR', 'unit', 123), dmr);
  assert.equal(findContact([group], 'DMR', 'group', 123), group);
  assert.equal(findContact([group], 'P25', 'unit', 123), null);
  assert.equal(findContact([p25], 'DMR', 'unit', 123), null);
  assert.equal(findContact(undefined, 'P25', 'unit', 123), null);
});

test('P25 private destination remains separate from the retained 16-bit group', () => {
  assert.deepEqual(channelAddress({ mode: 'P25', privateCall: false, talkgroup: 1000, destinationId: 1 }), { protocol: 'P25', type: 'group', id: 1000 });
  assert.deepEqual(channelAddress({ mode: 'P25', privateCall: true, talkgroup: 1000, destinationId: 1234567 }), { protocol: 'P25', type: 'unit', id: 1234567 });
  assert.deepEqual(channelAddress({ mode: 'DMR', privateCall: false, destinationId: 98638 }), { protocol: 'DMR', type: 'group', id: 98638 });
});

test('draft files preserve explicit protocol and call path without claiming delivery', () => {
  for (const protocol of ['P25', 'DMR']) for (const type of ['unit', 'group']) {
    const draft = { protocol, type, destinationId: 42, text: '<script>alert("hi")</script>' };
    const json = exportMessageDraft(draft);
    assert.deepEqual(importMessageDraft(json), draft);
    assert.equal(JSON.parse(json).format, 'dm32-message-draft');
    assert.equal(Object.hasOwn(JSON.parse(json), 'sent'), false);
  }
  assert.equal(MESSAGE_DRAFT_LIMIT, 80);
});

test('draft validation rejects lossy IDs, invalid addressing, control text and oversized input', () => {
  const valid = { protocol: 'P25', type: 'unit', destinationId: 16777215, text: 'A'.repeat(80) };
  assert.deepEqual(validateMessageDraft(valid), []);
  for (const change of [{protocol:'FM'}, {type:'broadcast'}, {destinationId:0}, {destinationId:'123'},
    {destinationId:1.5}, {destinationId:16777216}, {text:''}, {text:' '}, {text:'A'.repeat(81)}, {text:'line\nbreak'}, {text:'nul\0'}, {text:'é'}]) {
    const bad = {...valid,...change};
    assert(validateMessageDraft(bad).length);
    assert.throws(() => exportMessageDraft(bad));
  }
  assert(validateMessageDraft({...valid,type:'group',destinationId:65536}).length);
  assert.deepEqual(validateMessageDraft({...valid,protocol:'DMR',type:'group'}), []);
  for (const text of ['{', 'null', '{}', 'A'.repeat(4097), JSON.stringify({...valid,format:'other',version:1})]) assert.throws(() => importMessageDraft(text));
  assert.throws(() => importMessageDraft(JSON.stringify({...valid,format:'dm32-message-draft',version:2})));
  const extra = JSON.stringify({...valid, format:'dm32-message-draft',version:1,sent:true,radioWrite:true});
  assert.deepEqual(importMessageDraft(extra), valid);
});

test('draft text format and acknowledgment round-trip explicitly without fabricating delivery', () => {
  const draft={protocol:'DMR',type:'unit',destinationId:42,text:'Call me'};
  const file=exportMessageDraft(draft,{format:0,acknowledgment:true});
  assert.deepEqual(importMessageDraft(file),{...draft,textFormat:0,acknowledgment:true});
  for(const options of [{format:2,acknowledgment:true},{format:9,acknowledgment:false},{format:1,acknowledgment:'yes'}])assert.throws(()=>exportMessageDraft(draft,options));
});
