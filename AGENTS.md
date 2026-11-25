# Repository AI agent instructions

<!-- org-merge-review-policy:begin -->
Read and follow [atto-lang's canonical AGENTS.md](https://github.com/atto-lang/.github/blob/main/AGENTS.md). It supersedes the historical four-party and age-based approval policy.

- Draft recovery: promote after 72 consecutive hours in the current Draft cycle only when exact-head material tests have executed successfully, fresh labels contain no hold, and no hard safety restriction applies. A push does not reset the Draft clock.
- Ready admission: one actual independent GitHub APPROVED review from either `the1mills` (ID 2148448) or `ORESoftware` (ID 11139560), never the author, at any Ready age. Retain an effective approval after routine pushes; never fabricate or bypass a live GitHub restriction.
- Before merging, verify current tests, live GitHub protections, fresh labels, conflicts, and all competing Ready/Draft PRs, including applicable legacy counterparts. Reconcile conceptual overlaps and preserve unique improvements.
- `keep-as-draft`, `keep-draft`, `not-ready`, and explicit security holds block automated merging.
- Follow the [zero-step CI recovery runbook](https://github.com/atto-lang/.github/blob/main/governance/ci-zero-step-recovery.md). A carrier receipt is supplemental, not permission to bypass source-required checks or export private code.
- This repository's read-only verifier does not deploy or authorize a merge broker. The nightly parity controller remains review-only, never merges or self-approves, and never executes target repository code.
<!-- org-merge-review-policy:end -->
