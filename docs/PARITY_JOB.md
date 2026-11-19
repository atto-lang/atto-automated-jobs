# Atto nightly contract-driven parity

## Repository boundaries

This automation lives in atto-automated-jobs rather than in a compiler backend. [atto-spec](https://github.com/atto-lang/atto-spec) owns normative semantics; [atto-target-profiles](https://github.com/atto-lang/atto-target-profiles) owns capability declarations and accepted exclusions; [atto-common-source](https://github.com/atto-lang/atto-common-source) owns genuinely portable compiler and standard-library sources; [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance) owns positive and negative guest fixtures and exact-source execution receipts; [atto-compilers-parity-testing](https://github.com/atto-lang/atto-compilers-parity-testing) compares independent compilers. Implementation changes stay in atto-source.*.

The checked-in policy is an **initial, reviewable bootstrap snapshot**, not evidence that every upstream profile and cross-backend obligation has been ratified. Reconcile the policy against those authorities before making it a branch-protection gate.

## Policy classifications

The file `policy/contracts.psv` uses the schema `contract|phase|backend|obligation|reason`:

- **required:** the selected target must implement the contract's observable language behavior and prove it by executable conformance tests;
- **optional:** implementation may differ or be absent, but support claims need exact-head proof;
- **forbidden:** the target must reject unsupported behavior rather than silently reinterpret it;
- **deferred:** a reviewed decision intentionally postpones the requirement; do not call it passed.

Contract phase is `accepted`, `normative`, or `proposal`. An unratified `proposal` cannot be `required`. A capability such as unbounded dynamic allocation can be forbidden for HDL without being forbidden for an LLVM runtime. Explicit differences are **policy, not parity failures**. Keep approved, expiring waivers and owner/issue references in upstream target profiles; mirror accepted dispositions here.

The file `policy/targets.psv` contains a strict repository allowlist. The controller cannot be redirected to an arbitrary GitHub organization or unrelated repo by a PR change.

## Nightly lifecycle

1. Validate policy using Rust tests; neither `validate` nor `plan` accesses GitHub.
2. Scheduled and manual workflow events run at 08:17 UTC, but the reconciler is disabled until `ATTO_PARITY_ENABLED=true` and the dedicated GitHub App credentials are configured.
3. Obtain a narrowly scoped GitHub App token; clone each selected backend using the GitHub CLI credential helper.
4. Compare the per-backend derived obligation snapshot against `.atto/parity/requirements.psv`. This is a **machine-readable admission checklist**, not an implementation fix or a guest test receipt.
5. Create/update at most five draft PRs per run, using one deterministic bot branch in each backend. Refuse to overwrite unowned PRs, touch ready-for-review PRs, or force-push. Conflicts block updating.
6. Emit Markdown reports as a workflow artifact, including the status of each target. A missing guest receipt is NOT_EXECUTED.

`cargo run --locked -- validate` and `cargo run --locked -- plan` are offline. `cargo run --locked --release -- reconcile` is the guarded cross-repository write mode.

### What the initial implementation does NOT do

The first milestone deliberately does **not** autonomously rewrite LLVM, JVM, Rust, .NET, JavaScript, Forge or HDL compiler code. A generic copy/paste patch across different codegens would be unsound. **Implementation parity PR generation** requires reviewed per-contract patch adapters, a per-target parser/IR/codegen plan, exact-tree tests, actual compiled .atto guest execution and negative rejection checks before publishing any candidate as verified. The initial draft PRs only establish checked-in capability/obligation tracking.

Do not treat identical source trees, compiler host-unit tests, README claims or Actions runs with zero executed steps as independent compiled-guest parity. Distinguish PASS, FAIL, UNSUPPORTED and NOT_EXECUTED; for example, atto-source.wasm currently integrates a Rust-authored compiler rather than necessarily constituting a second independent compiler.

## Setup (requires repository owner action)

1. Install a dedicated GitHub App on the eleven named atto-source.* repositories. Grant only Contents (read/write), Pull requests (read/write), and the standard metadata permission. Private repository clone requires installation access. The action is configured with the repository allowlist instead of all org repositories.
2. Add **repository secrets** `ATTO_PARITY_APP_ID` and `ATTO_PARITY_APP_PRIVATE_KEY` in this private repository.
3. Set **repository variable** `ATTO_PARITY_ENABLED=true`. It defaults to disabled. Start with `workflow_dispatch` and inspect the result before waiting for nightly execution.
4. Require human review before merging any generated backend draft PR; the controller never merges nor marks ready.
5. When this org is short of GitHub Actions minutes, run the identical workflow on an approved private alternate carrier after full per-blob SHA and root-tree verification. A carrier's default GITHUB_TOKEN does not grant cross-org private source access. Never publish private snapshots or transfer secrets into an untrusted carrier.

## Acceptance of actual semantic parity

For each compiled guest receipt require exact compiler commit SHA and tree SHA, full fixture source SHA, target toolchain, guest execution logs with nonzero executed steps, positive outcomes and negative diagnostic checks. Compile-time rejection counts as success for a forbidden feature only when negative conformance was actually executed. The controller's initial obligation snapshot cannot certify PASS.

## Next engineering stage

Implement a `patch-adapters/` interface with contract-specific **Rust** adapters and a small curated conformance matrix. Only propose backend-native code changes from those adapters if guest verification succeeds. Treat runtime constraints, real-time guarantees and HDL synthesis restrictions as first-class required divergence. Never auto-merge.
