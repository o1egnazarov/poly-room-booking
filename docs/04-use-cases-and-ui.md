# 04. Use Cases, User Stories & UI Specification

All user-facing UI text MUST be in **Russian**. Layout MUST be responsive (mobile + desktop).

## 1. Routes & Navigation

| Route | Access | Purpose |
| --- | --- | --- |
| `/login` | Public | Mock University SSO login & demo account picker (`UC-01`) |
| `/search` (default `/` when auth) | `student`, `teacher`, `admin` | Search & book available auditoriums (`UC-02`, `UC-03`, `US-01`, `US-02`, `US-03`) |
| `/my-bookings` | `student`, `teacher`, `admin` | View & cancel own bookings (`UC-04`, `US-04`) |
| `/admin` | `admin` only | Manage auditoriums, room blocks, and all bookings (`UC-05`, `US-05`) |

Header navigation shows:
- App logo/title (`PolyRoomBooking`)
- Links: «Поиск аудиторий», «Мои бронирования», and (for `admin` only) «Администрирование»
- Current user badge (Full Name + Role pill) + «Выйти» button
- Subtle «Сбросить демо-данные» button (MVP helper)

## 2. Detailed Use Cases & UI Flows

### UC-01: Авторизация пользователя в системе
- **Screen:** `/login`
- **Flow:**
  1. User selects a mock university account (Student 1, Student 2, Teacher, Admin) and clicks «Войти через СПбПУ (демо)».
  2. Include a test button/toggle «Симулировать ошибку аутентификации» to verify failed SSO handling (`SSO_AUTH_FAILED` -> display error alert, deny access).
  3. On success: store session, redirect to `/search`.
  4. Clicking «Выйти» clears session and redirects to `/login`; protected routes become inaccessible.

### UC-02: Поиск свободной аудитории (covers US-01, US-02)
- **Screen:** `/search`
- **Controls:**
  - Дата (`date` input, default: tomorrow)
  - Время начала (`time` input or time-slot selector within `08:00–21:00`)
  - Продолжительность (segmented control / radio: `90 мин` | `115 мин`)
  - Номер аудитории (optional text search)
  - Optional MVP UX filters: мин. вместимость, оборудование
- **Results:**
  - Cards/table of available active auditoriums showing: **Номер**, **Вместимость (мест)**, **Оборудование (badges)**, and button **«Забронировать»**.
  - **Teacher UX hint:** If logged in as `teacher`, optionally show rooms occupied *only* by students with a badge «Занято студентом (приоритет преподавателя)» so the teacher can invoke priority booking.
  - **Empty State:** «На выбранное время свободных аудиторий не найдено. Попробуйте изменить параметры поиска.»
  - **Validation Error State:** Clear inline Russian error for past date, outside working hours, or beyond advance limit without leaving the page.

### UC-03: Создание бронирования аудитории (covers US-03)
- **Trigger:** Clicking «Забронировать» on a room card in `/search` -> Confirmation modal showing Room, Date, Start–End time, and (if teacher preempting a student) a warning notice.
- **Behavior:**
  - Calls `bookingService.createBooking(...)` which re-validates availability fresh from storage.
  - On success: toast/banner «Бронирование успешно создано», refresh search results immediately.
  - On failure: display exact Russian reason (e.g., «Аудитория занята учебным занятием», «Аудитория уже забронирована», «Нельзя забронировать на прошедшее время», «Время выходит за рабочие часы корпуса 08:00–21:00»).

### UC-04: Просмотр и отмена собственных бронирований (covers US-04)
- **Screen:** `/my-bookings`
- **Display:**
  - Primary section: **Активные бронирования** (Auditorium number, Date, Start–End time, Equipment summary, button «Отменить бронь»).
  - Secondary collapsible/tabbed section: **Отменённые / История** (shows `cancelReason` in Russian, e.g., «Отменено пользователем», «Отменено администратором», «Отменено в пользу преподавателя»).
- **Behavior:**
  - Clicking «Отменить бронь» asks for confirmation -> calls `bookingService.cancelOwnBooking(bookingId)` -> updates list -> room immediately becomes available in `/search`.

### UC-05: Администрирование аудиторного фонда и бронирований (covers US-05)
- **Screen:** `/admin` (non-admins redirected or shown 403 «Доступ запрещён»)
- **Tabs:**
  1. **Аудитории:** Table of all rooms (active & inactive). Actions: «Добавить аудиторию», «Редактировать» (number, capacity, equipment tags), toggle «Активировать / Деактивировать», «Удалить».
  2. **Все бронирования:** Table of all bookings (active & cancelled) with filter by status/room/date, showing user name, role, room, date, interval, status. Action: «Отменить» (admin cancel for active bookings).
  3. **Блокировки аудиторий:** List of active `RoomBlock` entries + form to create a new block (room, date, startTime, endTime, reason) and button to remove a block.