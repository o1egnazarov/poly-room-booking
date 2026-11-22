import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../config/constants';
import type { Auditorium } from '../shared/types';
import {
  AsyncMutex,
  clearDatabaseSync,
  readTable,
  withTransaction,
  writeTable,
} from '../storage/db';
import { resetDemoData } from '../storage/seed';

beforeEach(async () => {
  localStorage.clear();
  await resetDemoData();
});

describe('typed localStorage DB', () => {
  it('возвращает пустые таблицы при отсутствии ключей', () => {
    clearDatabaseSync();

    expect(readTable('users')).toEqual([]);
    expect(readTable('auditoriums')).toEqual([]);
    expect(readTable('bookings')).toEqual([]);
    expect(readTable('schedule')).toEqual([]);
    expect(readTable('blocks')).toEqual([]);
    expect(readTable('session')).toBeNull();
  });

  it('сохраняет и читает таблицы', () => {
    const users = readTable('users');
    writeTable('users', users);
    expect(readTable('users')).toEqual(users);

    writeTable('session', { universityId: 'spbpu-st-1001', startedAt: '2026-01-15T10:00:00.000Z' });
    expect(readTable('session')).toEqual({
      universityId: 'spbpu-st-1001',
      startedAt: '2026-01-15T10:00:00.000Z',
    });

    writeTable('session', null);
    expect(readTable('session')).toBeNull();
  });

  it('не падает на повреждённых данных и возвращает пустую таблицу', () => {
    localStorage.setItem(STORAGE_KEYS.bookings, '{not-json');
    localStorage.setItem(STORAGE_KEYS.users, '{"not":"an-array"}');
    localStorage.setItem(STORAGE_KEYS.session, 'not-json');

    expect(readTable('bookings')).toEqual([]);
    expect(readTable('users')).toEqual([]);
    expect(readTable('session')).toBeNull();
  });

  it('обновляет таблицу внутри транзакции', () => {
    const room = readTable('auditoriums')[0];

    const updated = withTransaction((tx) =>
      tx.update('auditoriums', (rooms) =>
        rooms.map((candidate) =>
          candidate.id === room.id ? { ...candidate, capacity: 999 } : candidate,
        ),
      ),
    );

    return updated.then(() => {
      expect(readTable('auditoriums').find((candidate) => candidate.id === room.id)?.capacity).toBe(
        999,
      );
    });
  });

  it('выполняет транзакции строго последовательно (FIFO)', async () => {
    const events: string[] = [];

    const first = withTransaction(async () => {
      events.push('first-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push('first-end');
    });

    const second = withTransaction(() => {
      events.push('second-start');
    });

    await Promise.all([first, second]);

    expect(events).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('не теряет обновления при параллельных транзакциях', async () => {
    const baseline = readTable('auditoriums').length;
    const roomTemplate = readTable('auditoriums')[0];

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        withTransaction((tx) => {
          const rooms = tx.read('auditoriums');
          const room: Auditorium = {
            ...roomTemplate,
            id: `room-concurrent-${index}`,
            number: `9-${index}`,
          };
          tx.write('auditoriums', [...rooms, room]);
        }),
      ),
    );

    const rooms = readTable('auditoriums');
    expect(rooms).toHaveLength(baseline + 20);
    expect(new Set(rooms.map((room) => room.id)).size).toBe(rooms.length);
  });

  it('очищает все ключи приложения', () => {
    clearDatabaseSync();

    for (const key of Object.values(STORAGE_KEYS)) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  it('мьютекс освобождается после ошибки задачи', async () => {
    await expect(
      withTransaction(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(withTransaction(() => 42)).resolves.toBe(42);
  });

  it('runExclusive не блокирует очередь после исключения', async () => {
    const mutex = new AsyncMutex();

    await expect(
      mutex.runExclusive(() => {
        throw new Error('failure');
      }),
    ).rejects.toThrow('failure');

    await expect(mutex.runExclusive(() => 'ok')).resolves.toBe('ok');
  });
});
