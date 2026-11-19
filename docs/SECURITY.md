# Security and CI limitations

- **Disabled by default.** `ATTO_PARITY_ENABLED` must be `true`; the scheduled workflow does not attempt writes with an unconfigured GitHub App.
- **Scoped credentials.** Use a dedicated GitHub App installed on explicitly enumerated atto-source.* repositories with only Contents and Pull requests write privileges. No personal token or secrets in version control.
- **No untrusted-code execution.** Target repositories are cloned only as data; the controller never executes target Makefiles, tests, scripts or compilers. Guest execution belongs to separate approved, isolated conformance workers.
- **Bot isolation.** A fixed bot branch and PR-body marker are required. Never take over an unowned PR, modify a ready-for-review PR, force-push, merge or auto-approve.
- **Write allowlist.** Only `.atto/parity/requirements.psv` is changed by the first-phase controller; its contents are explicitly not compiler verification.
- **Exact evidence.** No guest parity assertions based on host-only tests, reported statuses, zero-step Actions, unpinned sources or reused stale SHAs.
- **Alternate runners.** Any private cross-org source-tree mirror requires explicit organization approval and exact per-blob SHA/tree verification. The carrier must remain private.
- **Governance.** Upstream normative semantics and target exceptions require reviewed decisions. A changed contract snapshot is never permission to silently reinterpret the language.
