'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HOUR, resolveCycle } = require('../scripts/ready-cycle.cjs');
const base = Date.parse('2026-11-01T00:00:00Z');
const when = h => new Date(base + h * HOUR).toISOString();
const ev = (id, event, h) => ({ id, event, created_at: when(h), actor: { id: 2148448 } });
const pr = (draft = false) => ({ draft, created_at: when(0), labels: [] });
const assertBlocked = (result, part) => {
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some(x => x.includes(part)), JSON.stringify(result.blockers));
};
test('opened Ready: exact 72 and 240 hour boundaries', () => {
  assert.equal(resolveCycle(pr(), [], base + 72 * HOUR - 1).window, 'early');
  assert.equal(resolveCycle(pr(), [], base + 72 * HOUR).window, 'fast');
  assert.equal(resolveCycle(pr(), [], base + 240 * HOUR - 1).window, 'fast');
  const renewed = resolveCycle(pr(), [], base + 240 * HOUR);
  assert.equal(renewed.window, 'renewal');
  assert.equal(renewed.minReviewAt, when(240));
});
test('original Draft clock starts at PR created_at', () => {
  const state = resolveCycle(pr(true), [], base + 100 * HOUR);
  assert.equal(state.window, 'draft');
  assert.equal(state.ageHours, 100);
});
test('draft to Ready begins fresh review age and pins event ID', () => {
  const state = resolveCycle(pr(false), [ev(45, 'ready_for_review', 95)], base + 96 * HOUR);
  assert.equal(state.window, 'early');
  assert.equal(state.ageHours, 1);
  assert.equal(state.eventId, 45);
  assert.equal(state.minReviewAt, when(95));
});
test('Ready to Draft resets the separate Draft age', () => {
  const state = resolveCycle(pr(true), [ev(1, 'converted_to_draft', 70)], base + 150 * HOUR);
  assert.equal(state.window, 'draft');
  assert.equal(state.ageHours, 80);
});
test('Ready-Draft-Ready never inherits an earlier Ready window', () => {
  const state = resolveCycle(pr(false), [ev(1, 'converted_to_draft', 90), ev(2, 'ready_for_review', 245)], base + 246 * HOUR);
  assert.equal(state.window, 'early');
  assert.equal(state.ageHours, 1);
  assert.equal(state.eventId, 2);
});
test('reject missing timeline, labels, current Draft flag, or created_at', () => {
  assertBlocked(resolveCycle(pr(), null, base + HOUR), 'timeline');
  assertBlocked(resolveCycle({ ...pr(), labels: null }, [], base + HOUR), 'labels');
  assertBlocked(resolveCycle({ ...pr(), draft: undefined }, [], base + HOUR), 'Draft flag');
  assertBlocked(resolveCycle({ ...pr(), created_at: null }, [], base + HOUR), 'created_at');
});
test('reject explicit hold labels regardless of case', () => {
  for (const name of ['keep-as-draft', 'keep-draft', 'not-ready', 'HOLD', 'Security-Hold']) {
    assertBlocked(resolveCycle({ ...pr(), labels: [{ name }] }, [], base + HOUR), 'hold label');
  }
});
test('fail closed on contradictory live Draft state and transition order', () => {
  assertBlocked(resolveCycle(pr(true), [ev(1, 'ready_for_review', 2)], base + 3 * HOUR), 'disagrees');
  assertBlocked(resolveCycle(pr(false), [ev(1, 'converted_to_draft', 2)], base + 3 * HOUR), 'disagrees');
  assertBlocked(resolveCycle(pr(false), [ev(1, 'ready_for_review', 2), ev(2, 'ready_for_review', 3)], base + 4 * HOUR), 'contradictory');
});
test('reject duplicate IDs, timestamps out of order and unauthenticated actors', () => {
  assertBlocked(resolveCycle(pr(false), [ev(1, 'converted_to_draft', 2), ev(1, 'ready_for_review', 3)], base + 4 * HOUR), 'duplicate');
  assertBlocked(resolveCycle(pr(false), [ev(1, 'converted_to_draft', 3), ev(2, 'ready_for_review', 2)], base + 4 * HOUR), 'out-of-order');
  const bad = ev(1, 'ready_for_review', 3); bad.actor = null;
  assertBlocked(resolveCycle(pr(false), [bad], base + 4 * HOUR), 'actor');
});
test('cannot accept future events or malformed UTC timestamps', () => {
  assertBlocked(resolveCycle(pr(false), [ev(1, 'ready_for_review', 3)], base + 2 * HOUR), 'timestamp');
  assertBlocked(resolveCycle({ ...pr(), created_at: 'yesterday' }, [], base + HOUR), 'created_at');
});
