import { beforeEach, describe, expect, it } from 'vitest';
import { resetDemoData } from '../storage/seed';
import * as availability from '../modules/availability';
import { readTable } from '../storage/db';
import {
  ACCOUNTS,
  addBooking,
  addSchedule,
  dateFromToday,
  expectFailure,
  makeBooking,
  makeSchedule,
  unwrap,
} from './helpers';

beforeEach(async () => {
  localStorage.clear();
  await resetDemoData();
});

const TOMORROW = dateFromToday(1);

function check(
  auditoriumId: string,
  startTime: string,
  endTime: string,
  date: string = TOMORROW,
) {
  return availability.checkAvailability({ auditoriumId, date, startTime, endTime });
}

describe('availability module', () => {
  it('считает свободную аудиторию доступной', async () => {
    const result = unwrap(await check('room-3-101', '10:00', '11:30'));

    expect(result.available).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.hasScheduleConflict).toBe(false);
    expect(result.hasBlockConflict).toBe(false);
    expect(result.hasBookingConflict).toBe(false);
    expect(result.teacherPreemptable).toBe(false);
  });

  it('находит конфликт с учебным занятием', async () => {
    const result = unwrap(await check('room-3-204', '10:00', '11:30'));

    expect(result.available).toBe(false);
    expect(result.hasScheduleConflict).toBe(true);
    expect(result.scheduleConflicts).toHaveLength(1);
    expect(result.scheduleConflicts[0]?.source).toBe('SCHEDULE');
    expect(result.scheduleConflicts[0]?.title).toBe('Архитектура программных систем');
    expect(result.teacherPreemptable).toBe(false);
  });

  it('находит частичное пересечение с занятием', async () => {
    const result = unwrap(await check('room-3-204', '11:00', '12:30'));
    expect(result.hasScheduleConflict).toBe(true);
  });

  it('не считает смежные интервалы пересечением', async () => {
    const before = unwrap(await check('room-3-204', '08:30', '10:00'));
    expect(before.available).toBe(true);

    const after = unwrap(await check('room-3-204', '11:30', '13:00'));
    expect(after.available).toBe(true);
  });

  it('находит конфликт с блокировкой администратора', async () => {
    const result = unwrap(await check('room-3-204', '16:30', '18:00'));

    expect(result.available).toBe(false);
    expect(result.hasBlockConflict).toBe(true);
    expect(result.blockConflicts[0]?.source).toBe('BLOCK');
    expect(result.blockConflicts[0]?.title).toBe('Техническое обслуживание проектора');
  });

  it('находит конфликт с активной бронью', async () => {
    const result = unwrap(await check('room-3-312', '10:00', '11:30'));

    expect(result.available).toBe(false);
    expect(result.hasBookingConflict).toBe(true);
    expect(result.bookingConflicts[0]?.bookingUserId).toBe(ACCOUNTS.student1);
    expect(result.bookingConflicts[0]?.bookingUserRole).toBe('student');
    expect(result.teacherPreemptable).toBe(true);
  });

  it('игнорирует отменённые брони', async () => {
    const result = unwrap(await check('room-3-220', '14:00', '15:30'));

    expect(result.available).toBe(true);
    expect(result.hasBookingConflict).toBe(false);
  });

  it('объединяет расписание, блокировки и брони в занятые интервалы', async () => {
    await addBooking(
      makeBooking({
        auditoriumId: 'room-3-204',
        date: TOMORROW,
        startTime: '12:00',
        endTime: '13:30',
      }),
    );
    await addBooking(
      makeBooking({
        auditoriumId: 'room-3-204',
        date: TOMORROW,
        startTime: '14:00',
        endTime: '15:30',
        status: 'cancelled',
        cancelReason: 'USER_CANCELLED',
      }),
    );

    const occupied = unwrap(await availability.getOccupiedIntervals('room-3-204', TOMORROW));

    expect(occupied).toHaveLength(3);
    expect(occupied.map((item) => item.source)).toEqual(['SCHEDULE', 'BOOKING', 'BLOCK']);
    expect(occupied.map((item) => item.startTime)).toEqual(['10:00', '12:00', '16:00']);
    // Отменённая бронь 14:00 не попала в занятые интервалы.
    expect(occupied.some((item) => item.startTime === '14:00')).toBe(false);
  });

  it('не позволяет преподавателю вытеснить занятие или блокировку', async () => {
    const schedule = unwrap(await check('room-3-204', '10:00', '11:30'));
    expect(schedule.teacherPreemptable).toBe(false);

    const block = unwrap(await check('room-3-204', '16:30', '18:00'));
    expect(block.teacherPreemptable).toBe(false);
  });

  it('не позволяет преподавателю вытеснить бронь преподавателя', async () => {
    await addBooking(
      makeBooking({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:30',
        userId: ACCOUNTS.teacher1,
        userRole: 'teacher',
        userFullName: 'Смирнов Павел Викторович',
      }),
    );

    const result = unwrap(await check('room-3-210', '09:00', '10:30'));
    expect(result.hasBookingConflict).toBe(true);
    expect(result.teacherPreemptable).toBe(false);
  });

  it('разрешает вытеснение, только если ВСЕ конфликты — студенческие брони', async () => {
    await addBooking(
      makeBooking({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '11:00',
        endTime: '12:30',
      }),
    );
    await addBooking(
      makeBooking({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '11:30',
        endTime: '13:00',
        userId: ACCOUNTS.student2,
      }),
    );

    const studentOnly = unwrap(await check('room-3-210', '11:30', '12:30'));
    expect(studentOnly.teacherPreemptable).toBe(true);
    expect(studentOnly.studentBookingConflicts).toHaveLength(2);

    await addBooking(
      makeBooking({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '12:00',
        endTime: '13:30',
        userId: ACCOUNTS.teacher1,
        userRole: 'teacher',
      }),
    );

    const mixed = unwrap(await check('room-3-210', '12:00', '12:30'));
    expect(mixed.hasBookingConflict).toBe(true);
    expect(mixed.teacherPreemptable).toBe(false);
  });

  it('видит добавленное вручную занятие', async () => {
    await addSchedule(
      makeSchedule({
        auditoriumId: 'room-3-101',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:30',
        subject: 'Тестовое занятие',
      }),
    );

    const result = unwrap(await check('room-3-101', '09:30', '11:00'));
    expect(result.hasScheduleConflict).toBe(true);
  });

  it('валидирует окно проверки', async () => {
    expectFailure(await check('room-3-101', '11:00', '10:00'), 'INVALID_TIME_RANGE');
    expectFailure(await check('room-3-101', '11:00', '11:00'), 'INVALID_TIME_RANGE');
    expectFailure(await check('room-3-101', '10:00', '11:00', 'не-дата'), 'INVALID_INPUT');
    expectFailure(await check('', '10:00', '11:00'), 'INVALID_INPUT');
    expectFailure(await check('room-3-101', '25:00', '26:00'), 'INVALID_INPUT');
    expectFailure(
      await availability.getOccupiedIntervals('room-3-101', '2026-02-30'),
      'INVALID_INPUT',
    );
    expectFailure(await availability.getOccupiedIntervals('', TOMORROW), 'INVALID_INPUT');
  });
});

describe('room blocks CRUD', () => {
  it('возвращает демо-блокировку с фильтрами', async () => {
    const all = unwrap(await availability.listRoomBlocks());
    expect(all).toHaveLength(1);

    expect(unwrap(await availability.listRoomBlocks({ auditoriumId: 'room-3-204' }))).toHaveLength(
      1,
    );
    expect(unwrap(await availability.listRoomBlocks({ auditoriumId: 'room-3-101' }))).toHaveLength(
      0,
    );
    expect(unwrap(await availability.listRoomBlocks({ date: TOMORROW }))).toHaveLength(1);
    expect(unwrap(await availability.listRoomBlocks({ date: dateFromToday(0) }))).toHaveLength(0);
    expect(
      unwrap(
        await availability.listRoomBlocks({
          fromDate: dateFromToday(0),
          toDate: TOMORROW,
        }),
      ),
    ).toHaveLength(1);

    expectFailure(
      await availability.listRoomBlocks({ date: 'not-a-date' }),
      'INVALID_INPUT',
    );
    expectFailure(
      await availability.listRoomBlocks({ fromDate: 'not-a-date' }),
      'INVALID_INPUT',
    );
  });

  it('создаёт, находит и удаляет блокировку', async () => {
    const created = unwrap(
      await availability.createRoomBlock({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:30',
        reason: '  Ремонт  ',
        createdBy: ACCOUNTS.admin1,
      }),
    );

    expect(created.id).toBeTruthy();
    expect(created.reason).toBe('Ремонт');
    expect(created.createdBy).toBe(ACCOUNTS.admin1);
    expect(readTable('blocks')).toHaveLength(2);

    const found = unwrap(await availability.getRoomBlockById(created.id));
    expect(found.id).toBe(created.id);

    const blocked = unwrap(await check('room-3-210', '09:00', '10:30'));
    expect(blocked.hasBlockConflict).toBe(true);

    unwrap(await availability.deleteRoomBlock(created.id));
    expect(readTable('blocks')).toHaveLength(1);
    expect(unwrap(await check('room-3-210', '09:00', '10:30')).available).toBe(true);

    expectFailure(
      await availability.getRoomBlockById(created.id),
      'INVALID_INPUT',
    );
    expectFailure(await availability.deleteRoomBlock(created.id), 'INVALID_INPUT');
  });

  it('валидирует данные блокировки', async () => {
    const base = {
      auditoriumId: 'room-3-210',
      date: TOMORROW,
      startTime: '09:00',
      endTime: '10:30',
      reason: 'Причина',
      createdBy: ACCOUNTS.admin1,
    };

    expectFailure(
      await availability.createRoomBlock({ ...base, reason: '   ' }),
      'INVALID_INPUT',
    );
    expectFailure(
      await availability.createRoomBlock({ ...base, createdBy: '' }),
      'INVALID_INPUT',
    );
    expectFailure(
      await availability.createRoomBlock({ ...base, auditoriumId: '' }),
      'INVALID_INPUT',
    );
    expectFailure(
      await availability.createRoomBlock({ ...base, date: '2026-02-30' }),
      'INVALID_INPUT',
    );
    expectFailure(
      await availability.createRoomBlock({ ...base, startTime: '25:00' }),
      'INVALID_INPUT',
    );
    expectFailure(
      await availability.createRoomBlock({ ...base, startTime: '10:30', endTime: '10:30' }),
      'INVALID_TIME_RANGE',
    );
    expectFailure(
      await availability.createRoomBlock({ ...base, startTime: '11:00', endTime: '10:00' }),
      'INVALID_TIME_RANGE',
    );
    expectFailure(await availability.deleteRoomBlock(''), 'INVALID_INPUT');
  });
});
