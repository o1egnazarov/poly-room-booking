import { beforeEach, describe, expect, it } from 'vitest';
import type { ServiceResult } from '../shared/types';
import { resetDemoData } from '../storage/seed';
import * as administration from '../modules/administration';
import * as auditoriums from '../modules/auditoriums';
import * as booking from '../modules/booking';
import {
  ACCOUNTS,
  dateFromToday,
  expectFailure,
  loginAsAdmin,
  loginAsStudent1,
  loginAsTeacher,
  unwrap,
} from './helpers';

beforeEach(async () => {
  localStorage.clear();
  await resetDemoData();
});

const TOMORROW = dateFromToday(1);

const adminOperations: Array<() => Promise<ServiceResult<unknown>>> = [
  () => administration.getAuditoriums(),
  () =>
    administration.createAuditorium({
      number: '3-999',
      capacity: 40,
      equipment: [],
    }),
  () => administration.updateAuditorium('room-3-101', { capacity: 100 }),
  () => administration.setAuditoriumActive('room-3-101', false),
  () => administration.deleteAuditorium('room-3-101'),
  () => administration.getRoomBlocks(),
  () =>
    administration.createRoomBlock({
      auditoriumId: 'room-3-210',
      date: TOMORROW,
      startTime: '09:00',
      endTime: '10:30',
      reason: 'Тест',
    }),
  () => administration.deleteRoomBlock('block-seed-1'),
  () => administration.getAllBookings(),
  () => administration.cancelAnyBooking('booking-seed-1'),
];

describe('administration RBAC gate', () => {
  it('запрещает все админ-операции гостю', async () => {
    for (const operation of adminOperations) {
      expectFailure(await operation(), 'UNAUTHENTICATED');
    }
  });

  it('запрещает все админ-операции студенту', async () => {
    await loginAsStudent1();
    for (const operation of adminOperations) {
      expectFailure(await operation(), 'FORBIDDEN');
    }
  });

  it('запрещает админ-операции преподавателю', async () => {
    await loginAsTeacher();

    expectFailure(await administration.getAuditoriums(), 'FORBIDDEN');
    expectFailure(
      await administration.createRoomBlock({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:30',
        reason: 'Тест',
      }),
      'FORBIDDEN',
    );
    expectFailure(await administration.getAllBookings(), 'FORBIDDEN');
    expectFailure(
      await administration.cancelAnyBooking('booking-seed-1'),
      'FORBIDDEN',
    );
  });
});

describe('administration: аудитории', () => {
  beforeEach(async () => {
    await loginAsAdmin();
  });

  it('видит все аудитории, включая деактивированную', async () => {
    const rooms = unwrap(await administration.getAuditoriums());

    expect(rooms).toHaveLength(8);
    expect(rooms.find((room) => room.number === '3-118')?.isActive).toBe(false);
  });

  it('создаёт, редактирует и удаляет аудиторию, влияя на публичный каталог', async () => {
    const created = unwrap(
      await administration.createAuditorium({
        number: '3-999',
        capacity: 40,
        equipment: ['Проектор'],
      }),
    );
    expect(unwrap(await auditoriums.getCatalog()).map((room) => room.number)).toContain('3-999');

    const updated = unwrap(
      await administration.updateAuditorium(created.id, {
        capacity: 55,
        equipment: ['Проектор', 'Микрофон'],
      }),
    );
    expect(updated.capacity).toBe(55);
    expect(updated.equipment).toHaveLength(2);

    expectFailure(
      await administration.createAuditorium({
        number: '3-101',
        capacity: 10,
        equipment: [],
      }),
      'DUPLICATE_ROOM_NUMBER',
    );

    unwrap(await administration.deleteAuditorium(created.id));
    expect(unwrap(await auditoriums.getCatalog()).map((room) => room.number)).not.toContain(
      '3-999',
    );
    expectFailure(
      await administration.deleteAuditorium(created.id),
      'AUDITORIUM_NOT_FOUND',
    );
  });

  it('деактивирует аудиторию, убирая её из поиска', async () => {
    unwrap(await administration.setAuditoriumActive('room-3-101', false));

    const results = unwrap(
      await auditoriums.searchAvailable({
        date: TOMORROW,
        startTime: '09:00',
        duration: 90,
      }),
    );
    expect(results.map((result) => result.auditorium.number)).not.toContain('3-101');
    expect(unwrap(await auditoriums.getCatalog()).map((room) => room.number)).not.toContain(
      '3-101',
    );

    unwrap(await administration.setAuditoriumActive('room-3-101', true));
    const after = unwrap(
      await auditoriums.searchAvailable({
        date: TOMORROW,
        startTime: '09:00',
        duration: 90,
      }),
    );
    expect(after.map((result) => result.auditorium.number)).toContain('3-101');
  });
});

describe('administration: блокировки', () => {
  beforeEach(async () => {
    await loginAsAdmin();
  });

  it('создаёт блокировку, которая сразу исключает комнату из поиска', async () => {
    const before = unwrap(
      await auditoriums.searchAvailable({
        date: TOMORROW,
        startTime: '09:00',
        duration: 90,
      }),
    );
    expect(before.map((result) => result.auditorium.number)).toContain('3-210');

    const block = unwrap(
      await administration.createRoomBlock({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:30',
        reason: 'Техническое обслуживание',
      }),
    );
    expect(block.createdBy).toBe(ACCOUNTS.admin1);

    const during = unwrap(
      await auditoriums.searchAvailable({
        date: TOMORROW,
        startTime: '09:00',
        duration: 90,
      }),
    );
    expect(during.map((result) => result.auditorium.number)).not.toContain('3-210');

    const blocks = unwrap(await administration.getRoomBlocks({ auditoriumId: 'room-3-210' }));
    expect(blocks.map((item) => item.id)).toContain(block.id);

    unwrap(await administration.deleteRoomBlock(block.id));

    const after = unwrap(
      await auditoriums.searchAvailable({
        date: TOMORROW,
        startTime: '09:00',
        duration: 90,
      }),
    );
    expect(after.map((result) => result.auditorium.number)).toContain('3-210');
  });

  it('валидирует блокировку и существование аудитории', async () => {
    expectFailure(
      await administration.createRoomBlock({
        auditoriumId: 'room-missing',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:30',
        reason: 'Тест',
      }),
      'AUDITORIUM_NOT_FOUND',
    );
    expectFailure(
      await administration.createRoomBlock({
        auditoriumId: 'room-3-210',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:30',
        reason: '   ',
      }),
      'INVALID_INPUT',
    );
    expectFailure(
      await administration.deleteRoomBlock('block-missing'),
      'INVALID_INPUT',
    );
  });
});

describe('administration: все бронирования', () => {
  beforeEach(async () => {
    await loginAsAdmin();
  });

  it('видит все брони пользователей и фильтрует их', async () => {
    const all = unwrap(await administration.getAllBookings());
    expect(all).toHaveLength(3);
    expect(all.map((item) => item.userId)).toEqual(
      expect.arrayContaining([ACCOUNTS.student1, ACCOUNTS.student2]),
    );

    expect(unwrap(await administration.getAllBookings({ status: 'active' }))).toHaveLength(2);
    expect(
      unwrap(await administration.getAllBookings({ auditoriumId: 'room-3-312' })),
    ).toHaveLength(1);
  });

  it('отменяет любую активную бронь и отражает это у студента', async () => {
    const cancelled = unwrap(await administration.cancelAnyBooking('booking-seed-1'));

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('ADMIN_CANCELLED');
    expect(cancelled.cancelledBy).toBe(ACCOUNTS.admin1);

    expectFailure(
      await administration.cancelAnyBooking('booking-seed-1'),
      'BOOKING_ALREADY_CANCELLED',
    );
    expectFailure(
      await administration.cancelAnyBooking('booking-missing'),
      'BOOKING_NOT_FOUND',
    );

    await loginAsStudent1();
    const own = unwrap(await booking.listOwnBookings());
    expect(own.cancelled.find((item) => item.id === 'booking-seed-1')?.cancelReason).toBe(
      'ADMIN_CANCELLED',
    );
    expect(own.active.map((item) => item.id)).not.toContain('booking-seed-1');
  });

  it('изменения администратора сразу видны в поиске', async () => {
    unwrap(await administration.cancelAnyBooking('booking-seed-1'));

    const results = unwrap(
      await auditoriums.searchAvailable({
        date: TOMORROW,
        startTime: '10:00',
        duration: 90,
      }),
    );
    expect(results.map((result) => result.auditorium.number)).toContain('3-312');
  });
});
