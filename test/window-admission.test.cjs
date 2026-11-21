'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { determineReviewAdmission } = require('../scripts/window-admission.cjs');
function state(window='early') {
  return {cycle:{ok:true,state:'ready',window},
    human:{the1mills:false,ORESoftware:true},
    overlap:{pass:true}};
}
for(const lane of ['early','fast','renewal']){
  test(lane+' admits exactly one independent designated owner with overlap',()=>{
    assert.equal(determineReviewAdmission(state(lane)).pass,true);
    const alt=state(lane);alt.human={the1mills:true,ORESoftware:false};
    assert.equal(determineReviewAdmission(alt).pass,true);
  });
  test(lane+' denies zero owners even with two AI checks or third human',()=>{
    const f=state(lane);f.human={the1mills:false,ORESoftware:false};
    f.ai={openai:true,anthropic:true};f.extraHuman=true;
    assert.equal(determineReviewAdmission(f).pass,false);
  });
  test(lane+' requires semantic overlap proof before merge',()=>{
    const f=state(lane);f.overlap={pass:false};
    assert.equal(determineReviewAdmission(f).pass,false);
  });
}
test('nonboolean owner values do not count',()=>{
  const f=state();f.human={the1mills:'APPROVED',ORESoftware:1};
  assert.equal(determineReviewAdmission(f).pass,false);
});
test('draft, invalid and unknown cycles fail closed',()=>{
  for(const cycle of [
    {ok:true,state:'draft',window:'draft'},
    {ok:false,state:'ready',window:'early'},
    {ok:true,state:'ready',window:'unknown'}
  ]){
    const f=state();f.cycle=cycle;
    assert.equal(determineReviewAdmission(f).pass,false);
  }
});
