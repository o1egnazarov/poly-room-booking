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
- [x] Build `AuthContext`, protected route wrappers (`RequireAuth`, `RequireAdmin`), and responsive `AppLayout` / `Header`.
- [x] Build `LoginPage` (`UC-01`).
- [x] Build `SearchPage` + Booking Confirmation Modal (`UC-02`, `UC-03`).
- [x] Build `MyBookingsPage` (`UC-04`).
- [x] Build `AdminPage` with 3 tabs: Аудитории, Все бронирования, Блокировки (`UC-05`).

## Phase 4: Verification & Definition of Done (Acceptance Criteria)
Before finishing, verify all items pass:
1. **AC-01 (Auth & RBAC):** Guest cannot access `/search`, `/my-bookings`, or `/admin`. Student/Teacher cannot access `/admin` or call `administration` service methods. Mock SSO error displays clear Russian message.
2. **AC-02 (Search & Schedule):** Search filters by date, start time, duration (`90` or `115` min), and optional room number. Rooms occupied by `ScheduleSlot`, `RoomBlock`, or active `Booking`, or marked `isActive: false`, do NOT appear as free.
3. **AC-03 (Validation):** Past date/time, outside working hours (`08:00–21:00`), > 14 days ahead, or invalid duration are rejected with clear Russian error messages.
4. **AC-04 (No Double Booking & Teacher Priority):** Concurrent booking attempts on the same room/interval never produce 2 active bookings. A teacher booking over a student's active booking succeeds and atomically cancels the student's booking with `PREEMPTED_BY_TEACHER`. A teacher cannot override a schedule class, admin block, or another teacher's booking.
5. **AC-05 (Own Bookings):** User sees own active bookings and can cancel them; cancelled slot immediately reappears in search. Attempting to cancel another user's booking returns `FORBIDDEN`.
6. **AC-06 (Admin):** Admin can add/edit/deactivate/activate auditoriums, add/remove room blocks, view all bookings, and cancel any active booking. Changes immediately affect search & availability.
7. **AC-07 (Persistence & Build):** Reloading the browser preserves bookings and room edits in `localStorage`. `npm test` and `npm run build` pass with zero TypeScript errors.

## Результаты проверки PART 2

Реализованы маршруты `/login`, `/search`, `/my-bookings`, `/admin`, контекст
авторизации, ограничения доступа, адаптивный русский интерфейс и подтверждения
изменений. UI использует публичные API `src/modules/*/index.ts`; доменные
сервисы PART 1 не изменены. Сброс демо-данных использует существующий
`resetDemoData` и требует подтверждения в интерфейсе.

| Критерий | Автоматическая проверка |
| --- | --- |
| AC-01 | `ui.test.tsx`: гостевые маршруты, запрет админ-раздела студенту/преподавателю, ошибка SSO, вход/выход. `administration.test.ts`: RBAC всех административных методов. |
| AC-02 | `auditoriums.test.ts`, `availability.test.ts`: фильтры, расписание, блокировки, активные брони, неактивные аудитории. `ui.test.tsx`: поиск и обновление выдачи после бронирования/отмены. |
| AC-03 | `bookingRules.test.ts`, `booking.test.ts`: прошлое время, рабочие часы, горизонт, длительность. `ui.test.tsx`: русские ошибки доменного слоя на странице поиска. |
| AC-04 | `booking.test.ts`: параллельные попытки, атомарное вытеснение и запреты приоритета. `ui.test.tsx`: свежий конфликт при подтверждении, предупреждение преподавателю и причина отмены у студента. |
| AC-05 | `booking.test.ts`: собственные брони и запрет отмены чужих. `ui.test.tsx`: подтверждение отмены и повторное появление аудитории в поиске. |
| AC-06 | `administration.test.ts`: каталог, блокировки, глобальные брони и влияние на поиск. `ui.test.tsx`: создание/редактирование/деактивация аудитории, создание/снятие блокировки, фильтры и отмена чужой брони. |
| AC-07 | `storage.test.ts`, `seed.test.ts`, `ui.test.tsx`: сохранение данных, повторный запуск без перезаписи сида, восстановление сессии, брони и изменений аудитории. Production-сборка проходит без ошибок TypeScript. |

Результат: `npm test` — **147 тестов в 10 файлах**, `npm run build` — успешно.
Интеграционные UI-тесты используют реальные сервисы и localStorage в jsdom.
Повторное монтирование приложения проверяет восстановление данных, но не
заменяет проверку перезагрузки в настоящем браузере. Визуальная проверка
мобильной вёрстки, фокуса нативных диалогов и совместимости Chrome/Safari
в этом окружении не проводилась.
