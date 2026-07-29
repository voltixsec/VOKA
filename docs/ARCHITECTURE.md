# VOKA Architecture

## Project Vision

VOKA is an AI Sales Operating System built as a scalable multi-tenant SaaS platform.

## Core Principles

- Clean Architecture
- Domain-Driven Design (DDD)
- Feature-Based Structure
- Lightweight CQRS
- Repository Pattern
- Dependency Inversion

---

## Dependency Flow

Presentation
↓
Application
↓
Domain

Infrastructure implements contracts defined by the inner layers.

The Domain layer must never depend on:

- Prisma
- Next.js
- HTTP
- Database drivers
- External services

---

## Standard Feature Structure

features/
└── feature-name/
    ├── application/
    │   ├── commands/
    │   ├── queries/
    │   ├── ports/
    │   └── index.ts
    ├── domain/
    │   ├── entities/
    │   ├── repositories/
    │   ├── value-objects/
    │   └── index.ts
    ├── infrastructure/
    │   ├── prisma/
    │   └── index.ts
    ├── presentation/
    │   ├── api/
    │   ├── dto/
    │   └── index.ts
    └── index.ts

---

## Domain Rules

The Domain layer contains business logic only.

Allowed:

- Entities
- Value Objects
- Domain Errors
- Repository Interfaces
- Domain Services

Forbidden:

- Prisma
- Next.js
- HTTP
- Database code

---

## Multi-Tenant Model

Company
    ↑
CompanyMember
    ↓
User

User is a global identity.

Roles belong to CompanyMember.

One user may have different roles in different companies.

---

## Authentication

Authentication:

- JWT
- Refresh Token
- HttpOnly Cookies

Authorization:

- CompanyMember
- Role
- Permissions

Authentication answers:

Who are you?

Authorization answers:

What are you allowed to do?

---

## Repository Rules

Repositories return Domain objects.

Never return Prisma models.

Repository interfaces belong to Domain.

Repository implementations belong to Infrastructure.

---

## Development Workflow

main

↓

feature branch

↓

implementation

↓

build

↓

commit

↓

push

↓

pull request

↓

merge

---

## Required Checks Before Commit

npx prisma validate

npm run build

git status

git diff

---

## Task Completion Rule

A task is finished only when the user explicitly says:

تم

Silence never closes a task.
