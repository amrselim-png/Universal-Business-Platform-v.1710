# MASTER AI INSTRUCTIONS

## 1. Purpose

This file defines the shared working rules for all AI agents working on the Universal Business Platform project.

It is the highest-level project instruction file.

The human project owner is the final decision maker.

AI agents must follow these instructions unless the project owner explicitly changes them.

---

## 2. Project Owner Authority

The project owner has final authority over:

- Business requirements
- Product direction
- Architecture decisions
- Database design decisions
- Security decisions
- Major refactoring decisions
- Changes to these instructions
- Approval or rejection of significant additional changes

AI agents are development assistants, not autonomous product owners.

---

## 3. Execute the User's Explicit Request

When the user gives a development request:

1. Understand the requested outcome.
2. Inspect the existing implementation before changing it.
3. Implement everything reasonably required to fulfill the request.
4. AI agents are allowed to modify any project file when that modification is genuinely required to complete the user's request.
5. Do not artificially restrict changes merely because a file belongs to the application core.

Core files may be modified when the requested feature genuinely requires it.

---

## 4. Significant Additional Changes Require Approval

During implementation, an AI agent may discover that an additional change would be useful or technically desirable.

Separate changes into two categories.

### A. Required changes

A change is considered required when it is reasonably necessary to complete the user's explicit request.

Examples:

- Updating a shared component because the requested feature uses it.
- Updating application state because the requested feature requires new state.
- Updating routing because a new screen must be accessible.
- Updating database queries required by the requested feature.
- Updating types required by the implementation.
- Fixing a local bug that directly prevents the requested feature from working.

These changes may be performed without additional approval.

### B. Significant additional changes

A change is significant when it goes materially beyond the user's request or changes the project's architecture, business behavior, security model, database structure, dependencies, or unrelated modules.

Examples:

- Replacing the application's state-management architecture.
- Rebuilding the routing architecture when it is not required.
- Changing the database architecture for an unrelated reason.
- Removing or redesigning unrelated modules.
- Introducing a new framework or major dependency without necessity.
- Performing a large-scale refactor unrelated to the requested task.
- Changing important business rules that the user did not request.
- Performing destructive database operations outside the requested task.
- Changing authentication or authorization architecture beyond what is required.
- Rewriting large portions of the application simply because another design is preferred.

When such a change is discovered:

**STOP before performing that significant additional change.**

Report:

1. What you want to change.
2. Why you believe it is necessary or beneficial.
3. Which files/modules/systems will be affected.
4. Expected risks or side effects.
5. Whether there is a smaller alternative.
6. What you recommend.

Then ask the project owner for approval.

Do not silently perform the significant additional change.

If the owner approves it, proceed.

If the owner rejects it, find a reasonable alternative or stop that part of the work.

---

## 5. Do Not Guess Business Rules

Never invent important business rules when the existing implementation or user request does not define them.

For ambiguous business behavior:

- Preserve existing behavior when possible.
- Explain the ambiguity.
- Ask the project owner when the decision materially affects the product.

Technical implementation details may be chosen by the AI when they do not materially change the intended business behavior.

---

## 6. Preserve Existing Functionality

When implementing a feature:

- Preserve unrelated existing functionality.
- Avoid unnecessary regressions.
- Do not remove working features merely to simplify implementation.
- Do not replace an existing implementation without a concrete reason.
- Prefer incremental changes when they can safely achieve the requested result.

---

## 7. Database Safety

Database changes require special care.

Never:

- Drop production data.
- Delete tables or large datasets merely for convenience.
- Rewrite database migrations destructively without justification.
- Expose database credentials.
- Commit secrets or connection strings.

If a destructive database operation is genuinely required by the user's request, clearly identify the destructive operation before executing it.

For development/test environments, destructive operations may be used when appropriate and clearly scoped.

---

## 8. Security and Secrets

Never commit:

- API keys
- Passwords
- Database credentials
- Authentication tokens
- Private keys
- `.env` secrets
- Other sensitive credentials

Use environment variables and existing secret-management mechanisms.

Do not expose secrets in logs, documentation, screenshots, commits, or generated files.

---

## 9. Architecture Awareness

Current major architecture:

- TypeScript
- React 19
- Vite
- Tailwind CSS
- Node.js 22 LTS
- Native ESM
- Neon PostgreSQL
- `@neondatabase/serverless`
- React Context-based platform state
- Multi-tenant business hierarchy
- Company → Branch → Warehouse
- Arabic + English
- RTL + LTR
- Responsive desktop/tablet/mobile UI

Important project areas include:

- `src/App.tsx`
- `src/context/PlatformContext.tsx`
- `src/services/`
- `src/views/`
- `src/components/`
- `src/data/`
- `src/utils/`
- `src/types.ts`
- `scripts/`
- Neon database/migration code

This is contextual information, not a prohibition against modifying these files.

---

## 10. Internationalization

The platform must preserve:

- Arabic language support.
- English language support.
- RTL behavior.
- LTR behavior.
- Correct translations.
- Correct layout direction.

A feature is not considered complete if it unnecessarily breaks Arabic/English or RTL/LTR behavior.

---

## 11. Performance

The platform is intended to handle substantial business datasets.

Avoid unnecessary loading of very large datasets into browser memory.

Prefer appropriate:

- Pagination
- Filtering
- Sorting
- Server/database-side querying
- Incremental loading
- Efficient state updates
- Indexed database queries

When dealing with large datasets, do not solve the problem merely by rendering or loading everything into the browser.

---

## 12. Testing and Verification

After making changes:

1. Run the most relevant validation available.
2. Check TypeScript errors.
3. Check build errors.
4. Test the affected functionality when possible.
5. Report what was tested and any remaining issues.

Do not claim a feature works if it was not actually verified.

---

## 13. Git Safety

Do not perform destructive Git operations unless explicitly authorized.

Do not use without explicit approval when destructive or history-altering:

- `git reset --hard`
- force push
- deleting important branches
- rewriting history
- mass deletion of files
- destructive merges

Normal development operations required by an explicitly requested workflow are allowed.

Never discard the user's uncommitted work without permission.

---

## 14. Shared AI Project Memory

All participating AI tools should use the shared project memory files when available:

- `MASTER_AI_INSTRUCTIONS.md`
- `AI_CONTEXT.md`
- `PROJECT_STATE.md`
- `PROJECT_PLAN.md` if present
- `CHANGELOG.md`

Before substantial work:

1. Read the master instructions.
2. Read the relevant project context.
3. Read the current project state.
4. Inspect the actual code related to the task.

After substantial work:

1. Update the project state.
2. Record important changes in the changelog.
3. Record important decisions that future agents need to know.

---

## 15. Session Handoff

Every AI agent should leave the project in a state that another AI agent can understand.

A handoff should communicate:

- What the user requested.
- What was implemented.
- Files changed.
- Important decisions.
- Tests performed.
- Known problems.
- Unfinished work.
- Recommended next step.

The goal is that another AI agent can continue the work without needing the previous conversation.

---

## 16. Chat History and Project Memory

The complete private chat transcript between different AI products cannot be assumed to be automatically available to every tool.

Therefore, preserve project-relevant conversation knowledge in repository documentation.

Do not copy sensitive credentials or private information into project memory.

Prefer structured summaries containing:

- User requirements
- Decisions
- Approved changes
- Rejected proposals
- Implementation history
- Current state
- Next steps

The repository should act as the shared project memory between AI tools.

---

## 17. Master Instruction Protection

This file may be changed when the project owner explicitly requests or approves a change to the project's AI operating rules.

AI agents must not independently rewrite, weaken, or remove these instructions merely because they prefer different development rules.

If changing this file is part of the user's explicit request, follow that request.

---

## 18. Communication Style

When reporting work:

- Be clear.
- Be concise.
- State what changed.
- State why it changed.
- Mention important risks.
- Do not hide significant deviations from the requested task.
- Do not pretend that unverified work was completed.

For significant additional changes, obtain approval before implementation.

---

## 19. Core Principle

The primary rule is:

**Implement the user's requested feature completely and professionally.**

**Do not unnecessarily restrict the AI from modifying the application core.**

**However, if implementation reveals a significant additional change outside the user's request, stop before making that additional change and ask the project owner for approval.**