# AttoLang parity: authenticated Ready-cycle review admission

Tracking issue: https://github.com/atto-lang/atto-automated-jobs/issues/1

## Four slots for Ready age below 72h and after the 240h renewal boundary

| Slot | Verified identity | Pass criteria |
| --- | --- | --- |
| Human 1 | the1mills, immutable GitHub user ID | Latest effective APPROVED GitHub review on exact current HEAD |
| Human 2 | ORESoftware, distinct immutable GitHub user ID | Latest effective APPROVED GitHub review on exact current HEAD |
| AI 1 | pinned OpenAI bot reviewer user ID **and** review-service GitHub App ID | Formal APPROVED bot review plus completed successful `atto-review/openai` check on exact current HEAD |
| AI 2 | **different** pinned Anthropic bot reviewer user ID **and** GitHub App ID | Formal APPROVED bot review plus completed successful `atto-review/anthropic` check on exact current HEAD |

Codex / ChatGPT identify **one** OpenAI review family. Claude / Anthropic / Opus / Fable identify **one** Anthropic family; only register Fable as an alias if its Anthropic identity is independently verified. Self-reported names in comments do not prove model origin. Formal AI bot reviews are mandatory **in addition** to provider checks; a check alone cannot fill the approval slot. The two trusted review-producing Apps must really execute independent providers and submit genuine positive verdicts; a generic shared bot relaying one agent through two checks is not proof.

No four-slot check can override actual eligible human reviews, unresolved CHANGES_REQUESTED, protection policies, CODEOWNERS or source CI. Configure required checks to accept **only a particular trusted source GitHub App**, not just a check name.

## Read-only verifier and test matrix

`scripts/review-gate.cjs` is a standalone no-dependency Node.js validator for one private `atto-lang/atto-source.*` PR. It reads the PR, repository ID, pinned named humans, all paginated GitHub reviews, exact-head check runs and current PR metadata again. It rejects missing/invalid IDs, unavailable write-level GitHub collaborator permissions, unknown review states, duplicate bot reviewers/providers, spoofed App identity, missing/stale/dismissed AI or human formal approvals, change requests, author self-approval, stale/failed model checks, draft status and changed HEAD. It never checks out, executes, pushes or merges PR source.

Offline tests: `node --test test/*.test.cjs` (40 positive/negative cases, including mock API pagination and PR race checks). Rust parity tests remain `cargo test --locked`. Both are included in the existing nightly workflow's validation job.

Once a repository owner separately verifies the immutable IDs and configures a **scoped read-only token**, run:

~~~sh
ATTO_THE1MILLS_USER_ID=2148448 \
ATTO_ORESOFTWARE_USER_ID='<verified-numeric-user-id>' \
ATTO_OPENAI_APP_ID='<verified-openai-app-id>' \
ATTO_ANTHROPIC_APP_ID='<verified-anthropic-app-id>' \
ATTO_OPENAI_REVIEWER_ID='<verified-openai-bot-user-id>' \
ATTO_ANTHROPIC_REVIEWER_ID='<verified-anthropic-bot-user-id>' \
GH_TOKEN='<read-only-token>' \
node scripts/review-gate.cjs atto-lang/atto-source.rs 123
~~~

An unset identity, unverified write-level repository permission, or missing proof fails closed. No token, key or user-source content is logged.

## Required GitHub installation — not yet deployed

**This repository's verifier is not by itself an enforced merge rule.** Administrators must:

1. Verify/pin human user IDs and two *different* trusted provider App IDs and two different bot GitHub user IDs in protected configuration; audit the Apps' actual agent execution provenance and credentials.
2. Host the read-only verification code in a trusted base-branch controller or dedicated third GitHub App, not on mutable PR-head code. Never checkout and execute untrusted PR code under elevated `pull_request_target` or `workflow_run` privileges.
3. Recheck upon PR `synchronize`, submitted/dismissed **human or AI** reviews and model-provider check completion. Publish an exact-HEAD `atto-review/four-slot-gate` check from a separate trusted GitHub App, after verifying that HEAD is unchanged. A `pull_request_target` workflow's own check attaches to the base SHA and **does not substitute** for an exact-head gate check.
4. In every protected source backend ruleset require the gate from its pinned source App, current source CI and eligible human reviews. Preserve existing code-owner, security and no-bypass restrictions. Do not mistake a locally passing script for GitHub enforcing its result.
5. Have the nightly controller create PRs under a dedicated bot identity. If either required human authored the PR, GitHub prohibits their self-approval. Leave the PR blocked until explicit policy or authorship resolution; never fabricate a review or silently replace the person.
6. Recheck all evidence and protection at merge-time. A PASS from this verifier is necessary **but insufficient**: native GitHub approval eligibility and unrelated branch/ruleset protection can still prevent merging.

Generated nightly parity PRs remain drafts pending authorization; this is **not** a new auto-merger.

## Alternate organization test runner

Only investigate cross-org private mirror fallback after evidence of genuine Actions capacity/billing exhaustion; 403 API rate limits and zero-step failures alone do not prove this. First verify **explicit authorized privacy scope** for the exact private source and receiving repository, its collaborators and retention. Source GITHUB_TOKEN cannot checkout a separate organization's private repo. Copy exact Git tree, preserving blob SHAs, paths, modes, symlinks, binary files and Gitlinks; independently compare complete tree SHA, identify missing LFS/submodule dependencies, and fail closed on mismatches. Never copy credentials or secrets. Capture full real build/test steps and receipts on a destination-local private branch and safely clean up. An alternate-org success **never satisfies source-repo required checks or protected reviews**.

This gate's deterministic fixtures contain no private compiler source and should be exercised without transferring compiler repositories whenever feasible.

## Verified deployment blockers (November 18, 2026)

- Draft controller PR: https://github.com/atto-lang/atto-automated-jobs/pull/3 ; private source repo workflow #44446929858 had a failed validation job with **zero executed steps**. This is not evidence of a failed Node or Rust test and does **not** by itself prove exhausted Actions minutes.
- Repository rulesets GET on both private controller and private `atto-source.rs` returned 403 with GitHub message `Upgrade to GitHub Pro or make this repository public to enable this feature.` Branch-protection GET returned 403 `Resource not accessible by integration`. Therefore enforcement configuration could not be verified or deployed through the current connection.
- Unknown / not yet provisioned: ORESoftware pinned human ID and the distinct trusted AI review bot user IDs and App IDs. The verifier intentionally blocks without them.
- No private Git tree was copied across organizations: verified Actions billing exhaustion and approved private destination scope were not established. Exact-source alternate-org CI is **not claimed**.

## 2026-11-21 Ready-cycle hardening (draft; not enforcement)

The read-only verifier now fetches the **complete GitHub lifecycle timeline twice**, validates event IDs/actors/order, PR `created_at`, current Draft flag and current hold labels, and records the current Ready/Draft cycle start, event ID, exact 72h/240h window and post-240h review cutoff. This rejects stale same-SHA approvals from earlier cycles and old ten-day approvals. Provider checks must also complete inside the applicable cycle/window.

**Important:** The verifier now selects the age-appropriate review quorum, but the **72–240-hour fast lane still fails closed unless an independently authenticated overlap-audit service signs a complete exact-head check**. That service has not been deployed or independently verified. It cannot accept a PR body statement or unchecked `overlap=true` flag. Draft promotion, native required checks and actual GitHub rulesets still require independent deployment. Local synthetic tests and alternate-org runs are not source-required-check substitutes.

## Fast-lane trust contract (not deployed)

At Ready age from 72 hours inclusive to 240 hours exclusive, the read-only verifier accepts one current-cycle, exact-head approved human with authenticated current write-level repository permission, **or** one verified formal AI family review with its separately pinned successful provider-App check. Named humans are not interchangeable with the author. Third-party human eligibility is re-read from the GitHub collaborator permission endpoint. At 240 hours, both designated humans and both independent AI families must review again after the boundary.

The fast lane also requires a separate successful `atto-review/overlap-audit` check created by the dedicated independent GitHub App pinned in `ATTO_OVERLAP_AUDIT_APP_ID`. This App must not share the pinned identity of either AI reviewer App. Its `external_id` binds source repository, PR number, exact base SHA and exact head SHA in the format `atto-overlap:v1:<repo>:<number>:<base-sha>:<head-sha>`. Its JSON output summary must carry schema `atto.overlap-audit.v1`, complete scan scope markers for ready/draft PRs, related repos, legacy migration map and changed APIs/symbols; every candidate requires an immutable head, a reasoned semantic disposition and zero unresolved competitors. The check result is a trust assertion by the external producer, **not** a semantic scan performed by this script. A check name, arbitrary PR text or a self-declared manifest is not sufficient.

This is a supplemental **read-only decision library**, not protected merge enforcement, the independent scanner itself, a Draft promoter or source-required CI. Required checks, branch protections, CODEOWNERS, security holds and final GitHub merge refusal all remain authoritative. The new overlap App is not provisioned: without a pinned App and valid signed check the fast lane denies. The synthetic `node --test test/*.test.cjs` suite does not replace executed source GitHub Actions or other required material tests.
