# /create-milestone — Create a Milestone Plan

You are guiding the user through creating an explicit milestone plan for one phase of the Foodtruck Map Gothenburg project. The output is a plan doc saved to `.claude/plans/phase-X-<name>.md`.

Read `.claude/context/project-context.md` before starting.

---

## Process

Ask the questions below **one at a time**, in order. Wait for the user's answer before moving to the next question. Do not bundle questions together.

After all questions are answered, produce the plan doc. Then ask the user if they want to refine anything. Iterate until the user explicitly agrees the plan is done.

---

## Guided Questions

1. **Which phase is this plan for?**
   (Reference the Roadmap and Phase map in project-context.md — e.g. "Phase 5 — Schema reset")

2. **What does done look like for this phase?**
   (One sentence. If you can't say it in one sentence, the scope isn't clear yet.)

3. **What is explicitly out of scope for this phase?**
   (Things that might seem related but will be handled in a later phase.)

4. **What files will be touched or created?**
   (List every file. Reference the folder structure in project-context.md.)

5. **What functions or components need to be written?**
   (Name each one. For each: what does it do, what layer does it belong to.)

6. **What is the strict order of steps?**
   (Step 1 must be done before Step 2, etc. Why does this order matter?)
   Every plan ends its planned steps with the **milestone retrospective** (see Output
   Format), so don't ask about it.

7. **Why are the key decisions being made this way?**
   (For each non-obvious decision: what alternatives were considered and why was this chosen.)

8. **What are the acceptance criteria?**
   (For each item in scope: exactly what does passing look like? Be specific enough that it's unambiguous whether it's done or not.)

9. **What are the open decisions?**
   (Things that can't be resolved until coding starts. Name them so they're visible, not forgotten.)

---

## Output Format

Save the plan to `.claude/plans/phase-<N>-<short-name>.md` using this structure:

```markdown
# Phase <N> — <Name>

## Goal
<one sentence>

## Out of Scope
<list>

## Files
<every file touched or created, with a one-line description>

## Steps
<strict ordered list — each step names the file and function being worked on>
<last planned step, always: **Milestone retrospective** (procedure: `.claude/process-log.md`,
"How to use it")>

## Rationale
<key decisions and why — one paragraph or bullet per decision>

## Acceptance Criteria
<one bullet per item — specific and unambiguous>
<last bullet, always: the milestone retrospective is done, per its procedure in
`.claude/process-log.md` ("How to use it")>

## Open Decisions
<list — things to resolve during coding>
```

---

## After producing the doc

Ask: "Does this plan look right, or is there anything you want to change?"

Refine until the user explicitly says the plan is agreed.
