# 05. MVP Implementation Plan & Acceptance Criteria

Execute tasks sequentially. Run `npm test` and `npm run build` after each phase.

# PART 1 — Developer 1 (Core, Storage & Domain Services)
## Phase 1: Project Scaffold & Storage Foundation
- [ ] Initialize Vite + React + TypeScript + Tailwind CSS + React Router + Vitest.
- [ ] Create `src/config/constants.ts`, `src/shared/types/`, `src/shared/utils/time.ts` (interval parsing & overlap math).
- [ ] Implement `src/storage/db.ts` (typed `localStorage` wrapper with in-memory async mutex lock).
- [ ] Implement `src/mocks/*.seed.ts` and `src/storage/seed.ts` (dynamic dates relative to today + reset function).

## Phase 2: Modular Monolith Domain Services + Unit Tests
- [ ] Implement `modules/users` (login, mock SSO error, logout, getCurrentUser, RBAC helpers).
- [ ] Implement `modules/availability` (combine `ScheduleSlot`, `RoomBlock`, active `Booking`; check conflict types; manage blocks).
- [ ] Implement `modules/auditoriums` (catalog CRUD, active filtering, search integration with `availability`).
- [ ] Implement `modules/booking` (atomic create with fresh re-check, all time/horizon/working-hours validations, teacher priority preemption, list own, cancel own with ownership check).
- [ ] Implement `modules/administration` (admin RBAC gate + facade over auditoriums, availability blocks, and global bookings).
- [ ] Write Vitest unit tests covering **every** rule in `docs/01-domain-and-rules.md`.

# PART 2 — Developer 2 (React UI & Final Verification)
## Phase 3: React UI Implementation (Russian, Responsive)
- [ ] Build `AuthContext`, protected route wrappers (`RequireAuth`, `RequireAdmin`), and responsive `AppLayout` / `Header`.
- [ ] Build `LoginPage` (`UC-01`).
- [ ] Build `SearchPage` + Booking Confirmation Modal (`UC-02`, `UC-03`).
- [ ] Build `MyBookingsPage` (`UC-04`).
- [ ] Build `AdminPage` with 3 tabs: Аудитории, Все бронирования, Блокировки (`UC-05`).

## Phase 4: Verification & Definition of Done (Acceptance Criteria)
Before finishing, verify all items pass:
1. **AC-01 (Auth & RBAC):** Guest cannot access `/search`, `/my-bookings`, or `/admin`. Student/Teacher cannot access `/admin` or call `administration` service methods. Mock SSO error displays clear Russian message.
2. **AC-02 (Search & Schedule):** Search filters by date, start time, duration (`90` or `115` min), and optional room number. Rooms occupied by `ScheduleSlot`, `RoomBlock`, or active `Booking`, or marked `isActive: false`, do NOT appear as free.
3. **AC-03 (Validation):** Past date/time, outside working hours (`08:00–21:00`), > 14 days ahead, or invalid duration are rejected with clear Russian error messages.
4. **AC-04 (No Double Booking & Teacher Priority):** Concurrent booking attempts on the same room/interval never produce 2 active bookings. A teacher booking over a student's active booking succeeds and atomically cancels the student's booking with `PREEMPTED_BY_TEACHER`. A teacher cannot override a schedule class, admin block, or another teacher's booking.
5. **AC-05 (Own Bookings):** User sees own active bookings and can cancel them; cancelled slot immediately reappears in search. Attempting to cancel another user's booking returns `FORBIDDEN`.
6. **AC-06 (Admin):** Admin can add/edit/deactivate/activate auditoriums, add/remove room blocks, view all bookings, and cancel any active booking. Changes immediately affect search & availability.
7. **AC-07 (Persistence & Build):** Reloading the browser preserves bookings and room edits in `localStorage`. `npm test` and `npm run build` pass with zero TypeScript errors.