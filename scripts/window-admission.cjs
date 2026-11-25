'use strict';

// Read-only advisory policy: exactly one independently verified, eligible
// APPROVED GitHub review from EITHER designated human at ANY Ready age.
// This cannot authorize a merge. Actual CODEOWNERS, protections, material CI,
// holds, security and conflicts remain independently mandatory.
function determineReviewAdmission({ cycle, human, overlap }) {
  const blockers = [];
  if (cycle?.ok !== true || cycle?.state !== 'ready' ||
      !['early', 'fast', 'renewal'].includes(cycle?.window)) {
    blockers.push('authenticated Ready lifecycle required');
  }
  if (human?.the1mills !== true && human?.ORESoftware !== true) {
    blockers.push('one independent the1mills OR ORESoftware approval missing');
  }
  // Full semantic and legacy migration-map overlap discovery applies before
  // EVERY merge, not merely between 72h and 240h. This proof is additional
  // to the actual scan: it must be emitted by a separate pinned trusted App.
  if (overlap?.pass !== true) {
    blockers.push('competing-PR audit not independently verified');
  }
  return { pass: blockers.length === 0, blockers,
    policy: 'single-independent-trusted-human-all-ready-ages' };
}
module.exports = { determineReviewAdmission };
