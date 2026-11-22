# Backlog & Cost-Aware Execution Rules
You execute work driven by `backlog.md` and per-task spec files (`tasks/*.md`) using minimal context, strict task boundaries, and cost-appropriate model delegation.
## 1. Backlog & Task File Structure
Maintain `backlog.md` strictly as a lightweight index in this hierarchy:
- `# <Idea / Epic>` — High-level goal or feature area.
- `## <Sub-idea>` — Cohesive feature slice or module, followed by a brief general description (scope, key files, constraints).
- `- [ ] [<status>](tasks/<task-id>.md) <Task description> [model: haiku|sonnet|opus] [depends: <IDs or none>]`
### Status Values & Checkbox Sync
- `[ ] [todo](tasks/T1.md)` — Waiting or ready to start.
- `[ ] [in-progress](tasks/T1.md)` — Currently active in a sub-session.
- `[ ] [blocked](tasks/T1.md)` — Waiting on dependencies or escalated after failure.
- `[x] [done](tasks/T1.md)` — Verified and complete.
### Task Spec File (`tasks/<task-id>.md`)
Each linked task file must stay concise and contain only what a fresh sub-session needs:
- **Goal:** One-sentence outcome.
- **Target Files:** Exact file paths to read/modify.
- **Steps / Constraints:** Bullet points of exact requirements and edge cases.
- **Verification:** Exact command(s) to run before marking `[done]`.
## 2. Planning & Model Routing
When breaking down an `# Idea` or `## Sub-idea`:
1. **Create linked task files during planning:** Write `tasks/<task-id>.md` for each task and link it in `backlog.md` using `- [ ] [todo](tasks/<task-id>.md) ...`.
2. **Decompose for cheap execution:** Split complex tasks into small, deterministic subtasks whenever possible so `haiku` can execute them safely against automated checks (tests, types, linter).
3. **Assign the right tier—do not over-split trivial work:**
   - `haiku`: Boilerplate, CRUD endpoints, migrations, unit tests, formatting, repetitive edits, and well-scoped changes with clear file paths and automated verification.
   - `sonnet`: Multi-file feature logic, non-trivial bug fixes, API integration, and standard refactoring.
   - `opus`: System architecture, ambiguous root-cause debugging, security-critical logic, and initial decomposition of complex epics.
4. **Avoid coordination overhead:** Never spawn sub-agents for tasks taking under ~5 minutes or touching tightly coupled lines in the same file. Batch related small edits into one task.
## 3. Session & Context Hygiene
1. **Plan → Compact → Execute:** After updating `backlog.md` and writing `tasks/*.md`, compact the planning session (retaining only the backlog index, task links, and key architectural decisions) before starting implementation.
2. **One task, one fresh sub-session:** Run each task in a clean sub-session loaded ONLY with:
   - Relevant project rules
   - The parent `## Sub-idea` description
   - Its linked `tasks/<task-id>.md` file and the target files listed inside it
   Do NOT load unrelated `tasks/*.md` files or drag conversation history across tasks.
3. **No mid-task resets:** Finish the atomic task and its verification inside its sub-session before closing it.
## 4. Dependency & Worker Execution Loop
1. Select ready tasks (`[todo]`) whose `[depends: ...]` items are all marked `[x] [done](...)`.
2. Before starting a task, update its link in `backlog.md` to `- [ ] [in-progress](tasks/<task-id>.md) ...`.
3. Run independent ready tasks in parallel workers **only if** their `Target Files` do not overlap. Run file-overlapping tasks sequentially.
4. Before marking any task `[x] [done](tasks/<task-id>.md)`:
   - Run the exact `Verification` command from `tasks/<task-id>.md`.
   - If a `haiku` task fails verification twice, stop retrying blindly—update status to `[blocked]`, append the failure output to `tasks/<task-id>.md`, and escalate the task to `sonnet`.
5. On task completion:
   - Update `backlog.md` to `- [x] [done](tasks/<task-id>.md) ...`.
   - Check newly unblocked tasks (`[depends: <completed-ID>]`) and queue/start them next.
