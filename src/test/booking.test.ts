import { beforeEach, describe, expect, it } from 'vitest';
import type { BookingDuration } from '../shared/types';
import { readTable } from '../storage/db';
import { resetDemoData } from '../storage/seed';
import * as auditoriums from '../modules/auditoriums';
import * as availability from '../modules/availability';
import * as booking from '../modules/booking';
import { logout } from '../modules/users';
import {
  ACCOUNTS,
  addBooking,
  addUser,
  dateFromToday,
  expectFailure,
  loginAs,
  loginAsAdmin,
  loginAsStudent1,
  loginAsStudent2,
  loginAsTeacher,
  makeBooking,
  unwrap,
} from './helpers';

beforeEach(async () => {
  localStorage.clear();
  await resetDemoData();
});

const TOMORROW = dateFromToday(1);

function makeInput(
  auditoriumId: string,
  startTime: string,
  duration: BookingDuration = 90,
  date: string = TOMORROW,
) {
  return { auditoriumId, date, startTime, duration };
}

function activeBookingsFor(roomId: string, date: string, startTime: string) {
  return readTable('bookings').filter(
    (candidate) =>
      candidate.auditoriumId === roomId &&
      candidate.date === date &&
      candidate.startTime === startTime &&
      candidate.status === 'active',
  );
}

describe('createBooking: happy path', () => {
  it('создаёт активную бронь с корректным снимком пользователя', async () => {
    await loginAsStudent1();

    const result = unwrap(
      await booking.createBooking(makeInput('room-3-210', '09:00')),
    );

    expect(result.preemptedBookings).toEqual([]);
    expect(result.booking.id).toBeTruthy();
    expect(result.booking.auditoriumId).toBe('room-3-210');
    expect(result.booking.userId).toBe(ACCOUNTS.student1);
    expect(result.booking.userRole).toBe('student');
    expect(result.booking.userFullName).toBe('Иванов Иван Иванович');
    expect(result.booking.date).toBe(TOMORROW);
    expect(result.booking.startTime).toBe('09:00');
    expect(result.booking.endTime).toBe('10:30');
    expect(result.booking.duration).toBe(90);
    expect(result.booking.status).toBe('active');
    expect(result.booking.createdAt).toBeTruthy();

    const stored = readTable('bookings').find((item) => item.id === result.booking.id);
    expect(stored).toEqual(result.booking);
  });

  it('принимает длительность 115 минут', async () => {
    await loginAsStudent1();
    const result = unwrap(
      await booking.createBooking(makeInput('room-3-210', '09:00', 115)),
    );

    expect(result.booking.endTime).toBe('10:55');
    expect(result.booking.duration).toBe(115);
  });

  it('разрешает смежные брони разных пользователей', async () => {
    await loginAsStudent1();
    const first = unwrap(await booking.createBooking(makeInput('room-3-210', '09:00')));

    await loginAsStudent2();
    const second = unwrap(await booking.createBooking(makeInput('room-3-210', '10:30')));

    expect(first.booking.endTime).toBe('10:30');
    expect(second.booking.startTime).toBe('10:30');
    expect(activeBookingsFor('room-3-210', TOMORROW, '09:00')).toHaveLength(1);
    expect(activeBookingsFor('room-3-210', TOMORROW, '10:30')).toHaveLength(1);
  });

  it('видит собственную бронь в списке активных', async () => {
    await loginAsStudent1();
    const created = unwrap(
      await booking.createBooking(makeInput('room-3-210', '09:00')),
    );

    const own = unwrap(await booking.listOwnBookings());
    expect(own.active.map((item) => item.id)).toContain(created.booking.id);
  });
});

describe('createBooking: конкуренция и приоритет преподавателя', () => {
  it('не даёт двум студентам забронировать один интервал', async () => {
    await loginAsStudent1();
    unwrap(await booking.createBooking(makeInput('room-3-210', '09:00')));

    await loginAsStudent2();
    const second = await booking.createBooking(makeInput('room-3-210', '09:00'));

    expectFailure(second, 'CONFLICT_BOOKING');
    expect(activeBookingsFor('room-3-210', TOMORROW, '09:00')).toHaveLength(1);
  });

  it('сериализует параллельные попытки: ровно одна активная бронь', async () => {
    await loginAsStudent1();

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        booking.createBooking(makeInput('room-3-210', '11:00')),
      ),
    );

    const successes = attempts.filter((attempt) => attempt.ok);
    const failures = attempts.filter((attempt) => !attempt.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);
    for (const failure of failures) {
      if (!failure.ok) {
        expect(failure.error.code).toBe('CONFLICT_BOOKING');
      }
    }

    const active = readTable('bookings').filter(
      (candidate) =>
        candidate.auditoriumId === 'room-3-210' &&
        candidate.date === TOMORROW &&
        candidate.status === 'active',
    );
    expect(active).toHaveLength(1);
  });

  it('преподаватель вытесняет студенческую бронь с причиной PREEMPTED_BY_TEACHER', async () => {
    await loginAsStudent1();
    const studentBooking = unwrap(
      await booking.createBooking(makeInput('room-3-210', '09:00')),
    ).booking;

    await loginAsTeacher();
    const response = await booking.createBooking(makeInput('room-3-210', '09:00'));
    if (!response.ok) {
      throw new Error(`Ожидался успех, получено ${response.error.code}`);
    }
    const result = response.data;

    expect(result.booking.status).toBe('active');
    expect(result.booking.userRole).toBe('teacher');
    expect(result.preemptedBookings).toHaveLength(1);
    expect(result.preemptedBookings[0]?.id).toBe(studentBooking.id);
    expect(result.preemptedBookings[0]?.status).toBe('cancelled');
    expect(result.preemptedBookings[0]?.cancelReason).toBe('PREEMPTED_BY_TEACHER');
    expect(result.preemptedBookings[0]?.cancelledBy).toBe(ACCOUNTS.teacher1);
    expect(response.warnings?.[0]).toContain('приоритетом преподавателя');

    const stored = readTable('bookings').find((item) => item.id === studentBooking.id);
    expect(stored?.status).toBe('cancelled');

    const check = unwrap(
      await availability.checkAvailability({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:30',
      }),
    );
    expect(check.available).toBe(false);
    expect(check.bookingConflicts[0]?.bookingUserRole).toBe('teacher');

    // Студент видит причину отмены в истории.
    await loginAsStudent1();
    const own = unwrap(await booking.listOwnBookings());
    expect(own.active.map((item) => item.id)).not.toContain(studentBooking.id);
    expect(own.cancelled.find((item) => item.id === studentBooking.id)?.cancelReason).toBe(
      'PREEMPTED_BY_TEACHER',
    );
  });

  it('преподаватель вытесняет сразу несколько студенческих броней', async () => {
    await addBooking(
      makeBooking({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:30',
      }),
    );
    await addBooking(
      makeBooking({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '10:30',
        endTime: '12:00',
        userId: ACCOUNTS.student2,
      }),
    );

    await loginAsTeacher();
    const result = unwrap(
      await booking.createBooking(makeInput('room-3-210', '09:15')),
    );

    expect(result.preemptedBookings).toHaveLength(2);
    expect(
      readTable('bookings').filter(
        (item) => item.auditoriumId === 'room-3-210' && item.status === 'active',
      ),
    ).toHaveLength(1);
  });

  it('преподаватель не может вытеснить другого преподавателя', async () => {
    await addUser({
      universityId: 'spbpu-tc-2002',
      fullName: 'Орлов Олег Олегович',
      role: 'teacher',
    });

    await loginAsTeacher();
    unwrap(await booking.createBooking(makeInput('room-3-210', '11:00')));

    await loginAs('spbpu-tc-2002');
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '11:00')),
      'CONFLICT_BOOKING',
    );
    expect(activeBookingsFor('room-3-210', TOMORROW, '11:00')).toHaveLength(1);
  });

  it('преподаватель не может вытеснить бронь администратора', async () => {
    await loginAsAdmin();
    unwrap(await booking.createBooking(makeInput('room-3-210', '11:00')));

    await loginAsTeacher();
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '11:00')),
      'CONFLICT_BOOKING',
    );
  });

  it('студент не может вытеснить бронь преподавателя', async () => {
    await loginAsTeacher();
    unwrap(await booking.createBooking(makeInput('room-3-210', '11:00')));

    await loginAsStudent1();
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '11:00')),
      'CONFLICT_BOOKING',
    );
  });

  it('администратор не получает приоритет преподавателя', async () => {
    await loginAsStudent1();
    unwrap(await booking.createBooking(makeInput('room-3-210', '11:00')));

    await loginAsAdmin();
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '11:00')),
      'CONFLICT_BOOKING',
    );
  });

  it('преподаватель не может вытеснить учебное занятие', async () => {
    await loginAsTeacher();
    expectFailure(
      await booking.createBooking(makeInput('room-3-204', '10:00')),
      'CONFLICT_SCHEDULE',
    );
  });

  it('преподаватель не может вытеснить блокировку администратора', async () => {
    await loginAsTeacher();
    expectFailure(
      await booking.createBooking(makeInput('room-3-204', '16:00')),
      'CONFLICT_BLOCK',
    );
  });

  it('преподаватель не может дважды занять один и тот же интервал', async () => {
    await loginAsTeacher();
    unwrap(await booking.createBooking(makeInput('room-3-210', '11:00')));

    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '11:00')),
      'CONFLICT_BOOKING',
    );
  });
});

describe('createBooking: валидация', () => {
  beforeEach(async () => {
    await loginAsStudent1();
  });

  it('требует аутентификацию', async () => {
    await logout();

    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '09:00')),
      'UNAUTHENTICATED',
    );
  });

  it('отклоняет прошедшую дату и прошедшее время', async () => {
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '09:00', 90, dateFromToday(-1))),
      'DATE_IN_PAST',
    );
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '00:00', 90, dateFromToday(0))),
      'DATE_IN_PAST',
    );
  });

  it('отклоняет время вне рабочих часов', async () => {
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '07:00')),
      'OUTSIDE_WORKING_HOURS',
    );
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '20:00')),
      'OUTSIDE_WORKING_HOURS',
    );
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '21:00')),
      'OUTSIDE_WORKING_HOURS',
    );
  });

  it('отклоняет дату за горизонтом 14 дней', async () => {
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '09:00', 90, dateFromToday(15))),
      'EXCEEDS_ADVANCE_LIMIT',
    );
  });

  it('разрешает запись ровно на 14-й день вперёд', async () => {
    const result = unwrap(
      await booking.createBooking(makeInput('room-3-210', '09:00', 90, dateFromToday(14))),
    );
    expect(result.booking.date).toBe(dateFromToday(14));
  });

  it('отклоняет недопустимую длительность', async () => {
    expectFailure(
      await booking.createBooking(
        makeInput('room-3-210', '09:00', 60 as BookingDuration),
      ),
      'INVALID_DURATION',
    );
    expectFailure(
      await booking.createBooking(
        makeInput('room-3-210', '09:00', 120 as BookingDuration),
      ),
      'INVALID_DURATION',
    );
  });

  it('отклоняет некорректные дату, время и пустую аудиторию', async () => {
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '09:00', 90, '2026-02-30')),
      'INVALID_INPUT',
    );
    expectFailure(
      await booking.createBooking(makeInput('room-3-210', '25:00')),
      'INVALID_INPUT',
    );
    expectFailure(
      await booking.createBooking(makeInput('', '09:00')),
      'INVALID_INPUT',
    );
  });

  it('отклоняет несуществующую и деактивированную аудиторию', async () => {
    expectFailure(
      await booking.createBooking(makeInput('room-missing', '09:00')),
      'AUDITORIUM_NOT_FOUND',
    );
    expectFailure(
      await booking.createBooking(makeInput('room-3-118', '09:00')),
      'AUDITORIUM_INACTIVE',
    );
  });

  it('отклоняет бронь поверх занятия и блокировки', async () => {
    expectFailure(
      await booking.createBooking(makeInput('room-3-204', '10:00')),
      'CONFLICT_SCHEDULE',
    );
    expectFailure(
      await booking.createBooking(makeInput('room-3-204', '16:00')),
      'CONFLICT_BLOCK',
    );
  });
});

describe('listOwnBookings и cancelOwnBooking', () => {
  it('показывает только брони текущего пользователя и делит их на активные и историю', async () => {
    await loginAsStudent1();
    const own = unwrap(await booking.listOwnBookings());

    expect(own.active.map((item) => item.id)).toContain('booking-seed-1');
    expect(own.active.every((item) => item.userId === ACCOUNTS.student1)).toBe(true);
    expect(own.cancelled.map((item) => item.id)).toContain('booking-seed-3');
    expect(own.cancelled.find((item) => item.id === 'booking-seed-3')?.cancelReason).toBe(
      'USER_CANCELLED',
    );

    await loginAsStudent2();
    const other = unwrap(await booking.listOwnBookings());
    expect(other.active.map((item) => item.id)).toContain('booking-seed-2');
    expect(other.active.map((item) => item.id)).not.toContain('booking-seed-1');
  });

  it('отменяет собственную бронь и сразу освобождает слот', async () => {
    await loginAsStudent1();
    const cancelled = unwrap(await booking.cancelOwnBooking('booking-seed-1'));

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('USER_CANCELLED');
    expect(cancelled.cancelledBy).toBe(ACCOUNTS.student1);
    expect(cancelled.cancelledAt).toBeTruthy();

    const own = unwrap(await booking.listOwnBookings());
    expect(own.active.map((item) => item.id)).not.toContain('booking-seed-1');
    expect(own.cancelled.map((item) => item.id)).toContain('booking-seed-1');

    const check = unwrap(
      await availability.checkAvailability({
        auditoriumId: 'room-3-312',
        date: TOMORROW,
        startTime: '10:00',
        endTime: '11:30',
      }),
    );
    expect(check.available).toBe(true);

    const available = unwrap(
      await auditoriums.searchAvailable({
        date: TOMORROW,
        startTime: '10:00',
        duration: 90,
      }),
    );
    expect(available.map((result) => result.auditorium.number)).toContain('3-312');
  });

  it('запрещает отменять чужую бронь', async () => {
    await loginAsStudent2();

    expectFailure(await booking.cancelOwnBooking('booking-seed-1'), 'FORBIDDEN');
    expect(readTable('bookings').find((item) => item.id === 'booking-seed-1')?.status).toBe(
      'active',
    );

    // Даже уже отменённую чужую бронь нельзя отменить.
    expectFailure(await booking.cancelOwnBooking('booking-seed-3'), 'FORBIDDEN');
  });

  it('не даёт отменить бронь дважды и сообщает об отсутствии', async () => {
    await loginAsStudent1();
    unwrap(await booking.cancelOwnBooking('booking-seed-1'));

    expectFailure(
      await booking.cancelOwnBooking('booking-seed-1'),
      'BOOKING_ALREADY_CANCELLED',
    );
    expectFailure(await booking.cancelOwnBooking('booking-missing'), 'BOOKING_NOT_FOUND');
    expectFailure(await booking.cancelOwnBooking(''), 'INVALID_INPUT');
  });

  it('требует аутентификацию для просмотра и отмены', async () => {
    expectFailure(await booking.listOwnBookings(), 'UNAUTHENTICATED');
    expectFailure(await booking.cancelOwnBooking('booking-seed-1'), 'UNAUTHENTICATED');
  });

  it('отменённая по приоритету бронь не отменяется повторно владельцем', async () => {
    await loginAsStudent1();
    unwrap(await booking.createBooking(makeInput('room-3-210', '09:00')));

    await loginAsTeacher();
    unwrap(await booking.createBooking(makeInput('room-3-210', '09:00')));

    await loginAsStudent1();
    const own = unwrap(await booking.listOwnBookings());
    const preemptedId = own.cancelled.find(
      (item) => item.cancelReason === 'PREEMPTED_BY_TEACHER',
    )?.id;

    expect(preemptedId).toBeTruthy();
    expectFailure(
      await booking.cancelOwnBooking(preemptedId as string),
      'BOOKING_ALREADY_CANCELLED',
    );
  });
});

describe('admin booking operations (RBAC в домене)', () => {
  it('студент и преподаватель не могут смотреть все брони или отменять их', async () => {
    await loginAsStudent1();
    expectFailure(await booking.listAllBookings(), 'FORBIDDEN');
    expectFailure(
      await booking.cancelBookingByAdmin('booking-seed-1'),
      'FORBIDDEN',
    );

    await loginAsTeacher();
    expectFailure(await booking.listAllBookings(), 'FORBIDDEN');
    expectFailure(
      await booking.cancelBookingByAdmin('booking-seed-1'),
      'FORBIDDEN',
    );
  });

  it('администратор видит все брони и отменяет любую активную', async () => {
    await loginAsAdmin();

    const all = unwrap(await booking.listAllBookings());
    expect(all).toHaveLength(3);
    expect(all.map((item) => item.userId)).toEqual(
      expect.arrayContaining([ACCOUNTS.student1, ACCOUNTS.student2]),
    );

    const cancelled = unwrap(await booking.cancelBookingByAdmin('booking-seed-1'));
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('ADMIN_CANCELLED');
    expect(cancelled.cancelledBy).toBe(ACCOUNTS.admin1);

    expectFailure(
      await booking.cancelBookingByAdmin('booking-seed-1'),
      'BOOKING_ALREADY_CANCELLED',
    );
    expectFailure(
      await booking.cancelBookingByAdmin('booking-missing'),
      'BOOKING_NOT_FOUND',
    );
  });

  it('фильтрует все брони по статусу, аудитории и дате', async () => {
    await loginAsAdmin();

    expect(unwrap(await booking.listAllBookings({ status: 'active' }))).toHaveLength(2);
    expect(unwrap(await booking.listAllBookings({ status: 'cancelled' }))).toHaveLength(1);
    expect(
      unwrap(await booking.listAllBookings({ auditoriumId: 'room-3-312' })),
    ).toHaveLength(1);
    expect(unwrap(await booking.listAllBookings({ date: TOMORROW }))).toHaveLength(3);
    expect(unwrap(await booking.listAllBookings({ userId: ACCOUNTS.student2 }))).toHaveLength(1);
    expectFailure(
      await booking.listAllBookings({ date: 'not-a-date' }),
      'INVALID_INPUT',
    );
  });
});
