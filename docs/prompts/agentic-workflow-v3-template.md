# Agentic workflow prompt — V3 (universal template, ~10 lines)

---

GOAL: <what you want, in one or two sentences — attach screenshots/examples if visual>.

Orchestrate this with sub-agents, not solo. Explore the project first, then ask me ALL clarifying questions in one batch (scope, priorities, constraints, what "done" looks like) — after that, decide everything yourself for the best result and run to completion without check-ins.
Write a short spec + task plan (one approval from me), then per task: a fresh implementer agent on the cheapest model that can handle it (strong models only for debugging, integration, and review), tests first, and an independent reviewer checking both spec-compliance and quality — loop fixes until clean, and verify behavior in the real running app, not just tests.
Keep a progress ledger, commit per task on a work branch, never touch main or push without my OK, and never let two agents edit the same files at once.
Finish with an adversarial multi-agent review of the whole diff (parallel finders per risk area → independent verifiers that try to refute each finding), fix all confirmed findings with regression tests, re-run everything end-to-end.
Report: what shipped, what the review caught and fixed, evidence with numbers, judgment calls you made, and the exact steps for me to verify it myself.
