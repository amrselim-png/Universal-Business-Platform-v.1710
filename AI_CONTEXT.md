# AI CONTEXT — Universal Business Platform

## 1. Project Identity

Project name:

Universal Business Platform

Repository:

Universal-Business-Platform

The project is a cloud-oriented, multi-tenant business management platform designed to support different types of commercial, industrial, service, and specialized businesses.

The platform is intended to be significantly more flexible and comprehensive than a traditional ERP.

---

## 2. Current Technology Stack

Primary technologies:

- TypeScript 5.8+
- React 19
- Node.js 22 LTS
- Native ESM
- Vite 6
- Tailwind CSS 4
- Neon PostgreSQL
- `@neondatabase/serverless`
- Motion
- Recharts
- Lucide React
- XLSX support
- DOCX generation/support

The project currently uses React Context for major platform-level state management.

---

## 3. Main Business Hierarchy

The intended business hierarchy is:

Company
→ Branch
→ Warehouse

The architecture is multi-tenant.

Data isolation between companies/tenants is important.

---

## 4. Main Application Areas

The current application contains or references areas including:

- Dashboard
- Point of Sale
- Accounting
- Inventory
- Inventory Management
- Products
- Invoices
- Parties
- Suppliers
- Companies and Branches
- Users and Roles
- Reception Operations
- Bookings and Follow-up
- Staff Management
- Payroll
- Attendance
- Employee Dossier
- Clinics
- Laser Devices
- Payment Methods
- Audit Trail
- Activity Logs
- Shift Reports
- Fiscal Documents
- Cash Receipts
- Collection Receipts
- Cash Payments
- Specialized Tax Invoices
- Goods Receipts
- Goods Issues
- Smart Notifications
- System Manual
- Neon / Database Management

This list describes the current project and may evolve.

---

## 5. Important Source Structure

### Application entry and main orchestration

- `src/main.tsx`
- `src/App.tsx`

`App.tsx` currently coordinates major views, layout, navigation, permissions, URL state, and shared UI elements.

### Platform state

- `src/context/PlatformContext.tsx`

This is a major shared application-state area.

Changes here may affect many parts of the application and should therefore be inspected carefully before modification.

This does NOT mean the file is immutable.

### Services

- `src/services/`

Important current service areas include:

- `accountingEngine.ts`
- `neonService.ts`

### Components

- `src/components/`

Contains reusable UI and application components such as:

- Header
- Sidebar
- Quick Actions
- Notifications
- Modals
- Error Boundary
- Data transfer tools
- Keyboard shortcuts
- Context menus
- Dashboard widgets

### Views

- `src/views/`

Contains the main application screens/modules.

### Data

- `src/data/`

Contains initial/static configuration or data used by the application.

### Utilities

- `src/utils/`

Contains shared utilities such as:

- fiscal utilities
- Excel/database backup utilities
- safe storage
- translation
- booking time utilities
- export utilities
- audio alerts

### Types

- `src/types.ts`

Central TypeScript type definitions.

### Database/scripts

- `scripts/neon_schema_migrations.sql`
- `scripts/generate_docx_manual.js`

---

## 6. Current Database Direction

The application is being migrated toward Neon PostgreSQL as the cloud database.

The database architecture is intended to support:

- Multi-tenancy
- Companies
- Branches
- Warehouses
- Products
- Stock
- Accounts
- Sales
- Patients/clients
- Parties
- Appointments/bookings
- Journal entries
- Other business modules as the platform evolves

Database design must support scalability and reliable business data integrity.

---

## 7. Frontend Requirements

The frontend should support:

- Desktop
- Tablet
- Mobile
- Arabic
- English
- RTL
- LTR
- Responsive layouts
- Fast navigation
- Large datasets
- Consistent reusable UI patterns

Do not introduce a design that works only for desktop if the requested feature is expected to work across devices.

---

## 8. Performance Requirements

The application may eventually process large business datasets.

Important examples include:

- Thousands or tens of thousands of customers
- Large product catalogs
- Large transaction histories
- Large appointment/booking datasets
- Large accounting datasets

Avoid unnecessary client-side loading of entire tables.

When appropriate, use:

- Database-side filtering
- Pagination
- Sorting
- Search
- Incremental loading
- Efficient queries
- Appropriate indexes
- Virtualized rendering where useful

---

## 9. Existing Performance Concern

A previous issue occurred when importing approximately 10,000 customers.

The browser UI could become blank, frozen, or unresponsive.

Future implementations involving large imports or large datasets should therefore consider:

- Batch processing
- Pagination
- Server/database-side processing
- Avoiding huge React state updates
- Avoiding rendering thousands of rows simultaneously
- Progress feedback
- Error handling

Do not assume that loading all records into the browser is acceptable.

---

## 10. Internationalization

The platform is bilingual:

Arabic
English

Both directions must remain supported:

RTL
LTR

New UI text should use the project's existing translation approach when applicable instead of unnecessarily hardcoding language-specific strings.

---

## 11. Existing Project Philosophy

The platform is intended to become a flexible business platform rather than a fixed ERP package.

The long-term direction includes:

- Configurable modules
- Multiple industries
- Multi-company operation
- Multi-branch operation
- Multi-warehouse operation
- POS
- Accounting
- Inventory
- Sales
- Purchasing
- Customer management
- Staff management
- Follow-up
- Call-center style workflows
- Analytics
- Security and permissions
- Cloud deployment
- Customizable business workflows

The architecture should therefore avoid unnecessary assumptions that the system will serve only one business type.

---

## 12. AI Agent Working Model

All AI agents should treat this repository as the shared project source of truth.

Before starting meaningful work:

1. Read `MASTER_AI_INSTRUCTIONS.md`.
2. Read this file.
3. Read `PROJECT_STATE.md`.
4. Inspect the relevant source code.
5. Determine the smallest reasonable implementation that satisfies the request.

After completing meaningful work:

1. Update `PROJECT_STATE.md`.
2. Update `CHANGELOG.md` when the change is significant.
3. Record important technical or business decisions.
4. Clearly state any remaining issue.

---

## 13. Important Rule About Architecture Changes

The architecture is not frozen.

An AI agent may modify architecture when doing so is genuinely required by the user's request.

However, an AI agent must not independently introduce a substantial unrelated architectural change merely because it believes the architecture could be better.

Follow the approval process defined in:

`MASTER_AI_INSTRUCTIONS.md`

---

## 14. GitHub as Shared Source of Truth

The GitHub repository is intended to become the shared source of truth between:

- Google AI Studio
- OpenAI Codex
- Claude Code
- GitHub Copilot
- Local development environment

The exact synchronization workflow may evolve.

Agents should rely on repository state rather than assuming another AI product's private conversation history is available.

---

## 15. Shared AI Memory

The repository's AI memory consists primarily of:

- `MASTER_AI_INSTRUCTIONS.md`
- `AI_CONTEXT.md`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

Additional documentation may be added when useful.

The purpose is to preserve project-relevant knowledge between AI sessions.

Do not store passwords, API keys, database credentials, or other secrets in these files.

---

## 16. Current Repository Structure

```text
Universal-Business-Platform/
│
├── .github/
├── public/
├── scripts/
│   ├── generate_docx_manual.js
│   └── neon_schema_migrations.sql
│
├── src/
│   ├── components/
│   ├── context/
│   ├── data/
│   ├── services/
│   ├── utils/
│   ├── views/
│   │   └── fiscal/
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
│
├── .env.example
├── .gitignore
├── index.html
├── metadata.json
├── package.json
├── tsconfig.json
└── vite.config.ts
```

This structure may change as development continues.

17. Important Current Development Principle

Do not treat the current implementation as perfect.

The project is actively evolving.

Agents should:

Understand existing code first.

Improve code when improvement is directly related to the requested task.

Preserve working behavior.

Avoid unrelated rewrites.

Ask for approval before substantial additional changes outside the user's request.

18. Handoff Principle

A future AI agent should be able to open the repository and understand:

What the project is.

How it is structured.

What has already been done.

What remains to be done.

Why important decisions were made.

What the previous agent was working on.

PROJECT_STATE.md and CHANGELOG.md are responsible for the evolving portion of this knowledge.