# PolyRoomBooking — Agent Harness Guide

## 1. Project Overview
**PolyRoomBooking** is a web application for searching and booking auditoriums in Building 3 of SPbPU (3 корпус ФГАОУ ВО СПбПУ, ИКНК) for academic and extracurricular events.

**Current Stage: Frontend-Only MVP**
- There is **no real backend server** yet.
- The React SPA acts as both frontend and local backend: business logic lives in isolated TypeScript domain modules, and state is persisted in `localStorage` with preloaded mock seed data.
- All module methods MUST be `async` (returning `Promise<...>`) so the mock storage layer can later be swapped for a real REST/RPC backend without rewriting UI components.

## 2. Tech Stack (MVP)
- **Framework:** React 18+ with TypeScript (strict mode) + Vite
- **Routing:** React Router v6+
- **Styling:** Tailwind CSS (mobile-first responsive layout; Chrome 131+, Safari 18+)
- **State / Persistence:** LocalStorage repository + React Context / TanStack Query (or custom hooks)
- **Testing:** Vitest + React Testing Library
- **UI Language:** Russian (`ru`) strictly for all user-facing strings, labels, dates, and error messages.

## 3. Repository & Documentation Map
Read the relevant spec before implementing any feature:
1. `docs/01-domain-and-rules.md` — Roles, permissions matrix, hard business invariants, conflict & teacher-priority rules.
2. `docs/02-architecture-mvp.md` — Modular Monolith structure in React, module boundaries, allowed inter-module interfaces, and mock storage design.
3. `docs/03-data-contracts.md` — TypeScript domain models, error codes, validation rules, and seed data schema.
4. `docs/04-use-cases-and-ui.md` — Use Cases (UC-01..UC-05), User Stories (US-01..US-05), routes, screens, and UI states.
5. `docs/05-mvp-tasks-and-acceptance.md` — Phased implementation plan and Definition of Done / Acceptance Criteria.

## 4. Non-Negotiable Agent Rules
1. **Respect Module Boundaries:** Never import internal files of one module from another. Cross-module calls MUST go through each module's public `index.ts` interface defined in `docs/02-architecture-mvp.md`.
2. **Never Trust UI Search State on Booking:** `booking` module MUST re-validate availability via `availability` module right before committing a booking.
3. **Zero Overlapping Active Bookings:** No two `active` bookings (nor an `active` booking and a schedule class / admin block) may overlap in time for the same auditorium.
4. **Enforce RBAC in Domain Layer:** Check user authentication and role (`student` | `teacher` | `admin`) inside module services, not just by hiding UI buttons.
5. **Deterministic Time & Config:** Keep configurable limits (building working hours, max advance booking days) in `src/config/constants.ts`. Never scatter magic numbers.
6. **Tests Required for Core Logic:** Every invariant in `docs/01-domain-and-rules.md` must have unit tests in Vitest before marking a task done.

## 5. Two-Developer Workflow (Token-Splitting Mode)
This project is intentionally split into **two equal parts** so two developers can share AI token usage sequentially:
- **PART 1 (Developer 1 — Core & Mock Backend):** Phase 1 + Phase 2 from `docs/05-mvp-tasks-and-acceptance.md` (scaffold, storage, seed data, all 5 domain modules, and full Vitest unit tests).
- **PART 2 (Developer 2 — UI & Verification):** Phase 3 + Phase 4 from `docs/05-mvp-tasks-and-acceptance.md` (React pages, components, routing, responsive Russian UI, and final acceptance verification).

**Strict Split Rules:**
1. **Work ONLY on the requested part.** If asked to do PART 1, DO NOT build UI pages (`LoginPage`, `SearchPage`, etc.) — leave a minimal placeholder `App.tsx` so `npm run build` succeeds.
2. **Clean Handoff after PART 1:** Before finishing PART 1, verify that all 5 modules export clean, typed public APIs via `src/modules/<name>/index.ts`, all unit tests pass (`npm test`), and the project compiles (`npm run build`).
3. **PART 2 Must Reuse PART 1:** When executing PART 2, do NOT rewrite or duplicate domain logic from PART 1. Call the existing module public APIs from `src/modules/*/index.ts`.