'use strict';

// Read-only clock: callers must supply the COMPLETE authenticated GitHub
// issues/:number/timeline response, never PR body text or author labels.
const HOUR = 60 * 60 * 1000;
const HOLD_LABELS = new Set(['keep-as-draft', 'keep-draft', 'not-ready', 'hold', 'security-hold']);
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
function millis(value) {
  if (typeof value !== 'string' || !UTC.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}
function resolveCycle(pr, timeline, now = Date.now()) {
  const blockers = [];
  const created = millis(pr?.created_at);
  if (created === null) blockers.push('missing/invalid authenticated PR created_at');
  if (!Number.isSafeInteger(now) || (created !== null && now < created))
    blockers.push('invalid evaluation time');
  if (typeof pr?.draft !== 'boolean') blockers.push('missing current Draft flag');
  if (!Array.isArray(timeline)) blockers.push('complete GitHub lifecycle timeline unavailable');
  if (!Array.isArray(pr?.labels)) blockers.push('fresh GitHub PR labels unavailable');
  const holds = Array.isArray(pr?.labels) ? pr.labels.map(x => x?.name)
    .filter(x => typeof x === 'string' && HOLD_LABELS.has(x.trim().toLowerCase())) : [];
  if (holds.length) blockers.push('hold label prohibits ready or merge: ' + holds.join(', '));

  const changes = Array.isArray(timeline) ? timeline.filter(x =>
    x?.event === 'ready_for_review' || x?.event === 'converted_to_draft') : [];
  // First ready_for_review implies opened Draft; first converted_to_draft
  // implies opened Ready. No transitions means unchanged initial state.
  let state = changes.length ?
    (changes[0].event === 'ready_for_review' ? 'draft' : 'ready') :
    (pr?.draft === true ? 'draft' : 'ready');
  let start = created;
  let startEventId = null;
  let previousTime = created;
  const seen = new Set();
  for (const change of changes) {
    const at = millis(change.created_at);
    const id = change.id;
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id))
      blockers.push('missing/duplicate authenticated lifecycle event ID');
    seen.add(id);
    if (at === null || created === null || at < created ||
        (previousTime !== null && at < previousTime) || at > now) {
      blockers.push('invalid/out-of-order lifecycle transition timestamp');
      continue;
    }
    if (!Number.isSafeInteger(change.actor?.id) || change.actor.id <= 0)
      blockers.push('lifecycle transition missing authenticated actor');
    if (change.event === 'ready_for_review' && state === 'draft') state = 'ready';
    else if (change.event === 'converted_to_draft' && state === 'ready') state = 'draft';
    else blockers.push('contradictory Draft/Ready transition history');
    start = at;
    startEventId = id;
    previousTime = at;
  }
  if (typeof pr?.draft === 'boolean' && (state === 'draft') !== pr.draft)
    blockers.push('current Draft flag disagrees with authenticated lifecycle history');
  if (start === null || start > now) blockers.push('cycle start unknown or in future');
  const ageMs = start === null ? null : now - start;
  const window = state === 'draft' ? 'draft' : ageMs === null ? 'unknown' :
    ageMs < 72 * HOUR ? 'early' : ageMs < 240 * HOUR ? 'fast' : 'renewal';
  return {
    ok: blockers.length === 0,
    blockers: [...new Set(blockers)],
    state,
    window,
    cycleStart: start === null ? null : new Date(start).toISOString(),
    eventId: startEventId,
    ageHours: ageMs === null ? null : ageMs / HOUR,
    minReviewAt: start === null ? null :
      new Date(start + (window === 'renewal' ? 240 * HOUR : 0)).toISOString(),
  };
}
module.exports = { HOUR, resolveCycle };
