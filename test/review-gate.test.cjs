'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, numericId, configFromEnv, collect, pages } = require('../scripts/review-gate.cjs');

const head = 'a'.repeat(40);
const snapshotNow = Date.parse('2026-11-18T12:00:00Z');
const repo = 'atto-lang/atto-source.rs';
const config = {
  humans: { the1mills: 2148448, ORESoftware: 1234567 },
  apps: { openai: 998801, anthropic: 998802 },
  aiReviewers: { openai: 887701, anthropic: 887702 },
  overlapApp: 777001,
};
const review = (id, userId, state = 'APPROVED', sha = head, type = 'User') => ({
  id, user: { id: userId, type,
    login: userId === 2148448 ? 'the1mills' : userId === 1234567 ? 'ORESoftware' :
      (type === 'Bot' ? 'bot-' + id : 'reviewer-' + userId) }, state, commit_id: sha,
  submitted_at: '2026-11-18T00:00:00Z',
});
const check = (id, name, appId, conclusion = 'success', sha = head) => ({
  id, name, app: { id: appId }, head_sha: sha,
  status: 'completed', conclusion, completed_at: '2026-11-18T00:30:00Z',
});
function fixture() {
  return {
    repo,
    repoId: 42,
    expectedHead: head,
    now: snapshotNow,
    timeline: [],
    pr: {
      state: 'open', draft: false, created_at: '2026-11-17T12:00:00Z', labels: [], head: { sha: head },
      base: { repo: { full_name: repo, id: 42 } },
      user: { id: 5555 },
    },
    users: {
      the1mills: { id: config.humans.the1mills, login: 'the1mills' },
      ORESoftware: { id: config.humans.ORESoftware, login: 'ORESoftware' },
    },
    permissions: { the1mills: 'admin', ORESoftware: 'admin' },
    reviews: [
      review(1, config.humans.the1mills),
      review(2, config.humans.ORESoftware),
      review(3, config.aiReviewers.openai, 'APPROVED', head, 'Bot'),
      review(4, config.aiReviewers.anthropic, 'APPROVED', head, 'Bot'),
    ],
    checks: [
      check(20, 'atto-review/openai', config.apps.openai),
      check(21, 'atto-review/anthropic', config.apps.anthropic),
    ],
  };
}
function verdict(evidence, policy = config) { return evaluate(evidence, policy); }
function denied(evidence, label, policy = config) {
  const actual = verdict(evidence, policy);
  assert.equal(actual.pass, false, JSON.stringify(actual));
  assert.ok(actual.blockers.some(x => x.includes(label)), actual.blockers.join('; '));
}

test('four independent exact-head reviews pass, with recorded receipts', () => {
  const output = verdict(fixture());
  assert.equal(output.pass, true, output.blockers.join('; '));
  assert.equal(output.receipt.human.the1mills.reviewId, 1);
  assert.equal(output.receipt.ai.anthropic.appId, config.apps.anthropic);
  assert.equal(output.receipt.aiReview.openai.botId, config.aiReviewers.openai);
});
test('a requested reviewer or COMMENTED review does not satisfy human approval', () => {
  const f = fixture(); f.reviews[1].state = 'COMMENTED'; denied(f, 'ORESoftware');
});
test('later CHANGES_REQUESTED overrides an older APPROVED review', () => {
  const f = fixture(); f.reviews.push(review(5, config.humans.the1mills, 'CHANGES_REQUESTED'));
  denied(f, 'the1mills');
});
test('later APPROVED can restore a previously rejected review at same head', () => {
  const f = fixture(); f.reviews.push(review(5, config.humans.the1mills, 'CHANGES_REQUESTED'));
  f.reviews.push(review(6, config.humans.the1mills)); assert.equal(verdict(f).pass, true);
});
test('unresolved CHANGES_REQUESTED by a third user blocks', () => {
  const f = fixture(); f.reviews.push(review(7, 909090, 'CHANGES_REQUESTED'));
  denied(f, 'unresolved CHANGES_REQUESTED');
});
test('DISMISSED approvals are invalid', () => {
  const f = fixture(); f.reviews[0].state = 'DISMISSED'; denied(f, 'the1mills');
});
test('stale human review SHA is rejected', () => {
  const f = fixture(); f.reviews[0].commit_id = 'b'.repeat(40); denied(f, 'the1mills');
});
test('author of either required human identity cannot self-approve', () => {
  const f = fixture(); f.pr.user.id = config.humans.ORESoftware; denied(f, 'self-approve');
});
test('the same human ID cannot occupy two approval slots', () => {
  const f = fixture(); const policy = structuredClone(config);
  policy.humans.ORESoftware = policy.humans.the1mills;
  denied(f, 'distinct', policy);
});
test('model names in comments cannot satisfy a missing AI provider check', () => {
  const f = fixture(); f.checks = f.checks.filter(x => x.name !== 'atto-review/anthropic');
  f.reviews.push({ ...review(9, 9898), body: 'Claude/Anthropic approved' });
  denied(f, 'anthropic');
});
test('same GitHub App cannot represent both provider slots', () => {
  const f = fixture(); const policy = structuredClone(config);
  policy.apps.anthropic = policy.apps.openai;
  denied(f, 'distinct', policy);
});
test('spoofed status name from wrong App blocks even alongside genuine success', () => {
  const f = fixture(); f.checks.push(check(40, 'atto-review/openai', 111111));
  denied(f, 'spoofed');
});
test('only current exact SHA check runs qualify', () => {
  const f = fixture(); f.checks[0].head_sha = 'b'.repeat(40); denied(f, 'openai');
});
test('latest failing AI run overrides older successful run', () => {
  const f = fixture();
  f.checks.push(check(45, 'atto-review/openai', config.apps.openai, 'failure'));
  denied(f, 'openai');
});
test('started or skipped AI check cannot count', () => {
  const f = fixture(); f.checks[1].status = 'in_progress'; denied(f, 'anthropic');
});
test('PR commit moving while verifier runs blocks', () => {
  const f = fixture(); f.expectedHead = 'b'.repeat(40); denied(f, 'changed');
});
test('draft PRs remain blocked', () => {
  const f = fixture(); f.pr.draft = true; denied(f, 'draft');
});
test('closed PRs remain blocked', () => {
  const f = fixture(); f.pr.state = 'closed'; denied(f, 'not open');
});
test('wrong base repository identity is not accepted', () => {
  const f = fixture(); f.pr.base.repo.id = 4444; denied(f, 'identity mismatch');
});
test('unknown repository is not accepted even with valid approvals', () => {
  const f = fixture(); f.repo = 'someone/atto-source.rs'; denied(f, 'unallowlisted');
});
test('renamed or reassigned human GitHub login fails pinned identity', () => {
  const f = fixture(); f.users.the1mills.id = 8888; denied(f, 'pinned identity');
});
test('missing provider App pin blocks', () => {
  const f = fixture(); const policy = structuredClone(config);
  policy.apps.anthropic = null; denied(f, 'distinct', policy);
});
test('ID parser rejects ambiguous, huge, negative, and fractional IDs', () => {
  for (const x of ['', '0', '-1', '1.5', '12x', '9007199254740993', 0, null]) {
    assert.equal(numericId(x), null, String(x));
  }
  assert.equal(numericId('2148448'), 2148448);
});
test('missing configuration fails closed', () => {
  const c = configFromEnv({});
  assert.equal(c.humans.the1mills, 2148448);
  assert.equal(c.humans.ORESoftware, null);
  assert.equal(c.apps.openai, null);
  assert.equal(c.apps.anthropic, null);
  assert.equal(c.aiReviewers.openai, null);
  assert.equal(c.aiReviewers.anthropic, null);
});

test('provider status without a formal submitted AI APPROVED review blocks', () => {
  const f = fixture(); f.reviews = f.reviews.filter(x => x.user.id !== config.aiReviewers.openai);
  denied(f, 'openai: no formal APPROVED');
});
test('AI COMMENTED review is not an approval', () => {
  const f = fixture();
  f.reviews.find(x => x.user.id === config.aiReviewers.anthropic).state = 'COMMENTED';
  denied(f, 'anthropic: no formal APPROVED');
});
test('a human account cannot impersonate a trusted AI bot reviewer', () => {
  const f = fixture();
  f.reviews.find(x => x.user.id === config.aiReviewers.openai).user.type = 'User';
  denied(f, 'openai: no formal APPROVED');
});
test('two AI providers cannot reuse one reviewer account ID', () => {
  const f = fixture(); const policy = structuredClone(config);
  policy.aiReviewers.anthropic = policy.aiReviewers.openai;
  denied(f, 'four GitHub review identities', policy);
});
test('AI approval from earlier SHA is stale even when its provider check passes', () => {
  const f = fixture();
  f.reviews.find(x => x.user.id === config.aiReviewers.anthropic).commit_id = 'b'.repeat(40);
  denied(f, 'anthropic: no formal APPROVED');
});
test('AI bot PR author cannot approve its own PR', () => {
  const f = fixture(); f.pr.user.id = config.aiReviewers.openai;
  denied(f, 'openai: PR author');
});
test('a later AI CHANGES_REQUESTED overrides earlier AI APPROVED', () => {
  const f = fixture();
  f.reviews.push(review(12, config.aiReviewers.anthropic, 'CHANGES_REQUESTED', head, 'Bot'));
  denied(f, 'anthropic: no formal APPROVED');
});

test('human read-only collaborators do not satisfy eligible approval requirements', () => {
  const f = fixture(); f.permissions.ORESoftware = 'read';
  denied(f, 'eligible write-level');
});
test('missing collaborator permission proof fails closed', () => {
  const f = fixture(); delete f.permissions.the1mills;
  denied(f, 'eligible write-level');
});
test('unknown GitHub review state fails closed rather than silently ignored', () => {
  const f = fixture(); f.reviews.push(review(40, 777888, 'FUTURE_UNDOCUMENTED'));
  denied(f, 'unknown GitHub review state');
});

test('collector walks authenticated PR, reviews, provider checks and permission evidence', async () => {
  const f = fixture(); f.pr.updated_at = '2026-11-18T12:00:00Z';
  const prefix = '/repos/' + repo;
  const entries = {
    [prefix + '/pulls/77']: f.pr,
    [prefix]: { id: 42 },
    [prefix + '/pulls/77/reviews?per_page=100&page=1']: f.reviews,
    [prefix + '/issues/77/timeline?per_page=100&page=1']: f.timeline,
    [prefix + '/commits/' + head + '/check-runs?per_page=100&page=1']: { check_runs: f.checks },
    '/users/the1mills': f.users.the1mills,
    '/users/ORESoftware': f.users.ORESoftware,
    [prefix + '/collaborators/the1mills/permission']: { permission: 'admin' },
    [prefix + '/collaborators/ORESoftware/permission']: { permission: 'admin' },
  };
  const original = global.fetch;
  const visited = [];
  global.fetch = async url => {
    const path = new URL(url).pathname + new URL(url).search;
    visited.push(path);
    assert.ok(Object.hasOwn(entries, path), 'unexpected API path: ' + path);
    return { ok: true, json: async () => entries[path] };
  };
  try {
    const evidence = await collect(repo, 77, 'test-token');
    assert.equal(evidence.repoId, 42);
    assert.equal(verdict(evidence).pass, true);
    assert.ok(visited.length >= 9);
  } finally {
    global.fetch = original;
  }
});
test('collector detects PR changing during evidence collection', async () => {
  const f = fixture(); f.pr.updated_at = 'v1';
  const original = global.fetch;
  let prReads = 0;
  global.fetch = async url => {
    const path = new URL(url).pathname + new URL(url).search;
    if (path.endsWith('/pulls/8')) {
      prReads++;
      return { ok: true, json: async () => ({ ...f.pr, updated_at: prReads === 1 ? 'v1' : 'v2' }) };
    }
    if (path.endsWith('/timeline?per_page=100&page=1')) return { ok: true, json: async () => f.timeline };
    if (path.endsWith('/reviews?per_page=100&page=1')) return { ok: true, json: async () => f.reviews };
    if (path.endsWith('/check-runs?per_page=100&page=1'))
      return { ok: true, json: async () => ({ check_runs: f.checks }) };
    if (path.endsWith('/collaborators/the1mills/permission') ||
        path.endsWith('/collaborators/ORESoftware/permission'))
      return { ok: true, json: async () => ({ permission: 'admin' }) };
    if (path === '/users/the1mills') return { ok: true, json: async () => f.users.the1mills };
    if (path === '/users/ORESoftware') return { ok: true, json: async () => f.users.ORESoftware };
    if (path === '/repos/' + repo) return { ok: true, json: async () => ({ id: 42 }) };
    throw Error('unexpected API path ' + path);
  };
  try {
    await assert.rejects(() => collect(repo, 8, 'test-token'), /changed during verification/);
  } finally {
    global.fetch = original;
  }
});
test('pagination reads an additional page rather than silently truncating 100 entries', async () => {
  const original = global.fetch;
  const paths = [];
  global.fetch = async url => {
    paths.push(url);
    const page = Number(new URL(url).searchParams.get('page'));
    return { ok: true, json: async () => page === 1 ? Array(100).fill({ id: 1 }) : [{ id: 2 }] };
  };
  try {
    const result = await pages('/repos/' + repo + '/pulls/9/reviews', 'test-token');
    assert.equal(result.length, 101);
    assert.equal(paths.length, 2);
  } finally {
    global.fetch = original;
  }
});
test('GitHub pagination cap fails closed instead of treating incomplete review history as complete', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => Array(100).fill({ id: 1 }) });
  try {
    await assert.rejects(() => pages('/repos/' + repo + '/pulls/9/reviews', 'test-token'), /pagination cap/);
  } finally {
    global.fetch = original;
  }
});

test('collector rejects review mutations that do not update PR metadata', async () => {
  const f = fixture(); f.pr.updated_at = 'unchanged';
  const original = global.fetch;
  let reviewReads = 0;
  global.fetch = async url => {
    const path = new URL(url).pathname + new URL(url).search;
    if (path.endsWith('/pulls/81')) return { ok: true, json: async () => f.pr };
    if (path.endsWith('/timeline?per_page=100&page=1')) return { ok: true, json: async () => f.timeline };
    if (path.endsWith('/reviews?per_page=100&page=1')) {
      reviewReads++;
      const rows = reviewReads === 1 ? f.reviews :
        [...f.reviews, review(12, config.aiReviewers.anthropic, 'CHANGES_REQUESTED', head, 'Bot')];
      return { ok: true, json: async () => rows };
    }
    if (path.endsWith('/check-runs?per_page=100&page=1'))
      return { ok: true, json: async () => ({ check_runs: f.checks }) };
    if (path.endsWith('/collaborators/the1mills/permission') ||
        path.endsWith('/collaborators/ORESoftware/permission'))
      return { ok: true, json: async () => ({ permission: 'admin' }) };
    if (path === '/users/the1mills') return { ok: true, json: async () => f.users.the1mills };
    if (path === '/users/ORESoftware') return { ok: true, json: async () => f.users.ORESoftware };
    if (path === '/repos/' + repo) return { ok: true, json: async () => ({ id: 42 }) };
    throw Error('unexpected API path ' + path);
  };
  try {
    await assert.rejects(() => collect(repo, 81, 'test-token'), /review or AI check changed/);
  } finally {
    global.fetch = original;
  }
});
test('collector rejects AI check conclusion changing mid-read', async () => {
  const f = fixture(); f.pr.updated_at = 'unchanged';
  const original = global.fetch;
  let checkReads = 0;
  global.fetch = async url => {
    const path = new URL(url).pathname + new URL(url).search;
    if (path.endsWith('/pulls/82')) return { ok: true, json: async () => f.pr };
    if (path.endsWith('/timeline?per_page=100&page=1')) return { ok: true, json: async () => f.timeline };
    if (path.endsWith('/reviews?per_page=100&page=1'))
      return { ok: true, json: async () => f.reviews };
    if (path.endsWith('/check-runs?per_page=100&page=1')) {
      checkReads++;
      const rows = structuredClone(f.checks);
      if (checkReads > 1) rows[0].conclusion = 'failure';
      return { ok: true, json: async () => ({ check_runs: rows }) };
    }
    if (path.endsWith('/collaborators/the1mills/permission') ||
        path.endsWith('/collaborators/ORESoftware/permission'))
      return { ok: true, json: async () => ({ permission: 'admin' }) };
    if (path === '/users/the1mills') return { ok: true, json: async () => f.users.the1mills };
    if (path === '/users/ORESoftware') return { ok: true, json: async () => f.users.ORESoftware };
    if (path === '/repos/' + repo) return { ok: true, json: async () => ({ id: 42 }) };
    throw Error('unexpected API path ' + path);
  };
  try {
    await assert.rejects(() => collect(repo, 82, 'test-token'), /review or AI check changed/);
  } finally {
    global.fetch = original;
  }
});

test('Ready cycle reset invalidates same-SHA earlier approvals', () => {
  const f = fixture();
  f.timeline = [{ id: 19, event: 'ready_for_review', created_at: '2026-11-18T06:00:00Z', actor: { id: 2148448 } }];
  const x = verdict(f);
  assert.equal(x.pass, false);
  assert.ok(x.blockers.some(z => z.includes('exact head')), x.blockers.join('; '));
});
test('ten-day renewal rejects old current-SHA four-party approvals', () => {
  const f = fixture();
  f.now = Date.parse('2026-11-28T12:00:00Z');
  const x = verdict(f);
  assert.equal(x.receipt.readyCycle.window, 'renewal');
  assert.equal(x.pass, false);
});
test('fast lane is blocked until an authenticated overlap audit is integrated', () => {
  const f = fixture();
  f.now = Date.parse('2026-11-21T12:00:00Z');
  denied(f, 'fast-lane competing-PR audit');
});
test('hold labels fail closed even with all four fresh approvals', () => {
  const f = fixture(); f.pr.labels = [{ name: 'KEEP-AS-DRAFT' }];
  denied(f, 'hold label');
});


function withFastAudit(f) {
  f.now = Date.parse('2026-11-21T12:00:00Z');
  f.pr.number = 42;
  f.pr.base.sha = 'b'.repeat(40);
  const manifest = {
    schema: 'atto.overlap-audit.v1', repo, pr: 42,
    base: f.pr.base.sha, head, scan_complete: true, unresolved: 0,
    scope: ['ready-and-draft-prs', 'related-repositories', 'legacy-migration-map', 'changed-apis-and-symbols'],
    candidates: []
  };
  f.checks.push({
    id: 91, name: 'atto-review/overlap-audit',
    app: { id: 777001 }, head_sha: head,
    external_id: 'atto-overlap:v1:' + repo + ':42:' + f.pr.base.sha + ':' + head,
    status: 'completed', conclusion: 'success',
    completed_at: '2026-11-20T00:00:00Z',
    output: { summary: JSON.stringify(manifest) }
  });
  return f;
}
test('fast lane accepts exactly one eligible named human after trusted completed overlap audit', () => {
  const f = withFastAudit(fixture());
  f.reviews = f.reviews.filter(x => x.user.id === config.humans.ORESoftware);
  f.checks = f.checks.filter(x => x.name === 'atto-review/overlap-audit');
  assert.equal(verdict(f).pass, true, JSON.stringify(verdict(f).blockers));
});
test('fast lane allows one verified AI family with genuine review and provider check', () => {
  const f = withFastAudit(fixture());
  f.reviews = f.reviews.filter(x => x.user.id === config.aiReviewers.anthropic);
  f.checks = f.checks.filter(x => x.name !== 'atto-review/openai');
  assert.equal(verdict(f).pass, true, JSON.stringify(verdict(f).blockers));
});
test('fast lane never counts PR author approval; other independent reviewer can qualify', () => {
  const f = withFastAudit(fixture());
  f.pr.user.id = config.humans.the1mills;
  f.reviews = f.reviews.filter(x => x.user.id === config.humans.ORESoftware);
  f.checks = f.checks.filter(x => x.name === 'atto-review/overlap-audit');
  assert.equal(verdict(f).pass, true, JSON.stringify(verdict(f).blockers));
});
test('fast lane rejects one stale named human review even with trusted overlap audit', () => {
  const f = withFastAudit(fixture());
  f.reviews = f.reviews.filter(x => x.user.id === config.humans.ORESoftware);
  f.reviews[0].submitted_at = '2026-11-16T00:00:00Z';
  f.checks = f.checks.filter(x => x.name === 'atto-review/overlap-audit');
  denied(f, 'one independently eligible');
});
test('fast lane counts third reviewer only with verified current write permission', () => {
  const f = withFastAudit(fixture());
  f.reviews = [review(99, 994433, 'APPROVED', head, 'User')];
  f.reviews[0].user.login = 'third-reviewer';
  f.extraHumanPermissions = { 994433: { login: 'third-reviewer', permission: 'write' } };
  f.checks = f.checks.filter(x => x.name === 'atto-review/overlap-audit');
  assert.equal(verdict(f).pass, true, JSON.stringify(verdict(f).blockers));
  f.extraHumanPermissions[994433].permission = 'read';
  denied(f, 'one independently eligible');
});
test('fast lane rejects forged overlap App', () => {
  const f = withFastAudit(fixture());
  f.checks.find(x => x.name === 'atto-review/overlap-audit').app.id = 999888;
  denied(f, 'fast-lane competing-PR audit');
});
test('fast lane rejects unresolved semantic overlap', () => {
  const f = withFastAudit(fixture());
  const audit = f.checks.find(x => x.name === 'atto-review/overlap-audit');
  const data = JSON.parse(audit.output.summary);
  data.unresolved = 1;
  audit.output.summary = JSON.stringify(data);
  denied(f, 'fast-lane competing-PR audit');
});
test('renewal never reuses one-reviewer fast-lane proof', () => {
  const f = withFastAudit(fixture());
  f.now = Date.parse('2026-12-01T12:00:00Z');
  f.reviews = f.reviews.filter(x => x.user.id === config.humans.ORESoftware);
  denied(f, 'the1mills');
});
