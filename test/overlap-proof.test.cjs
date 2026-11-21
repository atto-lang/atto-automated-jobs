'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyOverlapProof } = require('../scripts/overlap-proof.cjs');
const repo = 'atto-lang/atto-source.rs';
const sha = 'a'.repeat(40), base = 'b'.repeat(40), now = Date.parse('2026-11-20T12:00:00Z');
const pr = { number: 42, head: { sha }, base: { sha: base } };
const cycle = { ok: true, state: 'ready', window: 'fast', cycleStart: '2026-11-17T12:00:00Z' };
const manifest = () => ({schema:'atto.overlap-audit.v1',repo,pr:42,head:sha,base,scan_complete:true,unresolved:0,scope:['ready-and-draft-prs','related-repositories','legacy-migration-map','changed-apis-and-symbols'],candidates:[]});
const check = () => ({id:7,name:'atto-review/overlap-audit',app:{id:777},head_sha:sha,external_id:'atto-overlap:v1:' + repo + ':42:' + base + ':' + sha,status:'completed',conclusion:'success',completed_at:'2026-11-19T12:00:00Z',output:{summary:JSON.stringify(manifest())}});
function run(overrides = {}) { return verifyOverlapProof({repo,pr,checks:[check()],appId:777,providerAppIds:[12,13],cycle,now,...overrides}); }
function blocked(overrides, word) { const r=run(overrides);assert.equal(r.pass,false);assert.ok(r.blockers.some(x=>x.includes(word)),r.blockers.join('; ')); }
test('trusted exact-head exact-base complete audit admitted',()=> assert.equal(run().pass,true));
test('missing audit rejected',()=>blocked({checks:[]},'missing successful'));
test('spoofed check beside genuine one rejected',()=>blocked({checks:[check(),{...check(),id:8,app:{id:999}}]},'spoofed'));
test('wrong head rejected',()=>blocked({checks:[{...check(),head_sha:'c'.repeat(40)}]},'spoofed'));
test('wrong base identity rejected',()=>blocked({pr:{...pr,base:{sha:'c'.repeat(40)}}},'spoofed'));
test('wrong PR number rejected',()=>blocked({pr:{...pr,number:43}},'spoofed'));
test('untrusted App rejected',()=>blocked({appId:0},'untrusted'));
test('same App as AI provider rejected',()=>blocked({providerAppIds:[12,777]},'nonindependent'));
test('failed check rejected',()=>blocked({checks:[{...check(),conclusion:'failure'}]},'missing successful'));
test('stale check rejected',()=>blocked({checks:[{...check(),completed_at:'2026-11-16T00:00:00Z'}]},'stale'));
test('future check rejected',()=>blocked({checks:[{...check(),completed_at:'2026-11-21T00:00:00Z'}]},'future'));
test('missing manifest rejected',()=>blocked({checks:[{...check(),output:{summary:''}}]},'manifest'));
test('incomplete scan scope rejected',()=>{const x=check();x.output.summary=JSON.stringify({...manifest(),scope:[]});blocked({checks:[x]},'manifest');});
test('unresolved competing PR rejected',()=>{const x=check();x.output.summary=JSON.stringify({...manifest(),unresolved:1});blocked({checks:[x]},'manifest');});
test('candidate requires immutable head and semantic disposition',()=>{const x=check();x.output.summary=JSON.stringify({...manifest(),candidates:[{url:'https://github.com/atto-lang/atto-source.rs/pull/3',head:sha,disposition:'independent'}]});blocked({checks:[x]},'manifest');});
test('well-dispositioned competitor accepted',()=>{const x=check();x.output.summary=JSON.stringify({...manifest(),candidates:[{url:'https://github.com/atto-lang/atto-source.rs/pull/3',head:sha,disposition:'independent',rationale:'Different runtime ABI, no changed APIs overlap'}]});assert.equal(run({checks:[x]}).pass,true);});
test('draft and renewal windows do not use fast lane proof',()=>{for(const window of ['draft','early','renewal'])blocked({cycle:{...cycle,window}},'not an authenticated');});
