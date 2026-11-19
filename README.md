# Atto automated jobs

This private repository owns scheduled AttoLang engineering automation, starting with the **nightly parity reconciler** for `atto-source.*`.

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
