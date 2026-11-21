'use strict';

// This is a verifier of a separately installed, trusted audit producer,
// NOT the semantic PR scanner itself. Never trust a PR body or check name.
const OID = /^[0-9a-f]{40}$/;
const SCOPE = ['ready-and-draft-prs', 'related-repositories', 'legacy-migration-map', 'changed-apis-and-symbols'];
const DISPOSITIONS = new Set(['incorporated', 'updated', 'superseded', 'independent']);

function verifyOverlapProof({ repo, pr, checks, appId, providerAppIds, cycle, now }) {
  const errors = [];
  const sha = pr?.head?.sha;
  const base = pr?.base?.sha;
  const expected = 'atto-overlap:v1:' + repo + ':' + pr?.number + ':' + base + ':' + sha;
  if (cycle?.window !== 'fast' || cycle?.ok !== true || cycle?.state !== 'ready')
    errors.push('not an authenticated Ready fast-lane cycle');
  if (!OID.test(sha || '') || !OID.test(base || '') ||
      !Number.isSafeInteger(pr?.number) || pr.number <= 0)
    errors.push('missing exact PR/head/base identity');
  if (!Number.isSafeInteger(appId) || appId <= 0 ||
      (Array.isArray(providerAppIds) && providerAppIds.includes(appId)))
    errors.push('untrusted or nonindependent overlap-audit App');
  const matching = Array.isArray(checks) ? checks.filter(x => x?.name === 'atto-review/overlap-audit') : [];
  if (!Array.isArray(checks)) errors.push('check runs unavailable');
  if (matching.some(x => !Number.isSafeInteger(x.id) || x.id <= 0 ||
      x.app?.id !== appId || x.head_sha !== sha || x.external_id !== expected))
    errors.push('spoofed/misbinding overlap-audit check');
  const candidate = matching.reduce((a, b) => !a || b.id > a.id ? b : a, null);
  if (!candidate || candidate.status !== 'completed' || candidate.conclusion !== 'success')
    errors.push('missing successful trusted overlap audit');
  const finished = Date.parse(candidate?.completed_at || '');
  const started = Date.parse(cycle?.cycleStart || '');
  if (!Number.isFinite(finished) || !Number.isFinite(started) ||
      !Number.isSafeInteger(now) || finished < started || finished > now)
    errors.push('stale or future overlap audit');
  let receipt = null;
  try { receipt = JSON.parse(candidate?.output?.summary || 'null'); } catch { /* fail closed */ }
  if (!receipt || receipt.schema !== 'atto.overlap-audit.v1' ||
      receipt.repo !== repo || receipt.pr !== pr?.number ||
      receipt.head !== sha || receipt.base !== base ||
      receipt.scan_complete !== true || receipt.unresolved !== 0 ||
      !Array.isArray(receipt.scope) || SCOPE.some(x => !receipt.scope.includes(x)) ||
      !Array.isArray(receipt.candidates) || receipt.candidates.some(x =>
        typeof x?.url !== 'string' || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*$/.test(x.url) ||
        !OID.test(x.head || '') || !DISPOSITIONS.has(x.disposition) ||
        typeof x.rationale !== 'string' || !x.rationale.trim()))
    errors.push('incomplete or unbound overlap audit manifest');
  return { pass: errors.length === 0, blockers: errors, receipt: errors.length ? null : receipt };
}
module.exports = { verifyOverlapProof };
