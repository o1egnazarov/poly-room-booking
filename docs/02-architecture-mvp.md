# 02. Architecture — Modular Monolith (Frontend-Only MVP)

## 1. Architectural Pattern
The system follows a **Modular Monolith** architecture with **5 isolated domain modules** sharing a single persistence layer (in MVP: `localStorage` repository acting as the Database).

```text
+-------------------------------------------------------------------+
|                         React UI Layer                            |
|  (Pages, Components, Forms, Route Guards — calls Module Public APIs)
+-------------------------------------------------------------------+
        |              |              |              |         |
        v              v              v              v         v
+------------+  +------------+  +-----------+  +----------+  +------+
|   users    |  | auditoriums|  |  booking  |  |availab.  |  |admin |
| (PublicAPI)|  | (PublicAPI)|  |(PublicAPI)|  |(PublicAPI)| |(Pub.)|
+------------+  +------------+  +-----------+  +----------+  +------+
        \              |              |              |         /
         +-------------+--------------+--------------+--------+
                                      |
                                      v
                 +-----------------------------------------+
                 |   Local Storage DB + Mock Seed Layer    |
                 |  (src/storage/db.ts + src/mocks/*.ts)   |
                 +-----------------------------------------+
```

## 2. Directory Structure

```text
src/
├── config/
│   └── constants.ts           # Working hours, durations [90, 115], max advance days
├── shared/
│   ├── types/                 # Common Result<T, E>, ErrorCode, Time helpers
│   └── utils/                 # Date/time parsing, overlap math, ID generation
├── storage/
│   ├── db.ts                  # Typed localStorage adapter + atomic write lock
│   └── seed.ts                # Initial seed loader + "Reset Demo Data" helper
├── mocks/
│   ├── users.seed.ts          # Mock SPbPU accounts (student, teacher, admin)
│   ├── auditoriums.seed.ts    # Building 3 rooms (number, capacity, equipment)
│   ├── schedule.seed.ts       # Imported university schedule slots
│   └── bookings.seed.ts       # Sample initial bookings
├── modules/
│   ├── users/
│   │   ├── index.ts           # Public API ONLY
│   │   ├── types.ts
│   │   └── users.service.ts
│   ├── auditoriums/
│   │   ├── index.ts           # Public API ONLY
│   │   ├── types.ts
│   │   └── auditoriums.service.ts
│   ├── availability/
│   │   ├── index.ts           # Public API ONLY
│   │   ├── types.ts
│   │   └── availability.service.ts
│   ├── booking/
│   │   ├── index.ts           # Public API ONLY
│   │   ├── types.ts
│   │   └── booking.service.ts
│   └── administration/
│       ├── index.ts           # Public API ONLY
│       ├── types.ts
│       └── administration.service.ts
└── ui/
    ├── context/               # AuthContext (wraps users module)
    ├── components/            # Reusable UI primitives (Header, RoomCard, Modal)
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── SearchPage.tsx
    │   ├── MyBookingsPage.tsx
    │   └── AdminPage.tsx
    └── App.tsx
```

## 3. Module Responsibilities & Allowed Interfaces

Strictly enforce these inter-module contracts (derived from system spec):

| Module | Responsibility | Allowed Collaborators & Interaction |
| --- | --- | --- |
| **`users`** | Mock university SSO auth, session management, role & permission lookup. | Called by `booking` (verify user exists & permissions) and `administration` (verify `admin` role). |
| **`auditoriums`** | Auditorium catalog CRUD, active/inactive status, metadata filtering. | Calls `availability` (to check availability when searching); called by `booking` (get room details) and `administration` (create/edit/toggle/delete rooms). |
| **`availability`** | Single source of truth for occupied & free intervals (combines `ScheduleSlot`, `RoomBlock`, and active `Booking`). | Called by `auditoriums` (search), `booking` (pre-save re-check & occupied slots), and `administration` (create/cancel `RoomBlock`). |
| **`booking`** | Core booking lifecycle: create (with re-check + teacher priority + atomic lock), list own, cancel own. | Calls `users`, `auditoriums`, `availability`. Called by `administration` (list all bookings, admin cancel). |
| **`administration`** | Facade for all admin-only workflows (room management, room blocks, global booking oversight & cancellation). | Calls `users` (RBAC check), `auditoriums`, `availability`, `booking`. |

## 4. Mock Backend & Persistence Design (MVP)
- **Storage Keys:** Prefix all keys with `polyroombooking_v1_` (e.g., `polyroombooking_v1_bookings`, `polyroombooking_v1_auditoriums`, `polyroombooking_v1_schedule`, `polyroombooking_v1_blocks`, `polyroombooking_v1_session`).
- **Auto-Seeding:** On first app boot (when keys are absent), `seed.ts` populates realistic Building 3 SPbPU data.
- **Demo Controls (MVP Dev UX):** Provide a discreet "Сбросить демо-данные" (Reset demo data) button in the header/footer or login screen so testers/reviewers can easily restore initial state.
- **Simulated Mock SSO:** On `/login`, provide a quick-select list of demo university accounts (e.g., 2 Students, 1 Teacher, 1 Admin) + an option to simulate an SSO failure (to test `UC-01` error path).
- **Backend Migration Readiness:** Every method in `*.service.ts` returns `Promise<ServiceResult<T>>`. UI components never touch `localStorage` directly.