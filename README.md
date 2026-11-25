> **AI agent instructions (organization-wide):** Before working on code, issues, or pull requests, read and follow the [organization `AGENTS.md`](https://github.com/atto-lang/.github/blob/main/AGENTS.md), including its **merge-first stealth-development policy**. Honor any repository-local `AGENTS.md`, explicit holds, and GitHub-enforced rules.

# Atto automated jobs

This private repository owns scheduled AttoLang engineering automation, starting with the **nightly parity reconciler** for `atto-source.*`.

## Canonical naming and compatibility policy

This repository uses **AttoLang** exclusively in current documentation, source examples, generated draft PR descriptions, job labels and contract identifiers. Portable source uses `.atto`; compiler owners live under `atto-lang/atto-source.*`. The [canonical language specification](https://github.com/atto-lang/atto-spec) supersedes historical naming-era documentation, and any compatibility-only input must be explicitly admitted and scoped, never silently advertised as current language syntax.

Nightly parity automation should refuse generated README or PR text containing retired project/organization identifiers, flag stale specification links, and distinguish intentional target-profile differences from accidental language-semantic divergence. Do not automatically rewrite executable code or claim conformance from a Markdown rename. Use an exact-source, reviewable draft PR and executed guest receipts before promotion.

The source of truth is deliberately split:

- [`atto-spec`](https://github.com/atto-lang/atto-spec): normative language contracts.
- [`atto-target-profiles`](https://github.com/atto-lang/atto-target-profiles): portable target capabilities and approved divergences.
- [`atto-platform-conformance`](https://github.com/atto-lang/atto-platform-conformance): executable guest conformance and evidence.
- [`atto-compilers-parity-testing`](https://github.com/atto-lang/atto-compilers-parity-testing): differential language behavior.
- **This repository:** scheduling, reconciliation, audit reports, review-safe draft PR lifecycle.

## Status

**Bootstrap / admission phase.** The initial controller audits declared obligations and generates draft PRs containing machine-readable requirements; it does **not** claim to repair language semantics automatically. Neither a missing receipt nor a passing host-only test counts as backend parity. Deterministic compiler patch adapters can be added after independent guest verification. Cross-repository writes are disabled unless an explicitly scoped GitHub App is configured.

See [parity job design](docs/PARITY_JOB.md), [policy](policy/contracts.psv), and [nightly workflow](.github/workflows/nightly-parity.yml).

## Quick start

```sh
cargo test --locked
cargo run --locked -- validate
cargo run --locked -- plan
```

`plan` is offline and read-only. Nightly `reconcile` requires `GH_TOKEN` with scoped repository access, and only generates draft PRs; it never merges, force-pushes, or changes application/runtime code.

## Independent one-owner review and mandatory semantic-overlap audit

The [read-only review verifier](docs/REVIEW_GATE.md) implements the current canonical
single-human policy: exactly one independent, authenticated `APPROVED` review
from either `the1mills` or `ORESoftware` at any Ready age. It rejects
AI-only approvals, forged/dismissed/self approvals, blocked drafts and
unverified cross-PR semantic overlaps. It does not require an OpenAI/Anthropic
model-review quorum or repeat approvals after routine pushes.

This validator is an **advisory evidence component, not a deployed GitHub
merge-protection rule**. A separate authenticated overlap-audit App and
effective GitHub branch/CODEOWNERS/required-CI protections are still
necessary. Nightly parity-generated PRs remain draft; no auto-merge is
enabled.
