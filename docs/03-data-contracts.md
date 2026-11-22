# 03. Data Contracts, Types & Seed Schema

## 1. Core TypeScript Interfaces

```ts
export type Role = 'student' | 'teacher' | 'admin';

export interface User {
  universityId: string;   // e.g., "spbpu-st-1001"
  fullName: string;       // e.g., "Иванов Иван Иванович"
  role: Role;
  email?: string;
}

export interface Auditorium {
  id: string;             // UUID or stable slug e.g., "room-3-201"
  number: string;         // e.g., "3-201" (unique)
  capacity: number;       // positive integer > 0
  equipment: string[];    // e.g., ["Проектор", "Маркерная доска", "ПК (20 шт.)"]
  isActive: boolean;      // deactivated rooms are excluded from search & booking
}

export type BookingDuration = 90 | 115;

export type BookingStatus = 'active' | 'cancelled';

export type CancelReason =
  | 'USER_CANCELLED'
  | 'ADMIN_CANCELLED'
  | 'PREEMPTED_BY_TEACHER';

export interface Booking {
  id: string;
  auditoriumId: string;
  userId: string;         // User.universityId
  userRole: Role;         // Snapshot of creator's role for priority checks
  userFullName: string;   // Denormalized for admin list readability
  date: string;           // ISO date "YYYY-MM-DD"
  startTime: string;      // 24h "HH:MM"
  endTime: string;        // 24h "HH:MM"
  duration: BookingDuration;
  status: BookingStatus;
  createdAt: string;      // ISO timestamp
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: CancelReason;
}

export interface ScheduleSlot {
  id: string;
  auditoriumId: string;
  date: string;           // "YYYY-MM-DD"
  startTime: string;      // "HH:MM"
  endTime: string;        // "HH:MM"
  subject: string;        // e.g., "Архитектура программных систем"
  group?: string;         // e.g., "5130904/60101"
  lecturer?: string;
}

export interface RoomBlock {
  id: string;
  auditoriumId: string;
  date: string;           // "YYYY-MM-DD"
  startTime: string;      // "HH:MM"
  endTime: string;        // "HH:MM"
  reason: string;         // e.g., "Техническое обслуживание проектора"
  createdBy: string;      // Admin universityId
  createdAt: string;
}
```

## 2. Search & Service Result Contracts

```ts
export interface SearchAuditoriumsInput {
  date: string;                // "YYYY-MM-DD" (required)
  startTime: string;           // "HH:MM" (required)
  duration: BookingDuration;   // 90 | 115 (required)
  roomNumber?: string;         // optional substring or exact match
  minCapacity?: number;        // optional bonus filter
  equipment?: string[];        // optional bonus filter
}

export interface CreateBookingInput {
  auditoriumId: string;
  date: string;
  startTime: string;
  duration: BookingDuration;
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'SSO_AUTH_FAILED'
  | 'INVALID_INPUT'
  | 'DATE_IN_PAST'
  | 'INVALID_TIME_RANGE'
  | 'INVALID_DURATION'
  | 'OUTSIDE_WORKING_HOURS'
  | 'EXCEEDS_ADVANCE_LIMIT'
  | 'AUDITORIUM_NOT_FOUND'
  | 'AUDITORIUM_INACTIVE'
  | 'CONFLICT_SCHEDULE'
  | 'CONFLICT_BLOCK'
  | 'CONFLICT_BOOKING'
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_ALREADY_CANCELLED'
  | 'DUPLICATE_ROOM_NUMBER';

export type ServiceResult<T> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: { code: ErrorCode; message: string } };
```

## 3. Configuration Constants (`src/config/constants.ts`)

```ts
export const CONFIG = {
  BUILDING_NAME: '3 корпус ФГАОУ ВО СПбПУ',
  WORKING_HOURS_START: '08:00',
  WORKING_HOURS_END: '21:00',
  ALLOWED_DURATIONS: [90, 115] as const,
  MAX_ADVANCE_BOOKING_DAYS: 14,
} as const;
```

## 4. Seed Data Requirements (`src/mocks/`)
To make the MVP immediately testable and demonstrable:
- **Users:** At least 4 mock accounts:
  - 2 Students (`student-1`, `student-2`) — needed to test ownership checks (`UC-04`) and conflict rejection (`UC-03`).
  - 1 Teacher (`teacher-1`) — needed to test teacher priority preemption (`UC-03`).
  - 1 Admin (`admin-1`) — needed to test catalog CRUD, room blocks, and global bookings (`UC-05`).
- **Auditoriums:** At least 6–8 rooms in Building 3 (e.g., `3-101`, `3-204`, `3-210`, `3-305`, `3-312`, `3-401`) with varied capacities (15 to 120) and equipment (`Проектор`, `Интерактивная доска`, `ПК`, `Микрофон`, `Маркерная доска`), including 1 deactivated room to verify exclusion.
- **Schedule:** Generate relative to **today / tomorrow / +2 days** dynamically in `seed.ts` (so seed classes never go stale in the past!). Include standard SPbPU class slots (e.g., `10:00–11:30`, `12:00–13:30`, `14:00–15:30`).
- **Bookings:** Seed 1–2 active student bookings for tomorrow so Teacher Priority and Admin Cancellation can be demonstrated immediately.