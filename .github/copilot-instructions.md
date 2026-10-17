# GitHub Copilot Instructions

Before starting substantial work in this repository, read these shared project files:

- `MASTER_AI_INSTRUCTIONS.md`
- `AI_CONTEXT.md`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

## Project Change Rules

- `MASTER_AI_INSTRUCTIONS.md` is the highest-level project instruction file. Follow it as the governing project instruction.
- Implement the user's explicit request. Inspect the existing implementation before making changes and preserve unrelated working functionality.
- Make changes that are genuinely required to fulfill the explicit request.
- A significant additional change outside the request requires the project owner's approval before implementation. Explain the proposed change, rationale, affected areas, risks, alternatives, and recommendation, then wait for approval.
- Do not independently modify `MASTER_AI_INSTRUCTIONS.md`. Modify it only when the project owner explicitly requests or approves the change.

## Repository Structure

```text
Universal-Business-Platform/
├── MASTER_AI_INSTRUCTIONS.md
├── AI_CONTEXT.md
├── PROJECT_STATE.md
├── CHANGELOG.md
├── .github/
│   └── copilot-instructions.md
├── src/
├── public/
├── scripts/
└── ...
```
