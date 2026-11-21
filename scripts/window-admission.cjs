'use strict';
// This selects the applicable review quorum only. Callers MUST also enforce
// every independent CI, security, CODEOWNERS, conflict and GitHub rule gate.
function determineReviewAdmission({ cycle, human, ai, extraHuman, overlap }) {
  const blockers = [];
  if (cycle?.ok !== true || cycle?.state !== 'ready')
    blockers.push('authenticated Ready lifecycle required');
  if (cycle?.window === 'early' || cycle?.window === 'renewal') {
    for (const label of ['the1mills', 'ORESoftware'])
      if (human?.[label] !== true) blockers.push(label + ': no eligible in-cycle exact-head approval');
    for (const family of ['openai', 'anthropic'])
      if (ai?.[family] !== true) blockers.push(family + ': no independently verified in-cycle exact-head approval');
  } else if (cycle?.window === 'fast') {
    const anyHuman = extraHuman === true || Object.values(human || {}).some(Boolean);
    const anyAi = Object.values(ai || {}).some(Boolean);
    if (!anyHuman && !anyAi)
      blockers.push('fast lane requires one independently eligible exact-head approval');
    if (overlap?.pass !== true) blockers.push('fast-lane competing-PR audit not independently verified');
  } else blockers.push('unknown review window');
  return { pass: blockers.length === 0, blockers };
}
module.exports = { determineReviewAdmission };
