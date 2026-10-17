# /create-issues — Break a Milestone into GitHub Issues

Usage: `/create-issues <plan-name>`
Example: `/create-issues phase-1-foundation`

The argument names a plan doc in `.claude/plans/` — the filename without `.md`.
It does not have to be exact: Step 1 resolves a close match (suffix, plural, or
typo) and tells you which file it used, or stops and lists the folder if the
match is ambiguous or missing.

---

## Process

1. Read `.claude/plans/<argument>.md` — this is the source of truth for the milestone
2. Ask guided questions one at a time, wait for each answer before continuing
3. Propose a full issue breakdown in the conversation
4. Refine until the user explicitly agrees
5. Validate every issue against the template (Step 5)
6. Pre-flight GitHub checks: auth, duplicates, milestone, labels (Step 6)
7. Ask for confirmation, then create the issues (Step 7)

---

## Step 1 — Read the plan

Load the milestone doc from `.claude/plans/<argument>.md`.

If that exact file does not exist, look for a close match in `.claude/plans/`
(e.g. the argument differs by a suffix, plural, or typo — `phase-1-foundational`
vs `phase-1-foundation`). If exactly one plausible match exists, tell the user
which file you are using and proceed. If there are several or no plausible
matches, list what is in `.claude/plans/` and stop.

---

## Step 2 — Guided questions

Ask these one at a time:

1. **How should the steps in the plan map to issues?**
   Walk through each step and ask: should this be one issue, split into smaller issues, or combined with the next step? Propose a mapping and let the user react.

2. **What GitHub labels should be used?**
   Propose labels based on the phase (e.g. `foundation`, `map`, `types`, `chore`, `bug`). Let the user adjust.

3. **What is the GitHub milestone name?**
   (e.g. "Phase 1 — Foundation")

4. **What is the branch naming convention, and the base / PR target?**
   Propose a default (e.g. `phase-1/setup-types`, `phase-1/map-client`) and let the user confirm or change it.
   Also confirm the base branch issues are cut from and merged back into (default: `dev` → `dev`). This is recorded on every issue.

---

## Step 3 — Produce the issue breakdown

For each issue, output the full template below. **Every section is mandatory** —
predictable structure is what lets both a human and a cold AI session pick the
issue up. Sections that don't apply get an explicit `none`, never omission.
Keep values terse: a `Small` issue may have one-line sections and a 2–3 step
recipe; scale the content, never drop the skeleton.

The `←` notes in the template are authoring guidance for you — **never include
them in the actual issue body**. Strip them when filling the template.

```
### Issue N — <verb-first, specific title>

**Branch:** `<branch-name>`
**Base / PR target:** `<base>` → `<target>`   (default `dev` → `dev`)
**Labels:** <labels>
**Size:** Small | Medium | Large
**Blocked by:** Issue N (or "none")            ← other issues only
**Prerequisites:** <asset / env / external dep, or "none">   ← NOT issues

**Context:**
<1–3 sentences: why this issue exists and what it unblocks.>
Before starting, read CLAUDE.md and .claude/context/project-context.md.

**Reference rules:**
- <which CLAUDE.md / project-context.md constraints bound this work, or "none">

**Contract (provided by blockers):**       ← always present; "none" if no blockers
- <exact artifact each blocker hands over: type name + shape, exported
  component, file path, import statement — enough that this issue is doable
  without opening the blocker issue.>

**Files:**
- <file path> — <what changes in this file>

**Functions / Components:**
- `<name>` — <what it does>   (or "none")

**Non-goals:**
- <what this issue must NOT do — scope fences, work that belongs to other issues>

**Implementation steps:**       ← the HOW: ordered, checkable recipe
- [ ] <branch off base>
- [ ] <concrete action — install X, create file Y, add function Z>
- [ ] <…>
- [ ] <commit and open PR into target>

**Tests:**
- Unit: <test file and what it covers, or "none">
- Integration: <test file and what it covers, or "none">

**Verification:**               ← include ONLY when there is a runnable surface
- <exact commands to run + what to observe; omit this section entirely for
  pure config/chore issues and fold the command into the matching AC line.>

**Failure modes:**              ← REQUIRED when the issue adds or changes a guard; otherwise "none"
- Catches: <failure class> — <the probe or test that shows it, and its negative control>
- Does not catch: <class deliberately out of scope> — <why>

**Acceptance Criteria:**        ← the PROOF: binary outcomes, as checkboxes
- [ ] <specific, unambiguous, objectively pass/fail — one box per check>
```

Rules for issue breakdown:
- One issue = one session-sized chunk of work (one file, one function, one test file)
- Title is verb-first and specific: "Add `Truck` and `Location` types" not "Types"
- **Self-contained:** an issue must be doable without reading any other issue.
  Cross-references (`Blocked by`, `#N`) are for ordering only — any artifact
  needed to do the work is restated inline under **Contract**.
- **Steps vs AC:** Implementation steps describe *how* (the recipe); Acceptance
  Criteria describe *proof of done* (outcomes). Do not let AC restate the recipe.
- Both **Implementation steps** and **Acceptance Criteria** use `- [ ]`
  checkboxes so they render as live progress lists on the GitHub issue.
- AC must be per-issue, not phase-level — each one binary and objectively checkable.
- **Non-goals** are mandatory — name the adjacent work this issue must not touch.
- For dependency / chore issues, **pin the intended major version** in both
  Files and AC (e.g. `maplibre-gl` `^5.x`) — later issues depend on the API.
- Include unit tests as a separate issue if the plan calls for them, or fold into the implementation issue if trivial
- Include integration tests as a separate issue — they are never trivial
- Dependencies must be explicit: "Blocked by Issue N" — never implicit.
  Asset / env / external dependencies go under **Prerequisites**, not Blocked by.
- **A plan's last two planned steps, the milestone retrospective and the
  `project-context.md` reconciliation, become its last two issues, in that order.**
  The retrospective issue's body points at the procedure in `.claude/process-log.md`
  ("How to use it") instead of restating it; that procedure covers its follow-up
  issues, which are not made with this command.
- **Failure modes** are required for any issue that adds or changes a guard: a
  validator, a DB constraint, a test gate, a grep acceptance criterion, a gate
  script. Derive the classes from the change (the inputs, files, terms and paths it
  touches), not from memory. Each class it **catches** gets an Acceptance Criterion
  with a **negative control**: break the guard (or feed it the bad case) and watch it
  fail. The classes it **doesn't catch** are named too, with a reason ("none" only
  when there are none). Why: the process log's Phase 3 retrospective (its Action 2).

---

## Step 4 — Refinement

After presenting all issues ask:
"Does this breakdown look right, or is there anything you want to change?"

Iterate until the user explicitly agrees the issues are done.

---

## Step 5 — Validate before creating

Before any `gh issue create`, check every issue against the template. Reject and
repair any issue that is missing a required section or value:

- [ ] Branch, Base / PR target, Labels, Size all present
- [ ] Blocked by present (issues only); Prerequisites present (assets/env, or "none")
- [ ] Context present, with the "read CLAUDE.md / project-context.md" line
- [ ] Reference rules present (or "none")
- [ ] Contract present (or "none" — never omitted)
- [ ] Files and Functions / Components present (Functions "none" if not applicable)
- [ ] Non-goals present
- [ ] Implementation steps present as `- [ ]` checkboxes
- [ ] Tests present (Unit + Integration, "none" where applicable)
- [ ] Verification present if the issue has a runnable surface
- [ ] Failure modes present ("none" if the issue adds no guard); for a guard-adding
  issue, both lines are there (Catches, Does not catch), and each class it catches has
  an Acceptance Criterion with a negative control
- [ ] Acceptance Criteria present as `- [ ]` checkboxes, each binary
- [ ] Dependency/chore issues pin the intended major version
- [ ] A milestone plan's breakdown ends with the milestone-retrospective issue, then
  the reconciliation issue (this item doesn't apply to a retrospective's follow-up
  issues, which are checked against the rest of this list)

If any issue fails, fix it and re-present before proceeding.

---

## Step 6 — Pre-flight: auth, duplicates, milestone, labels

Before creating any issue, run these checks in order. Stop and report if any fails.

1. **Auth** — confirm gh is authenticated against the right repo, fail fast if not:
   ```bash
   gh auth status
   gh repo view --json nameWithOwner -q .nameWithOwner
   ```

2. **Duplicate guard** — `/create-issues` is not idempotent; re-running would
   create a second copy of issues. List existing issues under the milestone and
   compare titles to the breakdown:
   ```bash
   gh issue list --milestone "<milestone name>" --state all --limit 100 \
     --json number,title,state
   ```
   For any breakdown title that already exists, ask the user whether to **skip**,
   **update the existing issue**, or **create anyway** — never silently duplicate.

3. **Milestone** — `gh issue create` fails if `--milestone` does not exist. Check,
   create if missing, and use the exact same string at creation time:
   ```bash
   gh api repos/{owner}/{repo}/milestones --jq '.[].title'        # list existing
   gh api repos/{owner}/{repo}/milestones -f title="<milestone name>"   # create if missing
   ```

4. **Labels** — `gh issue create` fails on an unknown `--label`. List existing,
   create any that are missing:
   ```bash
   gh label list
   gh label create "<label>" --color "<hex>" --description "<desc>"   # only if missing
   ```

Do not proceed to Step 7 until auth passes, duplicates are resolved, and the
milestone and all labels exist.

---

## Step 7 — GitHub confirmation and creation

Once agreed, ask:

"Ready to create these issues on GitHub? I'll create N issues under the
milestone '<milestone name>'. Type yes to proceed."

If the user also wants them added to a GitHub Project (Kanban) board, ask for the
project number — this requires the token to have the `project` scope; if it does
not, note that and skip board-adding rather than failing the run.

Only proceed if the user confirms. Then create issues **in dependency order —
blockers first** — so each blocker has a real GitHub number before the issues
that reference it.

For each issue:

1. **Resolve cross-references.** The breakdown numbers issues locally ("Issue N").
   GitHub assigns the real `#` number at creation. Keep a local-N → real-`#` map
   as you create them, and rewrite every `Blocked by` reference in the body to the
   real `#` number before that body is submitted. Never ship a body containing a
   local "Issue N" reference.

2. **Strip the heading prefix.** The `--title` is the verb phrase only — drop the
   `Issue N — ` prefix from the template heading.

3. **Write the body to a file**, not inline — bodies contain backticks, `$`,
   and checkboxes that the shell will mangle in an inline `--body`:
   ```bash
   gh issue create \
     --title "<verb-phrase title, no 'Issue N —' prefix>" \
     --body-file "<path/to/issue-body.md>" \
     --label "<labels>" \
     --milestone "<milestone name>"
   ```

4. **(Optional) add to the Project board** if a project number was given and the
   token has `project` scope:
   ```bash
   gh project item-add <project-number> --owner <owner> --url <issue-url>
   ```

After all issues are created, output a summary:
- List of created issues with their real GitHub issue numbers and URLs
- The local-N → real-`#` mapping used
- Reminder of which issues are blocked by which (using real `#` numbers)
