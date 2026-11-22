import { SEED_VERSION, STORAGE_KEYS } from '../config/constants';
import {
  createAuditoriumsSeed,
  createBlocksSeed,
  createBookingsSeed,
  createScheduleSeed,
  createUsersSeed,
} from '../mocks';
import { clearDatabaseSync, readTable, withTransaction, writeTable } from './db';

/**
 * Записывает все демо-таблицы. Предполагается, что вызывающий код уже очистил
 * хранилище и/или удерживает транзакционный мьютекс.
 */
function writeSeedTables(now: Date): void {
  writeTable('users', createUsersSeed());
  writeTable('auditoriums', createAuditoriumsSeed());
  writeTable('schedule', createScheduleSeed(now));
  writeTable('blocks', createBlocksSeed(now));
  writeTable('bookings', createBookingsSeed(now));
  writeTable('session', null);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.seedVersion, String(SEED_VERSION));
  }
}

/** Полная замена демо-данных (сбрасывает сессию и пользовательские изменения). */
export function seedDemoData(now: Date = new Date()): void {
  clearDatabaseSync();
  writeSeedTables(now);
}

/**
 * Загружает сид при первом запуске приложения или после смены версии сида.
 * Возвращает true, если данные были записаны.
 */
export function ensureSeeded(now: Date = new Date()): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  const marker = localStorage.getItem(STORAGE_KEYS.seedVersion);
  const hasUsers = readTable('users').length > 0;

  if (marker === String(SEED_VERSION) && hasUsers) {
    return false;
  }

  seedDemoData(now);
  return true;
}

export function isSeeded(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }
  return (
    localStorage.getItem(STORAGE_KEYS.seedVersion) === String(SEED_VERSION) &&
    readTable('users').length > 0
  );
}

/**
 * «Сбросить демо-данные»: атомарно очищает БД и заново загружает сид.
 * Используется кнопкой в UI и тестами для изоляции.
 */
export async function resetDemoData(now: Date = new Date()): Promise<void> {
  await withTransaction(() => {
    clearDatabaseSync();
    writeSeedTables(now);
  });
}
