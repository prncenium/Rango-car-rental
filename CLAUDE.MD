Create CLAUDE.md at project root:

# Project: Rango Car Rental — Rental + Resale Platform

## Hard Constraints
- NO payment gateway. All payments offline, in person.
- Admin gates EVERY state transition. Users never write status fields.
- Nothing is publicly visible until admin approves it.

## Spec-Driven Workflow
Read in this order before any code:
1. specs/ — requirements (WHAT)
2. docs/design/ — architecture (HOW)
3. tasks/ — ordered steps (STEPS)

Rules:
- Never implement beyond the current task.
- Never modify specs while implementing.
- Stop after each task for review.

## Stack
MongoDB, Express, React (Vite), Node, TypeScript, Tailwind, Zod, TanStack Query

## Structure
/client  /server  /shared  /specs  /docs/design  /tasks