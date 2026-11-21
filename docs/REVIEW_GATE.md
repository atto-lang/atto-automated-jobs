# AttoLang nightly parity: authenticated one-owner review and overlap admission

Tracking issue: [#1](https://github.com/atto-lang/atto-automated-jobs/issues/1).
**2026-11-21 canonical policy:** [atto-lang/.github/AGENTS.md](https://github.com/atto-lang/.github/blob/main/AGENTS.md).

## Human approval policy — one independent trusted owner, any Ready age

A Ready PR needs one **actual GitHub APPROVED review** from either of the following
users, independent of the PR author:

| Approved GitHub human | Immutable ID | Eligibility |
| --- | ---: | --- |
| `the1mills` | `2148448` | Not PR author; verified collaborator write-level access |
| `ORESoftware` | `11139560` | Not PR author; verified collaborator write-level access |

**Not required:** both humans, ChatGPT/Codex, Claude/Anthropic, two GitHub App
model-review checks, age-based Ready quorums or fresh human review after a
routine push or a ten-day boundary. An AI-only or third-human-only approval
is never enough. A requested review, `COMMENTED`, `CHANGES_REQUESTED`,
revoked/`DISMISSED` review, spoofed human login or self-review never qualifies.

When GitHub still presents an earlier human review as effective `APPROVED`
after later pushes, this advisory evaluator honors it; the reviewed commit
SHA must remain well-formed but need not equal the latest head. Actual,
possibly stronger **GitHub branch protection and CODEOWNERS** remain mandatory,
including any live stale-approval/last-push requirements until separately
migrated. The evaluator's PASS **does not** authorize a merge.

## Ready / Draft lifecycle and independently verified overlap audit

The source's authenticated `created_at` and complete ordered lifecycle
timeline determine the current Ready/Draft cycle; a push is **not** a draft
clock reset. `keep-as-draft`, `keep-draft`, `not-ready` and security holds
block automatic admission. Draft promotion after 72 consecutive Draft hours
requires actual exact-head material CI, verified labels and hard safety gates;
this read-only validator **does not promote drafts**.

Every Ready PR, regardless of age, requires an authenticated complete semantic
overlap audit. `scripts/overlap-proof.cjs` validates the **distinct, pinned
trusted App** on `atto-review/overlap-audit`, not a PR-body claim or a status
name alone. The App must attest current `{repository, PR number, base SHA,
head SHA}`, a successful completed run after PR creation and before evaluation,
zero unresolved overlapping candidates, and recorded semantic disposition
of every candidate. The required scope includes Ready and Draft PRs,
related repositories, legacy Oreslang migration mapping and changed
symbols/APIs. New HEAD or BASE invalidates the previous overlap receipt.

The external audit service is the **producer** of overlap evidence; this
repository only validates its shape and source provenance. Neither a synthetic
manifest nor a green host-only JavaScript test is equivalent to scanning the
real competing PR diffs.

## Read-only policy verifier and tests

`scripts/review-gate.cjs` gathers the authenticated PR, repo numeric ID,
named human account IDs and collaborator permissions, full paginated reviews,
lifecycle timeline, HEAD-bound check runs and immutable overlap App receipt.
It fetches mutable PR, review, lifecycle and check evidence **twice** to
detect changes during evaluation. It neither executes untrusted PR code nor
writes or merges PRs.

Run local source-only tests:

```sh
node --test test/*.test.cjs
cargo test --locked
cargo run --locked -- validate
cargo run --locked -- plan
```

An isolated JavaScript harness ran **63/63 focused review, overlap and window
regression cases** against fetched exact draft source on 2026-11-21. That is
**not** an executed Node, Rust or GitHub Actions CI receipt. The checked-in
test harness must also pass on the real source exact head in stepful CI.

The standalone check can be invoked by an authorized read-only integration:

```sh
ATTO_OVERLAP_AUDIT_APP_ID='<verified-numeric-github-app-id>' \
GH_TOKEN='<scoped-read-only-token>' \
node scripts/review-gate.cjs atto-lang/atto-source.rs 123
```

Human numeric GitHub IDs are fixed, **not configurable overrides**.
Changing either numeric ID via `ATTO_THE1MILLS_USER_ID` or
`ATTO_ORESOFTWARE_USER_ID` is rejected. The overlap audit App ID must
be independently verified and configured. Do not store real private tokens
in PR bodies, logs, fixtures or this repository.

## Deployment: not installed, not an authorized merger

A trusted base-branch controller or audited GitHub App must execute the
verifier and publish its status tied to the **current PR HEAD** from a
pinned trusted installation. Do not execute mutable PR code with elevated
`pull_request_target` privileges. The **source repository's required checks,
current HEAD or merge group, actual protected approvals, CODEOWNERS, security,
conflicts, hold labels and semantic overlap resolution** must independently
pass immediately before a CAS-bound merge. Never interpret an advisory
PASS as a substitute for GitHub's enforcement or a human `APPROVED` review.

The prior four-slot / early-fast-renewal behavior in the original draft and
tracking issue is **superseded**. The Ready age in the lifecycle receipt
is retained as diagnostic metadata only, not an approval-quorum control.
The external overlap App is not provisioned or verified by this patch.
Without the independently authenticated overlap receipt the evaluator
**fails closed**, even if a human review exists. This does not justify
relaxing the mandatory overlapping-PR audit.

## CI admission and private carrier restrictions

A failed run with **zero job steps** is a pre-execution admission failure;
it is neither a compile failure nor proof that GitHub Actions minutes were
exhausted. Verify billing/admission capacity and examine exact-run/job
details before selecting an alternate runner. A private cross-organization
mirror requires destination-specific user authorization and privacy scope;
then preserve the exact complete Git tree, SHA-verified blobs/modes/symlinks,
binary/LFS/submodule boundaries and no tokens/secrets. Alternate-org CI
is **supplemental**, not a replacement for source-required checks.

GitHub configuration reads have previously returned 403 for plan and
integration restrictions, so **no effective ruleset migration is claimed**.
The current source controller is still DRAFT and cannot be merged by its
author's own approval.
