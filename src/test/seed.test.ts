import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCOUNT_IDS } from '../mocks';
import type { Role } from '../shared/types';
import { addDaysISO, todayISO } from '../shared/utils/time';
import { clearDatabaseSync, readTable, writeTable } from '../storage/db';
import {
  ensureSeeded,
  isSeeded,
  resetDemoData,
} from '../storage/seed';
import * as usersService from '../modules/users';
import { unwrap } from './helpers';

beforeEach(async () => {
  localStorage.clear();
  await resetDemoData();
});

describe('seed data', () => {
  it('создаёт 4 демо-аккаунта по матрице ролей', () => {
    const users = readTable('users');
    const roles = users.map((user) => user.role);

    expect(users).toHaveLength(4);
    expect(roles.filter((role) => role === 'student')).toHaveLength(2);
    expect(roles.filter((role) => role === 'teacher')).toHaveLength(1);
    expect(roles.filter((role) => role === 'admin')).toHaveLength(1);
    expect(users.map((user) => user.universityId)).toEqual(
      expect.arrayContaining(Object.values(DEMO_ACCOUNT_IDS)),
    );
  });

  it('создаёт 8 аудиторий, из них 1 деактивированную', () => {
    const auditoriums = readTable('auditoriums');
    const inactive = auditoriums.filter((room) => !room.isActive);

    expect(auditoriums).toHaveLength(8);
    expect(inactive).toHaveLength(1);
    expect(inactive[0]?.number).toBe('3-118');
    expect(new Set(auditoriums.map((room) => room.number)).size).toBe(8);

    for (const room of auditoriums) {
      expect(room.capacity).toBeGreaterThan(0);
      expect(Number.isInteger(room.capacity)).toBe(true);
      expect(Array.isArray(room.equipment)).toBe(true);
      expect(room.number.trim().length).toBeGreaterThan(0);
    }
  });

  it('генерирует расписание относительно сегодняшней даты', () => {
    const today = todayISO();
    const schedule = readTable('schedule');

    expect(schedule.length).toBeGreaterThanOrEqual(3);
    for (const slot of schedule) {
      expect(slot.date >= today).toBe(true);
      expect(['10:00', '12:00', '14:00', '18:00']).toContain(slot.startTime);
    }

    const dates = schedule.map((slot) => slot.date);
    expect(dates).toContain(addDaysISO(today, 1));
    expect(dates).toContain(addDaysISO(today, 2));
  });

  it('создаёт 2 активные студенческие брони на завтра и 1 отменённую', () => {
    const bookings = readTable('bookings');
    const active = bookings.filter((booking) => booking.status === 'active');
    const cancelled = bookings.filter((booking) => booking.status === 'cancelled');

    expect(active).toHaveLength(2);
    expect(active.every((booking) => booking.date === addDaysISO(todayISO(), 1))).toBe(true);
    expect(active.every((booking) => booking.userRole === 'student')).toBe(true);
    expect(new Set(active.map((booking) => booking.userId))).toEqual(
      new Set([DEMO_ACCOUNT_IDS.student1, DEMO_ACCOUNT_IDS.student2]),
    );

    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]?.cancelReason).toBe('USER_CANCELLED');
  });

  it('создаёт демонстрационную блокировку аудитории на завтра', () => {
    const blocks = readTable('blocks');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.auditoriumId).toBe('room-3-204');
    expect(blocks[0]?.date).toBe(addDaysISO(todayISO(), 1));
    expect(blocks[0]?.createdBy).toBe(DEMO_ACCOUNT_IDS.admin1);
  });

  it('маркер сида выставлен, повторный ensureSeeded не перезаписывает данные', () => {
    expect(isSeeded()).toBe(true);

    writeTable('auditoriums', []);
    expect(ensureSeeded()).toBe(false);
    expect(readTable('auditoriums')).toEqual([]);

    return resetDemoData().then(() => {
      expect(readTable('auditoriums')).toHaveLength(8);
      expect(ensureSeeded()).toBe(false);
    });
  });

  it('ensureSeeded заполняет пустое хранилище', () => {
    clearDatabaseSync();
    expect(isSeeded()).toBe(false);

    expect(ensureSeeded()).toBe(true);
    expect(isSeeded()).toBe(true);
    expect(readTable('users')).toHaveLength(4);
    expect(readTable('auditoriums')).toHaveLength(8);
  });

  it('сброс демо-данных завершает сессию и восстанавливает исходное состояние', async () => {
    await usersService.login({ universityId: DEMO_ACCOUNT_IDS.student1 });
    expect(unwrap(await usersService.getCurrentUser())).not.toBeNull();

    writeTable('auditoriums', []);
    writeTable('bookings', []);

    await resetDemoData();

    expect(unwrap(await usersService.getCurrentUser())).toBeNull();
    expect(readTable('auditoriums')).toHaveLength(8);
    expect(readTable('bookings')).toHaveLength(3);
  });

  it('все роли в сиде валидны', () => {
    const validRoles: Role[] = ['student', 'teacher', 'admin'];
    for (const user of readTable('users')) {
      expect(validRoles).toContain(user.role);
      expect(user.fullName.trim().length).toBeGreaterThan(0);
    }
  });
});
