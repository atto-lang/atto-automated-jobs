# AttoLang parity: independent four-slot review admission

Tracking issue: https://github.com/atto-lang/atto-automated-jobs/issues/1

## Four slots required before any merge

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

Offline tests: `node --test test/*.test.cjs` (38 positive/negative cases, including mock API pagination and PR race checks). Rust parity tests remain `cargo test --locked`. Both are included in the existing nightly workflow's validation job.

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
