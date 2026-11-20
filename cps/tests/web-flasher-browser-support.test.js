// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {browserSupport} from '../flasher/browser-support.js';

const desktop='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ';
const chrome=desktop+'Chrome/142.0.0.0 Safari/537.36';
const serial={requestPort(){assert.fail('Browser detection must never request a port');}};
const check=(navigator,secureContext=true)=>browserSupport({navigator,secureContext});

test('desktop Chrome, Edge, Chromium, Opera and Vivaldi pass without side effects',()=>{
  for(const ua of [chrome,chrome+' Edg/142.0.0.0',desktop+'Chromium/142.0.0.0',
    chrome+' OPR/120.0.0.0',chrome+' Vivaldi/7.6.0.0']) {
    assert.deepEqual(check({userAgent:ua,serial}),{supported:true,reason:'',message:''});
  }
});
test('Chromium and Brave UAData brands work without a legacy user agent',()=>{
  for(const brand of ['Chromium','Brave','Microsoft Edge']) {
    assert.equal(check({userAgentData:{brands:[{brand:'Not A;Brand'},{brand}],mobile:false,platform:'Windows'},serial}).supported,true);
  }
});
test('unknown or fake brands cannot qualify a browser; a valid UA remains a fallback',()=>{
  for(const brand of ['NotChromium','Fake Chrome','Chromium Clone','Not A;Brand']) {
    assert.equal(check({userAgentData:{brands:[{brand}]},serial}).reason,'unsupported-browser');
  }
  assert.equal(check({userAgent:chrome,userAgentData:{brands:[]},serial}).supported,true);
  assert.equal(check({userAgent:chrome,userAgentData:{brands:[{brand:'Not A;Brand'}]},serial}).supported,true);
});
test('Firefox and Safari are unsupported even if an injected serial API exists',()=>{
  for(const ua of [desktop+'Gecko/20100101 Firefox/144.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15']) {
    const result=check({userAgent:ua,serial});
    assert.equal(result.supported,false);assert.equal(result.reason,'unsupported-browser');
    assert.match(result.message,/desktop Chrome/);
  }
});
test('iOS browser variants and Android/mobile Chromium remain unsupported',()=>{
  for(const ua of ['Mozilla/5.0 (iPhone) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad) EdgiOS/142.0 Mobile/15E148',
    'Mozilla/5.0 (iPod) FxiOS/140.0 Mobile/15E148',
    'Mozilla/5.0 OPiOS/16.0 Safari/9537.53',
    'Mozilla/5.0 (Linux; Android 15) Chrome/142.0.0.0 Mobile Safari/537.36']) {
    assert.equal(check({userAgent:ua,userAgentData:{brands:[{brand:'Chromium'}]},serial}).reason,'unsupported-browser');
  }
  assert.equal(check({userAgent:chrome,userAgentData:{mobile:true},serial}).reason,'unsupported-browser');
  assert.equal(check({userAgent:chrome,userAgentData:{platform:'Android'},serial}).reason,'unsupported-browser');
  assert.equal(check({userAgent:'Mozilla/5.0 (Macintosh) Chrome/142.0.0.0',maxTouchPoints:5,serial}).reason,'unsupported-browser');
});
test('insecure origins and unavailable or blocked Web Serial have distinct reasons',()=>{
  const insecure=check({userAgent:chrome,serial},false);
  assert.equal(insecure.reason,'insecure-context');assert.match(insecure.message,/HTTPS or localhost/);
  for(const missing of [undefined,{}, {requestPort:null},{requestPort:true}]) {
    const result=check({userAgent:chrome,serial:missing});
    assert.equal(result.supported,false);assert.equal(result.reason,'web-serial-unavailable');
    assert.match(result.message,/Web Serial/);
  }
});
test('missing navigator and malformed UAData safely report unsupported browser',()=>{
  assert.equal(browserSupport({navigator:undefined,secureContext:true}).reason,'unsupported-browser');
  assert.equal(check({userAgentData:{brands:'Chromium'},serial}).reason,'unsupported-browser');
  assert.equal(check({userAgentData:{brands:[null,{}]},serial}).reason,'unsupported-browser');
});
