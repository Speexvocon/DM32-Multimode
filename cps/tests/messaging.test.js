// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { CpsClient, parseMessageHello, parseMessageItem } from '../transport.js';
import { messageReplyDraft } from '../call-tools.js';
const hello = (serial=8,count=1) => `CPS MSG HELLO 1 serial=${serial} count=${count} capacity=16 max=80 p25=110 dmr=111`;
const bytes = text => Array.from(text, value => value.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0')).join('');
class MailboxPeer {
  constructor() {
    this.requests=[];this.serial=8;this.supported=true;this.dropSend=false;this.changed=false;this.stage=null;
    this.items=[{id:42,protocol:2,kind:1,source:123456,destination:765432,state:'RECEIVED',format:2,unread:1,text:'<script>literal text</script> across chunks',stamp:1000,token:0,flags:1}];
    this.port={open:async()=>{
      this.port.readable=new ReadableStream({start:controller=>{this.controller=controller;}});
      this.port.writable=new WritableStream({write:async raw=>{
        assert.ok(raw.length<=120);const command=new TextDecoder().decode(raw).trim();this.requests.push(command);
        const reply=this.handle(command);if(reply!==null)this.controller.enqueue(new TextEncoder().encode(reply+'\r\n'));
      }});
    },close:async()=>{}};
  }
  async requestPort(){return this.port;}
  handle(command){
    const p=command.split(' ');
    if(command==='CPS MSG HELLO')return this.supported?hello(this.serial,this.items.length):'CPS ERR COMMAND';
    if(command==='CPS LIVE')return 'CPS OK LIVE';
    if(p[2]==='LIST'){
      const m=this.items[Number(p[3])];if(!m)return 'CPS MSG ERR NOT_FOUND';
      return `CPS MSG ITEM ${m.id} ${m.protocol} ${m.kind} ${m.source} ${m.destination} ${m.state} ${m.format} ${m.unread} ${m.text.length} ${m.stamp} ${m.token} ${m.flags}`;
    }
    if(p[2]==='GET'){
      const m=this.items.find(v=>v.id===Number(p[3]));if(!m)return 'CPS MSG ERR NOT_FOUND';
      const offset=Number(p[4]);if(this.changed)this.serial++;
      return `CPS MSG TEXT ${m.id} ${offset} ${bytes(m.text.slice(offset,offset+32))}`;
    }
    if(p[2]==='READ'||p[2]==='DELETE'){
      const m=this.items.find(v=>v.id===Number(p[3]));if(!m)return 'CPS MSG ERR NOT_FOUND';
      if(p[2]==='READ')m.unread=0;else this.items=this.items.filter(v=>v!==m);this.serial++;
      return `CPS MSG OK ${p[2]} ${p[3]}`;
    }
    if(p[2]==='BEGIN'){this.stage={token:Number(p[3]),protocol:Number(p[4]),kind:Number(p[5]),destination:Number(p[6]),format:Number(p[8]),length:Number(p[9]),text:''};return `CPS MSG OK BEGIN ${p[3]}`;}
    if(p[2]==='PUT'){assert.equal(Number(p[4]),this.stage.text.length);this.stage.text+=String.fromCharCode(...p[5].match(/../g).map(v=>parseInt(v,16)));return `CPS MSG OK PUT ${p[3]} ${p[4]}`;}
    if(p[2]==='CANCEL'){this.stage=null;return `CPS MSG OK CANCEL ${p[3]}`;}
    if(p[2]==='SEND'){
      assert.equal(this.stage.text.length,this.stage.length);const id=50;
      this.items.push({...this.stage,id,source:765432,state:'QUEUED',unread:0,stamp:2000,flags:0});this.serial++;
      return this.dropSend?null:`CPS MSG OK SEND ${p[3]} ${id}`;
    }
    throw new Error(command);
  }
}
async function setup(t,{timeoutMs=500}={}){const peer=new MailboxPeer(),client=new CpsClient({serial:peer,timeoutMs});t.after(()=>client.disconnect());await client.connect({messaging:true});return {peer,client};}
test('mailbox capabilities and metadata reject ambiguous versions and out-of-bound identities',()=>{
  assert.equal(parseMessageHello(hello()).DMR.acknowledgments,true);
  for(const line of [hello().replace('capacity=16','capacity=0'),hello().replace('count=1','count=17'),hello().replace('max=80','max=999'),hello().replace('serial=8','serial=4294967296'),hello()+' extra'])assert.throws(()=>parseMessageHello(line));
  const line='CPS MSG ITEM 42 2 1 123456 765432 RECEIVED 2 1 4 1000 0 1';
  assert.equal(parseMessageItem(line).truncated,true);
  for(const bad of [line.replace('42 2','4294967296 2'),line.replace('RECEIVED','SENDING'),line.replace(' 4 1000',' 81 1000'),line+' extra',line.slice(0,-1)+'4'])assert.throws(()=>parseMessageItem(bad));
});
test('message-only connect and full read never open or touch codeplug transaction; literal text and truncation preserved',async t=>{
  const {peer,client}=await setup(t);assert.equal(client.protocolVersion,null);assert.deepEqual(peer.requests,['CPS MSG HELLO']);
  const result=await client.messages();assert.equal(result.messages[0].id,42);assert.equal(result.messages[0].text,peer.items[0].text);assert.equal(result.messages[0].truncated,true);
  assert.ok(peer.requests.every(command=>command.startsWith('CPS MSG ')));
  assert.deepEqual(messageReplyDraft(result.messages[0]),{protocol:'DMR',type:'unit',destinationId:123456,text:''});
});
test('explicit mark/read/delete are stable-ID operations and old firmware gracefully keeps local drafts',async t=>{
  const {peer,client}=await setup(t);await client.messageAction('READ',42);assert.equal((await client.messages()).messages[0].unread,false);
  await client.messageAction('DELETE',42);assert.equal((await client.messages()).messages.length,0);
  await assert.rejects(client.messageAction('DELETE',42),{code:'REFUSED',radioCode:'NOT_FOUND'});assert.equal(client.connected,true);
  peer.supported=false;assert.deepEqual(await client.messages(),{capabilities:null,messages:[]});assert.equal(client.connected,true);
});
test('serial changes during mailbox read request refresh without tainting the connection',async t=>{
  const {peer,client}=await setup(t);peer.changed=true;await assert.rejects(client.messages(),{code:'MAILBOX_CHANGED'});assert.equal(client.connected,true);
});
test('send stages all 80 ASCII bytes then queues exactly once; default ETSI IP and explicit state',async t=>{
  const {peer,client}=await setup(t);const draft={protocol:'DMR',type:'unit',destinationId:123456,text:'A'.repeat(80)};
  assert.deepEqual(await client.sendMessage(draft,{token:123}),{token:123,id:50,state:'QUEUED'});
  assert.equal(peer.items.at(-1).format,2);assert.equal(peer.items.at(-1).text,draft.text);
  assert.equal(peer.requests.filter(v=>v==='CPS MSG SEND 123').length,1);assert.equal(peer.requests.filter(v=>v.startsWith('CPS MSG PUT')).length,3);
  assert.equal((await client.messages()).messages.at(-1).state,'QUEUED');
});
test('wrong P25 group/format and unsupported ACK requests fail before preparing any transmission',async t=>{
  const {peer,client}=await setup(t);const draft={protocol:'P25',type:'unit',destinationId:123,text:'hello'};
  for(const [value,options] of [[{...draft,type:'group'},{}],[draft,{format:1}],[draft,{acknowledgment:true}],[{...draft,protocol:'DMR'}, {format:2,acknowledgment:true}],[{...draft,protocol:'DMR',type:'group'},{format:0,acknowledgment:true}]])await assert.rejects(client.sendMessage(value,{token:123,...options}),{code:'MESSAGE'});
  assert.deepEqual(peer.requests,['CPS MSG HELLO']);
});
test('lost SEND acknowledgment never retries and reports token for outbox reconciliation',async t=>{
  const {peer,client}=await setup(t,{timeoutMs:40});peer.dropSend=true;
  await assert.rejects(client.sendMessage({protocol:'DMR',type:'unit',destinationId:123,text:'one copy'},{token:321}),{code:'MESSAGE_UNCERTAIN',token:321,uncertain:true});
  assert.equal(peer.requests.filter(v=>v==='CPS MSG SEND 321').length,1);assert.equal(peer.items.filter(v=>v.token===321).length,1);assert.equal(client.connected,false);
});

test('message-only connect on older firmware stays connected for drafts without issuing codeplug HELLO',async t=>{
  const peer=new MailboxPeer();peer.supported=false;const client=new CpsClient({serial:peer});t.after(()=>client.disconnect());
  assert.equal(await client.connect({messaging:true}),null);assert.equal(client.connected,true);assert.deepEqual(peer.requests,['CPS MSG HELLO']);
});

test('legacy TRANSACTION for unknown MSG is disambiguated only with read-only service discovery', async t => {
  for (const probe of [
    'CPS SERVICES 1 heard=32 contacts=96 p25_unit=1 dmr_unit=1 p25_text=000 dmr_text=000',
    'CPS ERR COMMAND', 'CPS ERR UNSUPPORTED', 'CPS ERR TRANSACTION',
  ]) {
    const peer=new MailboxPeer(), original=peer.handle.bind(peer);
    peer.handle=command=>command==='CPS MSG HELLO'?'CPS ERR TRANSACTION':command==='CPS SERVICES'?probe:original(command);
    const client=new CpsClient({serial:peer});t.after(()=>client.disconnect());
    assert.equal(await client.connect({messaging:true}),null);assert.equal(client.connected,true);
    assert.deepEqual(peer.requests,['CPS MSG HELLO','CPS SERVICES']);
    assert.deepEqual(await client.messages(),{capabilities:null,messages:[]});
    assert(peer.requests.every(command=>['CPS MSG HELLO','CPS SERVICES'].includes(command)));
  }
});
test('modern firmware TRANSACTION is preserved when service discovery advertises messaging', async t => {
  const peer=new MailboxPeer();peer.handle=command=>command==='CPS MSG HELLO'?'CPS MSG ERR TRANSACTION':
    command==='CPS SERVICES'?'CPS SERVICES 1 heard=32 contacts=96 p25_unit=1 dmr_unit=1 p25_text=110 dmr_text=111':null;
  const client=new CpsClient({serial:peer});t.after(()=>client.disconnect());
  await assert.rejects(client.connect({messaging:true}),{code:'REFUSED',radioCode:'TRANSACTION'});
  assert.deepEqual(peer.requests,['CPS MSG HELLO','CPS SERVICES']);assert.equal(client.connected,false);
});
