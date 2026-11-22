# 01. Domain Model & Business Invariants

## 1. Roles & Access Control (RBAC)

| Capability | Guest (Unauth) | Student (`student`) | Teacher (`teacher`) | Admin (`admin`) |
| --- | :---: | :---: | :---: | :---: |
| Login (Mock SSO) / Logout | Login only | Logout | Logout | Logout |
| View auditorium catalog | Optional / Read-only | Yes | Yes | Yes |
| Search available auditoriums | No (redirect to login) | Yes | Yes | Yes |
| Create booking | No | Yes | Yes (Priority) | Yes |
| View own active bookings | No | Yes | Yes | Yes |
| Cancel own booking | No | Yes | Yes | Yes |
| Cancel another user's booking | No | **FORBIDDEN** | **FORBIDDEN** | Yes |
| View all bookings (all users) | No | **FORBIDDEN** | **FORBIDDEN** | Yes |
| CRUD / Activate / Deactivate auditoriums | No | **FORBIDDEN** | **FORBIDDEN** | Yes |
| Create / Cancel auditorium time blocks | No | **FORBIDDEN** | **FORBIDDEN** | Yes |

## 2. Time & Scheduling Invariants

1. **Allowed Durations:** Booking duration MUST be strictly `90` or `115` minutes.
2. **Valid Interval:** `endTime` MUST be strictly greater than `startTime` (`endTime = startTime + duration`).
3. **No Past Bookings:** Booking start datetime (`date + startTime`) MUST be strictly in the future relative to current time.
4. **Building Working Hours:** Both `startTime` and `endTime` MUST fall within Building 3 working hours (configured in `src/config/constants.ts`, MVP default: `08:00` – `21:00`).
5. **Advance Booking Horizon:** Booking date MUST NOT exceed `MAX_ADVANCE_BOOKING_DAYS` from today (MVP default: `14` days, configurable in `src/config/constants.ts`).
6. **Overlap Formula:** Two intervals `[A_start, A_end)` and `[B_start, B_end)` on the same `date` and `auditoriumId` overlap iff:
   ```ts
   A_start < B_end && B_start < A_end
   ```
   Back-to-back intervals (e.g., `10:00–11:30` and `11:30–13:00`) do **NOT** overlap.

## 3. Availability & Conflict Rules

An auditorium is **unavailable** on `[startTime, endTime)` if ANY of the following holds:
1. `auditorium.isActive === false` (deactivated by admin).
2. An active **university schedule class** (`ScheduleSlot`) occupies an overlapping interval.
3. An active **admin block** (`RoomBlock`) occupies an overlapping interval.
4. An `active` **booking** (`Booking`) occupies an overlapping interval (subject to Teacher Priority rule below).

Note: Bookings with `status === 'cancelled'` MUST be ignored when computing availability.

## 4. Teacher Priority & Concurrency Rules

- **Hard Invariant:** The system MUST NEVER end up with two overlapping `active` bookings for the same auditorium.
- **Double-Booking Prevention (MVP):** All booking mutations run through a serialized atomic lock/queue in the `booking` service + fresh read from storage before write, preventing race conditions from rapid double-clicks or parallel calls.
- **Teacher Priority Policy:**
  - A `teacher` CANNOT override a university schedule class (`ScheduleSlot`) or an admin block (`RoomBlock`).
  - A `teacher` CANNOT override another `teacher`'s or `admin`'s `active` booking (conflict -> reject with `CONFLICT_BOOKING`).
  - If a `teacher` attempts to book an interval occupied ONLY by one or more `student` `active` bookings:
    - The `teacher`'s booking SUCCEEDS (`status: 'active'`).
    - All conflicting `student` bookings are atomically transitioned to `status: 'cancelled'` with `cancelReason: 'PREEMPTED_BY_TEACHER'` (and `cancelledBy: teacherUserId`).
    - The UI clearly notifies the teacher if student booking(s) were displaced, and the student sees the cancellation reason in their history/bookings view.
  - If a `student` attempts to book an interval occupied by ANY `active` booking (`student`, `teacher`, or `admin`), the request is REJECTED with `CONFLICT_BOOKING`.

## 5. Security, Privacy & NFRs (MVP Context)
- **Personal Data (152-FZ awareness):** Store only minimal mock user fields (`universityId`, `fullName`, `role`, optional `email`) in `localStorage`. Do not log PII to external services.
- **Performance Targets:** Search rendering < 3s (local MVP should be < 100ms); booking creation < 5s (local MVP < 100ms).
- **Browser Compatibility:** Responsive desktop & mobile UI supporting Chrome 131+ and Safari 18+.