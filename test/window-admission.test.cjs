'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { determineReviewAdmission } = require('../scripts/window-admission.cjs');
function state(window = 'early') { return { cycle: {ok:true,state:'ready',window},human:{the1mills:true,ORESoftware:true},ai:{openai:true,anthropic:true},extraHuman:false,overlap:{pass:true} }; }
test('early requires both human and both AI slots',()=>assert.equal(determineReviewAdmission(state()).pass,true));
test('early rejects missing human',()=>{const x=state();x.human.ORESoftware=false;assert.equal(determineReviewAdmission(x).pass,false)});
test('early rejects missing AI',()=>{const x=state();x.ai.anthropic=false;assert.equal(determineReviewAdmission(x).pass,false)});
test('renewal again requires both human and AI slots',()=>{const x=state('renewal');assert.equal(determineReviewAdmission(x).pass,true);x.ai.openai=false;assert.equal(determineReviewAdmission(x).pass,false)});
test('fast accepts one designated eligible human with trusted overlap audit',()=>{const x=state('fast');x.human.ORESoftware=false;x.ai.openai=false;x.ai.anthropic=false;assert.equal(determineReviewAdmission(x).pass,true)});
test('fast accepts one eligible independent non-designated human',()=>{const x=state('fast');x.human.the1mills=false;x.human.ORESoftware=false;x.ai.openai=false;x.ai.anthropic=false;x.extraHuman=true;assert.equal(determineReviewAdmission(x).pass,true)});
test('fast accepts one authenticated AI family with trusted overlap audit',()=>{const x=state('fast');x.human.the1mills=false;x.human.ORESoftware=false;x.ai.anthropic=false;assert.equal(determineReviewAdmission(x).pass,true)});
test('fast rejects zero approvals',()=>{const x=state('fast');x.human.the1mills=false;x.human.ORESoftware=false;x.ai.openai=false;x.ai.anthropic=false;assert.equal(determineReviewAdmission(x).pass,false)});
test('fast rejects missing overlap attestation',()=>{const x=state('fast');x.overlap={pass:false,blockers:['no audit']};assert.equal(determineReviewAdmission(x).pass,false)});
test('draft rejects even four approvals and overlap',()=>{const x=state('draft');x.cycle.state='draft';assert.equal(determineReviewAdmission(x).pass,false)});
test('invalid cycle rejects even four approvals',()=>{const x=state();x.cycle.ok=false;assert.equal(determineReviewAdmission(x).pass,false)});
