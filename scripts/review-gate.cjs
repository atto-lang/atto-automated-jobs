#!/usr/bin/env node
'use strict';

// Read-only independent-review admission gate. No PR-head code is executed.
// A PASS is supplemental evidence; protected source-repository checks and
// eligible GitHub approvals remain mandatory.
const { resolveCycle } = require('./ready-cycle.cjs');
const { verifyOverlapProof } = require('./overlap-proof.cjs');
const { determineReviewAdmission } = require('./window-admission.cjs');
const SHA = /^[0-9a-f]{40}$/i;
const REPO = /^atto-lang\/atto-source\.[a-z][a-z0-9-]*$/;
const CHECK_NAMES = Object.freeze({
  openai: 'atto-review/openai',
  anthropic: 'atto-review/anthropic',
});

function numericId(value) {
  const text = String(value ?? '');
  return /^[1-9][0-9]*$/.test(text) && Number.isSafeInteger(Number(text))
    ? Number(text) : null;
}

// Immutable public GitHub numeric IDs: usernames alone are never authority.
// Extra AI providers are optional advisory evidence, never approval slots.
const TRUSTED_HUMAN_IDS = Object.freeze({the1mills:2148448, ORESoftware:11139560});
function configFromEnv(env = process.env) {
  for (const [label, name] of [
    ['the1mills','ATTO_THE1MILLS_USER_ID'],
    ['ORESoftware','ATTO_ORESOFTWARE_USER_ID']
  ]) {
    if (env[name] !== undefined && numericId(env[name]) !== TRUSTED_HUMAN_IDS[label])
      throw Error('noncanonical trusted reviewer identity supplied: '+name);
  }
  return {
    humans: {...TRUSTED_HUMAN_IDS},
    overlapApp: numericId(env.ATTO_OVERLAP_AUDIT_APP_ID),
  };
}

function evaluate({repo,pr,reviews,checks,users,permissions,repoId,expectedHead,timeline,now},config) {
  const blockers=[], receipt={head:pr?.head?.sha||null,human:{},overlapAudit:null};
  const cycle=resolveCycle(pr,timeline,now);
  receipt.readyCycle=cycle;
  blockers.push(...cycle.blockers);
  if (!REPO.test(repo||'')) blockers.push('unallowlisted target repository');
  if (!SHA.test(pr?.head?.sha||'')) blockers.push('missing/invalid PR head SHA');
  if (expectedHead && expectedHead!==pr?.head?.sha)
    blockers.push('PR head SHA changed');
  if (pr?.base?.repo?.full_name!==repo || pr?.base?.repo?.id!==repoId)
    blockers.push('PR base repository identity mismatch');
  if (!SHA.test(pr?.base?.sha||''))
    blockers.push('missing/invalid PR base SHA');
  if (!numericId(pr?.number))
    blockers.push('PR number missing');
  if (pr?.state!=='open') blockers.push('PR is not open');
  if (pr?.draft!==false) blockers.push('PR remains draft');
  if (!numericId(pr?.user?.id)) blockers.push('PR author identity missing');

  for(const [label,id] of Object.entries(TRUSTED_HUMAN_IDS)) {
    if(config?.humans?.[label]!==id)
      blockers.push(label+': untrusted or missing pinned owner ID');
    if(users?.[label]?.id!==id || users?.[label]?.login?.toLowerCase()!==label.toLowerCase())
      blockers.push(label+': GitHub account does not match pinned identity');
    if(!['write','maintain','admin'].includes(permissions?.[label]))
      blockers.push(label+': cannot verify eligible write-level repository access');
  }

  // Only the authenticated complete GitHub review feed is admissible.
  // A review's old commit ID remains valid when GitHub *still* reports an
  // effective APPROVED review: the canonical policy retains one approval
  // across ordinary pushes. Actual protection can impose stronger rules.
  const latest=new Map(),seenIds=new Set();
  if(!Array.isArray(reviews)||reviews.length>5000)
    blockers.push('bounded authenticated GitHub review history unavailable');
  const safe=Array.isArray(reviews)?reviews.slice(0,5000):[];
  for(const review of safe.sort((a,b)=>(a?.id||0)-(b?.id||0))){
    if(!numericId(review?.id) || !numericId(review?.user?.id) ||
        typeof review.user.login!=='string' ||
        seenIds.has(review.id)) {
      blockers.push('unattributable or duplicate GitHub review');continue;
    }
    seenIds.add(review.id);
    if(!['APPROVED','CHANGES_REQUESTED','DISMISSED','COMMENTED','PENDING'].includes(review.state)){
      blockers.push('unknown GitHub review state');continue;
    }
    if(review.state==='COMMENTED'||review.state==='PENDING')continue;
    const timestamp=Date.parse(review.submitted_at||'');
    if(!SHA.test(review.commit_id||'')||!Number.isFinite(timestamp)||
        !Number.isSafeInteger(now)||timestamp>now){
      blockers.push('review has invalid commit or submission time');continue;
    }
    latest.set(review.user.id,review);
  }

  const approved={};
  for(const [label,id] of Object.entries(TRUSTED_HUMAN_IDS)){
    const review=latest.get(id);
    const identity=users?.[label];
    approved[label]=Boolean(review && review.state==='APPROVED' &&
      review.user?.id===id && review.user?.login?.toLowerCase()===label.toLowerCase() &&
      review.user?.type==='User' && pr?.user?.id!==id &&
      identity?.id===id && identity?.login?.toLowerCase()===label.toLowerCase() &&
      ['write','maintain','admin'].includes(permissions?.[label]) &&
      config?.humans?.[label]===id);
    receipt.human[label]=review?{reviewId:review.id,state:review.state,
      reviewedCommit:review.commit_id,accepted:approved[label]}:null;
  }
  if([...latest.values()].some(r=>r.state==='CHANGES_REQUESTED'))
    blockers.push('unresolved CHANGES_REQUESTED GitHub review');

  // This is a separate, pinned App's exact SHA+base semantic overlap proof,
  // checked for all Ready PRs, not an obsolete 72h-240h loophole.
  const overlap=verifyOverlapProof({
    repo,pr,checks,appId:config?.overlapApp,
    providerAppIds:[],cycle,now,
  });
  receipt.overlapAudit=overlap.receipt;
  const quorum=determineReviewAdmission({cycle,human:approved,overlap});
  blockers.push(...quorum.blockers);
  return {
    pass:blockers.length===0,
    advisory_only:true,
    policy:'single-independent-trusted-human-all-ready-ages',
    blockers:[...new Set(blockers)],
    receipt,
  };
}

async function api(path, token) {
  if (!path.startsWith('/') || path.includes('..')) throw Error('unsafe API path');
  const response = await fetch('https://api.github.com' + path, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'atto-parity-review-gate' },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw Error('GitHub API ' + response.status + ' on ' + path.split('?')[0]);
  return response.json();
}

async function pages(path, token) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const join = path.includes('?') ? '&' : '?';
    const response = await api(path + join + 'per_page=100&page=' + page, token);
    const items = Array.isArray(response) ? response : response?.check_runs;
    if (!Array.isArray(items)) throw Error('unexpected paginated GitHub API shape');
    all.push(...items);
    if (items.length < 100) return all;
  }
  throw Error('GitHub pagination cap reached: fail closed');
}

async function collect(repo, number, token) {
  if (!REPO.test(repo) || !/^[1-9][0-9]*$/.test(String(number)))
    throw Error('unallowlisted repo or invalid PR number');
  const base = '/repos/' + repo;
  const [pr, repository, reviews, timeline, users1, users2, perm1, perm2] = await Promise.all([
    api(base + '/pulls/' + number, token),
    api(base, token),
    pages(base + '/pulls/' + number + '/reviews', token),
    pages(base + '/issues/' + number + '/timeline', token),
    api('/users/the1mills', token), api('/users/ORESoftware', token),
    api(base + '/collaborators/the1mills/permission', token),
    api(base + '/collaborators/ORESoftware/permission', token),
  ]);
  if (!SHA.test(pr?.head?.sha || '')) throw Error('invalid live PR SHA');
  const checks = await pages(base + '/commits/' + pr.head.sha + '/check-runs', token);
  // Double-read mutable review and check state, not just the PR's updated_at;
  // GitHub does not guarantee that every review/check mutation changes PR metadata.
  const [latest, freshReviews, freshTimeline, freshChecks] = await Promise.all([
    api(base + '/pulls/' + number, token),
    pages(base + '/pulls/' + number + '/reviews', token),
    pages(base + '/issues/' + number + '/timeline', token),
    pages(base + '/commits/' + pr.head.sha + '/check-runs', token),
  ]);
  if (latest.head?.sha !== pr.head.sha || latest.updated_at !== pr.updated_at ||
      latest.state !== pr.state || latest.draft !== pr.draft ||
      latest.number !== pr.number || latest.user?.id !== pr.user?.id ||
      latest.base?.sha !== pr.base?.sha ||
      latest.base?.repo?.full_name !== pr.base?.repo?.full_name ||
      latest.base?.repo?.id !== pr.base?.repo?.id ||
      JSON.stringify(latest.labels?.map(x => x.name).sort()) !==
        JSON.stringify(pr.labels?.map(x => x.name).sort()))
    throw Error('PR changed during verification; rerun on latest head');
  const reviewDigest = values => JSON.stringify(values.map(x => ({
    id: x?.id, user: x?.user?.id, login: x?.user?.login, type: x?.user?.type, state: x?.state,
    commit: x?.commit_id, submitted: x?.submitted_at,
  })).sort((a, b) => a.id - b.id));
  const checkDigest = values => JSON.stringify(values.map(x => ({
    id: x?.id, name: x?.name, app: x?.app?.id, head: x?.head_sha,
    status: x?.status, conclusion: x?.conclusion,
    completed: x?.completed_at, externalId: x?.external_id, summary: x?.output?.summary,
  })).sort((a, b) => a.id - b.id));
  const timelineDigest = values => JSON.stringify(values.map(x => ({
    id: x?.id, event: x?.event, at: x?.created_at, actor: x?.actor?.id
  })));
  if (timelineDigest(timeline) !== timelineDigest(freshTimeline))
    throw Error('authenticated lifecycle timeline changed during verification; rerun');
  if (reviewDigest(reviews) !== reviewDigest(freshReviews) ||
      checkDigest(checks) !== checkDigest(freshChecks))
    throw Error('review or check changed during verification; rerun');
  // A collaborator can lose write-level authority without changing PR HEAD,
  // its review objects, or the checks. Re-read permissions before admitting.
  const [perm1Fresh, perm2Fresh] = await Promise.all([
    api(base + '/collaborators/the1mills/permission', token),
    api(base + '/collaborators/ORESoftware/permission', token),
  ]);
  if (perm1?.permission !== perm1Fresh?.permission ||
      perm2?.permission !== perm2Fresh?.permission)
    throw Error('trusted reviewer permission changed during verification; rerun');
  return {
    repo, pr, reviews, checks, timeline, now: Date.now(), repoId: repository.id,
    users: { the1mills: users1, ORESoftware: users2 },
    permissions: { the1mills: perm1?.permission, ORESoftware: perm2?.permission },
    expectedHead: pr.head.sha,
  };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length !== 2) throw Error('usage: node scripts/review-gate.cjs atto-lang/atto-source.<backend> <pr-number>');
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) throw Error('GITHUB_TOKEN/GH_TOKEN not configured');
  const config = configFromEnv(env);
  if (!Object.values(config.humans).every(numericId) || !numericId(config.overlapApp))
    throw Error('trusted owner or independent overlap-audit App ID missing; fail closed');
  const evidence = await collect(argv[0], argv[1], token);
  const result = evaluate(evidence, config);
  console.log(JSON.stringify({ repo: argv[0], pr: Number(argv[1]), ...result }, null, 2));
  if (!result.pass) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  console.error('REVIEW GATE BLOCKED: ' + error.message);
  process.exitCode = 1;
});

module.exports = { numericId, configFromEnv, evaluate, collect, pages, CHECK_NAMES, TRUSTED_HUMAN_IDS };
