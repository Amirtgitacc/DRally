# Agentic workflow prompt — V2 (improved)

Everything V1 does, plus the upgrades that remove its weak spots: sequential-only execution, review effort not scaled to risk, verification concentrated at the end, and acceptance criteria invented late. Fill the <> placeholders.

---

I have a set of tasks for this project: <TASKS, with screenshots if visual>.

Act as an **orchestrator of sub-agents**. Principles: evidence over claims, root cause over patch, model cost matched to task difficulty, and my time spent only twice — answering one batch of questions, and approving one plan.

**Phase 0 — Recon & risk map.** Explore the codebase with parallel read-only agents. Produce a one-screen risk map: what each task touches, where tasks overlap, what's fragile (persistence, protocols, shared scenes/modules), and which existing tests/infra you can lean on. Reconcile any conflict between docs and code by trusting the code.

**Phase 1 — One batch of questions.** Ask everything at once (multiple choice + your recommendation). Include a "pre-mortem" question set: for each risky decision, what failure would make me unhappy in a month? Don't ask things the codebase already answers.

**Phase 2 — Spec with acceptance criteria baked in.** For EVERY task, write in the plan, before any code: (a) exact files and the interfaces/contracts it exposes to later tasks — frozen once approved, (b) named acceptance tests (unit + the end-to-end check that proves it in the running app), (c) its risk tier (LOW mechanical / MED integration / HIGH invariants-touching). One approval from me, then no check-ins.

**Phase 3 — Execute with parallelism where safe.**
- Build a task dependency graph. File-disjoint, dependency-free tasks run as PARALLEL implementer agents in isolated git worktrees, merged back in dependency order; overlapping tasks stay sequential. Never two agents in the same files.
- Model per risk tier: LOW → cheapest model; MED → mid-tier; HIGH (debugging, netcode, data safety, merges) → strongest model. Reviewers scale the same way — a strong model reviews HIGH diffs, a cheap one sanity-checks LOW diffs.
- TDD with RED→GREEN evidence; implementer self-review before handoff; independent reviewer with two verdicts (spec compliance, code quality); fix → re-review loop until clean.
- **Continuous end-to-end regression**: after every task that touches runtime behavior — not just at the end — re-run the scripted end-to-end flow (browser automation / API scenario / CLI script, whichever fits this project) and diff its result against the last green run. A task isn't done while the E2E is red.
- Ledger file after every task (commits, verdicts, deferred minors, E2E status). Commit per task on a work branch; main untouched; no pushes without my OK.

**Phase 4 — Adversarial final review, risk-weighted.** Parallel finder agents per dimension (pick dimensions that fit: correctness/invariants, architecture, data safety, security/abuse — assume a hostile client on anything networked, performance with measured numbers, UX/accessibility). HIGH-risk dimensions get stronger finder models and 2 independent verifiers per finding (majority rules); others get 1. Refuted findings are recorded, not fixed. ONE fix agent takes the whole confirmed list (regression test per fix), one re-review of the fix wave, then the full gate: complete test suite, build, lint, E2E, plus a short measured perf check if anything hot-path changed.

**Phase 5 — Close the loop.** Update the project's decision log/docs so the next session doesn't rediscover this work. Report: shipped work, findings caught→fixed with severities, refuted-finding count (proof the review had teeth), all evidence with numbers, judgment calls made on my behalf, cost note (which models did what), and exact verify-it-myself steps.

Standing rules: read before editing; reproduce before fixing; smallest root-cause fix; no drive-by refactors; protect my real data and running services (own ports, backup/restore any storage you touch); if an agent stalls, change model/context/decomposition — never same-retry; if the plan itself proves wrong mid-flight, stop and tell me instead of improvising a different scope.
