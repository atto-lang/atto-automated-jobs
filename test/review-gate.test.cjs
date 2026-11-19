'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, numericId, configFromEnv } = require('../scripts/review-gate.cjs');

const head = 'a'.repeat(40);
const repo = 'atto-lang/atto-source.rs';
const config = {
  humans: { the1mills: 2148448, ORESoftware: 1234567 },
  apps: { openai: 998801, anthropic: 998802 },
};
const review = (id, userId, state = 'APPROVED', sha = head) => ({
  id, user: { id: userId, type: 'User' }, state, commit_id: sha,
  submitted_at: '2026-11-18T00:00:00Z',
});
const check = (id, name, appId, conclusion = 'success', sha = head) => ({
  id, name, app: { id: appId }, head_sha: sha,
  status: 'completed', conclusion,
});
function fixture() {
  return {
    repo,
    repoId: 42,
    expectedHead: head,
    pr: {
      state: 'open', draft: false, head: { sha: head },
      base: { repo: { full_name: repo, id: 42 } },
      user: { id: 5555 },
    },
    users: {
      the1mills: { id: config.humans.the1mills, login: 'the1mills' },
      ORESoftware: { id: config.humans.ORESoftware, login: 'ORESoftware' },
    },
    reviews: [
      review(1, config.humans.the1mills),
      review(2, config.humans.ORESoftware),
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
});
