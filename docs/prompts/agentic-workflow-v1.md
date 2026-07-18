# Agentic workflow prompt — V1 (faithful replica of the 2026-07-18 session)

Paste this to your AI coding agent, filling the <> placeholders.

---

I have a set of tasks for this project: <LIST YOUR TASKS/PROBLEMS, one per line, with screenshots if visual>.

Work as an **orchestrator of sub-agents**, not a solo coder. Follow this exact workflow:

**1. Explore first.** Before asking me anything, explore the codebase with read-only search agents (in parallel) so your questions are informed: relevant files, data models, existing patterns, test layout, anything my task list touches. Verify claims against the actual code — don't trust stale docs or your assumptions.

**2. All questions up front.** Ask me every clarifying question in ONE batch (multiple-choice where possible, with your recommendation marked). Cover: exact naming/mappings, scope boundaries, behavior choices where the current code is ambiguous, and anything that changes the plan's shape. I don't want any questions after this point.

**3. Spec + plan, then one approval.** Write a short design spec (decisions table, architecture notes, verification strategy) and a task-by-task implementation plan (exact files, interfaces between tasks, verification commands per task) to docs/. Show me the plan once; after my "go", execute everything without check-ins.

**4. Execute: fresh sub-agent per task, reviewed every time.**
- One implementer sub-agent per task, dispatched with ONLY its task brief + the interfaces from earlier tasks + global constraints — never the whole conversation history.
- **Match the model to the task**: cheapest model for mechanical/well-specified work, mid-tier for multi-file integration, the strongest model only for debugging, gnarly merges, and reviews. Never run two implementers on the same files at once.
- TDD wherever behavior is testable: failing test → implement → green, with RED→GREEN evidence in a report file.
- After every task, a separate reviewer sub-agent gets the diff + brief and returns TWO verdicts: spec compliance AND code quality (findings rated Critical/Important/Minor). Critical/Important → send the same implementer back to fix → re-review. Never proceed with open findings.
- Anything UI/flow-related must be verified in a real browser/runtime by the agent (screenshots, live interaction), not just by tests. Protect my real data (back up and restore localStorage/DBs the tests touch; never reuse my running dev servers).
- Keep a progress ledger file (task → commits → review verdict → deferred minors) so nothing is lost or re-done if context resets.
- Commit per task on a dedicated branch. Never touch main, never push, unless I say so.

**5. Finish with an adversarial whole-branch review.** Launch parallel finder agents, one per dimension (correctness/invariants, architecture boundaries, persistence/data safety, security/robustness, UX/accessibility — pick dimensions that fit the project). Every finding then goes to an independent verifier agent on a strong model whose job is to REFUTE it against the real code. Only verified findings survive. Fix them all with ONE fix agent (with regression tests + re-running the end-to-end check), then one re-review of the fixes, then the full gate: all tests, build, lint/whitespace, and a final end-to-end run.

**6. Report.** Lead with what shipped; list what the review caught and fixed (with severity), the evidence (test counts, measured numbers), any judgment calls you made on my behalf, and exactly how I verify the result myself (commands + what to click).

Rules throughout: read files before editing them; smallest fix that kills the root cause (root-cause first — reproduce before fixing); no drive-by refactors; performance claims need measured numbers, not vibes; if a sub-agent gets stuck or a fix attempt fails, change something (model, context, task size) — never retry the same thing.
