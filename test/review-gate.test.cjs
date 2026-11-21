'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluate,numericId,configFromEnv,collect,pages}=require('../scripts/review-gate.cjs');

const head='a'.repeat(40),base='b'.repeat(40);
const repo='atto-lang/atto-source.rs',now=Date.parse('2026-11-18T12:00:00Z');
const humans={the1mills:2148448,ORESoftware:11139560},overlapApp=777001;
const config={humans,overlapApp};
const review=(id,userId,state='APPROVED',sha=head)=>({
  id,user:{id:userId,login:userId===2148448?'the1mills':
    userId===11139560?'ORESoftware':'someone-else',type:'User'},
  state,commit_id:sha,submitted_at:'2026-11-18T11:00:00Z'
});
const manifest=()=>({schema:'atto.overlap-audit.v1',repo,pr:42,
  head,base,scan_complete:true,unresolved:0,scope:[
    'ready-and-draft-prs','related-repositories','legacy-migration-map',
    'changed-apis-and-symbols'],candidates:[]});
const overlapCheck=()=>({
  id:7,name:'atto-review/overlap-audit',app:{id:overlapApp},
  head_sha:head,external_id:'atto-overlap:v1:'+repo+':42:'+base+':'+head,
  status:'completed',conclusion:'success',completed_at:'2026-11-18T11:30:00Z',
  output:{summary:JSON.stringify(manifest())}
});
function fixture(who='ORESoftware'){
  return {repo,repoId:42,expectedHead:head,now,timeline:[],
    pr:{number:42,state:'open',draft:false,
      created_at:'2026-11-17T12:00:00Z',labels:[],head:{sha:head},
      base:{sha:base,repo:{full_name:repo,id:42}},user:{id:5555}},
    users:{the1mills:{id:2148448,login:'the1mills'},
      ORESoftware:{id:11139560,login:'ORESoftware'}},
    permissions:{the1mills:'admin',ORESoftware:'admin'},
    reviews:[review(1,humans[who])],
    checks:[overlapCheck()]};
}
const verdict=(e,c=config)=>evaluate(e,c);
function denied(e,word,c=config){
  const v=verdict(e,c);
  assert.equal(v.pass,false,JSON.stringify(v));
  assert.ok(v.blockers.some(x=>x.includes(word)),v.blockers.join('; '));
}
test('exactly one independent ORESoftware review + trusted scan is sufficient',()=>{
  const out=verdict(fixture());
  assert.equal(out.pass,true,out.blockers.join('; '));
  assert.equal(out.advisory_only,true);
  assert.equal(out.receipt.human.ORESoftware.reviewId,1);
});
test('exactly one independent the1mills review is sufficient',()=>{
  const e=fixture('the1mills');
  assert.equal(verdict(e).pass,true);
});
for(const [created,lane] of [
  ['2026-11-17T12:00:00Z','early'],
  ['2026-11-14T12:00:00Z','fast'],
  ['2026-11-01T12:00:00Z','renewal']]){
  test('single owner works throughout '+lane+' Ready age, without AI',()=>{
    const e=fixture();e.pr.created_at=created;
    const out=verdict(e);assert.equal(out.pass,true,out.blockers.join('; '));
    assert.equal(out.receipt.readyCycle.window,lane);
  });
}
test('one approval remains effective after an ordinary head update',()=>{
  const e=fixture();e.reviews[0].commit_id='c'.repeat(40);
  assert.equal(verdict(e).pass,true,'GitHub still reports APPROVED');
});
test('both AI reviews with zero trusted human do not count',()=>{
  const e=fixture();e.reviews=[
    {...review(2,90001),user:{id:90001,type:'Bot',login:'chatgpt[bot]'}},
    {...review(3,90002),user:{id:90002,type:'Bot',login:'claude[bot]'}}];
  denied(e,'one independent');
});
test('third human approval never replaces the named trusted owners',()=>{
  const e=fixture();e.reviews=[review(4,999999)];
  denied(e,'one independent');
});
test('requested and COMMENTED reviews are not APPROVED',()=>{
  const e=fixture();e.reviews=[{...review(1,humans.ORESoftware,state='COMMENTED')}];
  denied(e,'one independent');
});
test('revoked or dismissed latest trusted approval fails closed',()=>{
  const e=fixture();
  e.reviews.push(review(2,humans.ORESoftware,'DISMISSED'));
  denied(e,'one independent');
});
test('a later comment does not dismiss a retained approval',()=>{
  const e=fixture();e.reviews.push(review(2,humans.ORESoftware,'COMMENTED'));
  assert.equal(verdict(e).pass,true);
});
test('later CHANGES_REQUESTED from any reviewer blocks until resolved',()=>{
  const e=fixture();e.reviews.push(review(2,999999,'CHANGES_REQUESTED'));
  denied(e,'unresolved CHANGES_REQUESTED');
  e.reviews.push(review(3,999999,'APPROVED'));
  assert.equal(verdict(e).pass,true);
});
test('requested changes by trusted reviewer override earlier approval',()=>{
  const e=fixture();e.reviews.push(review(2,humans.ORESoftware,'CHANGES_REQUESTED'));
  denied(e,'CHANGES_REQUESTED');
});
test('author self approval cannot count',()=>{
  const e=fixture();e.pr.user.id=humans.ORESoftware;
  denied(e,'one independent');
});
test('author the1mills may be approved by ORESoftware',()=>{
  const e=fixture();e.pr.user.id=humans.the1mills;
  assert.equal(verdict(e).pass,true);
});
test('author ORESoftware may be approved by the1mills',()=>{
  const e=fixture('the1mills');e.pr.user.id=humans.ORESoftware;
  assert.equal(verdict(e).pass,true);
});
test('pinned IDs and login cannot be overwritten by an environment variable',()=>{
  assert.equal(configFromEnv({}).humans.ORESoftware,11139560);
  assert.equal(configFromEnv({ATTO_OVERLAP_AUDIT_APP_ID:'777001'}).overlapApp,777001);
  assert.throws(()=>configFromEnv({ATTO_ORESOFTWARE_USER_ID:'1234567'}));
  assert.throws(()=>configFromEnv({ATTO_THE1MILLS_USER_ID:'9999'}));
});
test('unknown GitHub account or insufficient permission fails closed',()=>{
  const e=fixture();e.users.ORESoftware.login='another';
  denied(e,'pinned identity');
  const e2=fixture();e2.permissions.ORESoftware='read';
  denied(e2,'one independent');
});
test('spoofed trusted ID/review login fails closed',()=>{
  const e=fixture();e.reviews[0].user.login='someone-else';
  denied(e,'one independent');
  const changed=structuredClone(config);changed.humans.ORESoftware=1;
  denied(fixture(),'untrusted or missing pinned owner ID',changed);
});
test('invalid review, missing history or duplicate IDs fail closed',()=>{
  const e=fixture();e.reviews=null;denied(e,'history unavailable');
  const bad=fixture();bad.reviews.push(review(1,9999));
  denied(bad,'duplicate');
  const unknown=fixture();unknown.reviews[0].state='USER_APPROVED';
  denied(unknown,'unknown GitHub review state');
});
test('future submitted review or malformed commit cannot count',()=>{
  const e=fixture();e.reviews[0].submitted_at='2026-12-01T00:00:00Z';
  denied(e,'submission time');
  const f=fixture();f.reviews[0].commit_id='main';
  denied(f,'submission time');
});
test('draft, hold and closed PRs remain blocked',()=>{
  const draft=fixture();draft.pr.draft=true;denied(draft,'Draft');
  const held=fixture();held.pr.labels=[{name:'keep-as-draft'}];denied(held,'hold');
  const closed=fixture();closed.pr.state='closed';denied(closed,'not open');
});
test('wrong exact HEAD/base/repo identity blocks',()=>{
  const moving=fixture();moving.expectedHead='c'.repeat(40);
  denied(moving,'changed');
  const baseId=fixture();baseId.pr.base.sha='c'.repeat(40);
  denied(baseId,'overlap');
  const baseRepo=fixture();baseRepo.pr.base.repo.id=7;
  denied(baseRepo,'identity mismatch');
  const invalid=fixture();invalid.repo='other/atto-source.rs';
  denied(invalid,'unallowlisted');
});
test('missing, failed, stale and forged overlap checks block every age',()=>{
  for(const created of ['2026-11-17T12:00:00Z','2026-11-14T12:00:00Z','2026-11-01T12:00:00Z']){
    const missing=fixture();missing.pr.created_at=created;missing.checks=[];
    denied(missing,'competing-PR audit');
    const fail=fixture();fail.pr.created_at=created;fail.checks[0].conclusion='failure';
    denied(fail,'competing-PR audit');
    const forged=fixture();forged.pr.created_at=created;forged.checks[0].app.id=1234;
    denied(forged,'competing-PR audit');
  }
});
test('overlap manifest must include every checked candidate and no unresolved work',()=>{
  const e=fixture();e.checks[0].output.summary=JSON.stringify({...manifest(),unresolved:1});
  denied(e,'competing-PR audit');
  const f=fixture();f.checks[0].output.summary=JSON.stringify({
    ...manifest(),candidates:[{url:'https://github.com/atto-lang/atto-source.rs/pull/44',
      head:'c'.repeat(40),disposition:'independent',rationale:'Separate ABI with no symbol overlap'}]});
  assert.equal(verdict(f).pass,true);
});
test('numeric IDs reject zero, infinity, enormous, fractional and ambiguous IDs',()=>{
  for(const s of ['','0','1.5','-1','x7','9007199254740993',null,NaN]){
    assert.equal(numericId(s),null,String(s));
  }
  assert.equal(numericId('11139560'),11139560);
});
test('status name alone never authorizes a merge (advisory only)',()=>{
  const e=fixture();e.checks.push({name:'atto-review/openai',conclusion:'success'});
  const v=verdict(e);
  assert.equal(v.pass,true);
  assert.equal(v.advisory_only,true);
});

function mockFetch(table,mutate){
  const calls=[];
  return {calls,fetch:async url=>{
    const path=new URL(url).pathname;calls.push(path);
    let data=table[path];
    if(mutate)data=mutate(path,calls.filter(x=>x===path).length,data);
    if(data===undefined)return {ok:false,status:404,json:async()=>({})};
    return {ok:true,json:async()=>structuredClone(data)};
  }};
}
function mockTable(){
  const e=fixture();
  return {
    ['/repos/'+repo+'/pulls/42']:{...e.pr,updated_at:'2026-11-18T12:00:00Z'},
    ['/repos/'+repo]:{id:42},
    ['/repos/'+repo+'/pulls/42/reviews']:e.reviews,
    ['/repos/'+repo+'/issues/42/timeline']:e.timeline,
    '/users/the1mills':e.users.the1mills,
    '/users/ORESoftware':e.users.ORESoftware,
    ['/repos/'+repo+'/collaborators/the1mills/permission']:{permission:'admin'},
    ['/repos/'+repo+'/collaborators/ORESoftware/permission']:{permission:'admin'},
    ['/repos/'+repo+'/commits/'+head+'/check-runs']:{check_runs:e.checks},
  };
}
test('collector authenticates source, owner identities, reviews and overlap twice',async()=>{
  const before=globalThis.fetch,mock=mockFetch(mockTable());globalThis.fetch=mock.fetch;
  try{
    const e=await collect(repo,42,'private-token-not-shared');
    assert.equal(e.repo,repo);
    assert.equal(e.users.ORESoftware.id,11139560);
    assert.equal(verdict(e).pass,true);
    assert.equal(mock.calls.filter(p=>p.endsWith('/reviews')).length,2);
    assert.equal(mock.calls.filter(p=>p.endsWith('/check-runs')).length,2);
  }finally{globalThis.fetch=before;}
});
test('collector rejects PR HEAD changing on the second read',async()=>{
  const before=globalThis.fetch;
  globalThis.fetch=mockFetch(mockTable(),(path,n,data)=>{
    if(path.endsWith('/pulls/42')&&n===2)
      return {...data,head:{sha:'c'.repeat(40)}};
    return data;
  }).fetch;
  try{await assert.rejects(collect(repo,42,'token'),/changed during verification/);}
  finally{globalThis.fetch=before;}
});
test('collector rejects review mutation on the second read',async()=>{
  const before=globalThis.fetch;
  globalThis.fetch=mockFetch(mockTable(),(path,n,data)=>{
    if(path.endsWith('/reviews')&&n===2)return [{...data[0],state:'DISMISSED'}];
    return data;
  }).fetch;
  try{await assert.rejects(collect(repo,42,'token'),/review or check changed/);}
  finally{globalThis.fetch=before;}
});
test('collector rejects newly forged overlap check on second read',async()=>{
  const before=globalThis.fetch;
  globalThis.fetch=mockFetch(mockTable(),(path,n,data)=>{
    if(path.endsWith('/check-runs')&&n===2)
      return {...data,check_runs:[{...data.check_runs[0],app:{id:12345}}]};
    return data;
  }).fetch;
  try{await assert.rejects(collect(repo,42,'token'),/review or check changed/);}
  finally{globalThis.fetch=before;}
});
test('pagination fails closed if all twenty pages have 100 entries',async()=>{
  const before=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>Array(100).fill({})});
  try{await assert.rejects(pages('/repos/'+repo+'/pulls/42/reviews','token'),/cap reached/);}
  finally{globalThis.fetch=before;}
});
