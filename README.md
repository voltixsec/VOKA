# VOKA

VOKA is an AI-powered sales and quotation platform designed to transform voice and text conversations into professional business quotations and documents.

---

# Vision

Create the fastest AI Sales Employee that helps companies generate quotations, invoices and business documents naturally through conversation while keeping the user in full control.

---

# Core Principles

- AI assists but never replaces the user.
- The user is always the final decision maker.
- Nothing is approved automatically.
- A task is closed only when the user explicitly says: **تم**
- Silence never closes conversations.
- Every conversation can be resumed later.
- Products and Services are different item types.
- Service items appear separately while still contributing to the total amount.
- Terms & Conditions can be added by voice or text.
- Arabic and English are first-class languages.

---

# MVP Workflow

```text
Voice / Text
      ↓
AI extracts information
      ↓
User reviews everything
      ↓
User says "تم"
      ↓
Professional PDF Quotation
```

---

# Technology Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma ORM
- Auth.js
- Zod
- OpenAI API

---

# Project Structure

```text
app/
    Landing Page
    Routing
    API

components/
    common/
    dashboard/
    forms/
    icons/
    landing/
    ui/

features/
    ai/
    auth/
    conversations/
    customers/
    products/
    quotations/
    services/
    settings/

config/
hooks/
lib/
locales/
public/
services/
types/
utils/
```

---

# Development Workflow

```
GitHub Issue
      ↓
Feature Branch
      ↓
Implementation
      ↓
Testing
      ↓
Review
      ↓
Pull Request
      ↓
Merge
```

---

# Git Rules

- Never work directly on main.
- Every feature has its own branch.
- Every change must be reviewed before merge.
- Small commits are preferred.

---

# Commit Style

Examples:

```
feat: add customer module
feat: quotation engine
fix: quotation calculation
docs: update README
chore: initialize project architecture
```

---

# Coding Rules

- Clean Architecture
- Feature Based Structure
- Reusable Components
- Strong TypeScript Types
- No duplicated code
- Keep business logic outside UI whenever possible.

---

# Product Modules

- Authentication
- Companies
- Users
- Customers
- Products
- Services
- Conversations
- AI Engine
- Quotations
- Invoices
- Reports
- Dashboard
- Settings

---

# AI Rules

The AI should:

- Extract customer information.
- Detect products.
- Detect services.
- Understand quantities.
- Understand prices.
- Detect payment terms.
- Generate quotation drafts.

The AI must NEVER automatically approve any quotation.

---

# Development Commands

Install dependencies

```bash
npm install
```

Run development server

```bash
npm run dev
```

Open browser

```
http://localhost:3000
```

---

# Current Status

Current Phase:

Foundation

Completed:

- Git repository initialized
- Branch strategy established
- Development environment prepared
- Next.js running successfully
- Project architecture initialized

---

# Project Governance

No task is considered completed automatically.

Only the project owner can close a task by explicitly saying:

**تم**

This rule is mandatory throughout the entire VOKA project.