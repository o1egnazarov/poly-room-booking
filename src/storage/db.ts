import { STORAGE_KEYS } from '../config/constants';
import type {
  Auditorium,
  Booking,
  RoomBlock,
  ScheduleSlot,
  Session,
  User,
} from '../shared/types/domain';

/**
 * Схема моковой БД. Каждая таблица лежит под отдельным ключом localStorage,
 * чтобы данные было легко инспектировать и сбрасывать.
 */
export interface DatabaseSchema {
  users: User[];
  auditoriums: Auditorium[];
  schedule: ScheduleSlot[];
  blocks: RoomBlock[];
  bookings: Booking[];
  session: Session | null;
}

export type TableName = keyof DatabaseSchema;

const TABLE_STORAGE_KEYS: { readonly [K in TableName]: string } = {
  users: STORAGE_KEYS.users,
  auditoriums: STORAGE_KEYS.auditoriums,
  schedule: STORAGE_KEYS.schedule,
  blocks: STORAGE_KEYS.blocks,
  bookings: STORAGE_KEYS.bookings,
  session: STORAGE_KEYS.session,
};

function getStorage(): Storage {
  if (typeof localStorage === 'undefined') {
    throw new Error(
      'localStorage недоступен. Моковая БД PolyRoomBooking работает только в браузере или jsdom.',
    );
  }
  return localStorage;
}

function emptyTableValue<K extends TableName>(table: K): DatabaseSchema[K] {
  return (table === 'session' ? null : []) as unknown as DatabaseSchema[K];
}

/**
 * Чтение таблицы. При повреждённых данных возвращается пустая таблица,
 * чтобы приложение не падало на старте.
 */
export function readTable<K extends TableName>(table: K): DatabaseSchema[K] {
  const raw = getStorage().getItem(TABLE_STORAGE_KEYS[table]);
  if (raw === null) {
    return emptyTableValue(table);
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (table === 'session') {
      if (parsed === null) {
        return null as DatabaseSchema[K];
      }
      if (typeof parsed === 'object') {
        return parsed as DatabaseSchema[K];
      }
      return emptyTableValue(table);
    }
    if (!Array.isArray(parsed)) {
      return emptyTableValue(table);
    }
    return parsed as DatabaseSchema[K];
  } catch {
    return emptyTableValue(table);
  }
}

export function writeTable<K extends TableName>(table: K, value: DatabaseSchema[K]): void {
  getStorage().setItem(TABLE_STORAGE_KEYS[table], JSON.stringify(value));
}

export function removeTable(table: TableName): void {
  getStorage().removeItem(TABLE_STORAGE_KEYS[table]);
}

/** Синхронно удаляет все ключи приложения (включая маркер сида). */
export function clearDatabaseSync(): void {
  const storage = getStorage();
  for (const key of Object.values(STORAGE_KEYS)) {
    storage.removeItem(key);
  }
}

/**
 * Асинхронный FIFO-мьютекс.
 *
 * Нужен, чтобы все мутации бронирований выполнялись последовательно:
 * два «одновременных» вызова createBooking не прочитают одно и то же
 * состояние и не создадут две пересекающиеся активные брони.
 */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previous = this.tail;
    this.tail = previous.then(() => current);

    return previous.then(async () => {
      try {
        return await operation();
      } finally {
        release();
      }
    });
  }
}

const databaseMutex = new AsyncMutex();

export interface DatabaseTransaction {
  read<K extends TableName>(table: K): DatabaseSchema[K];
  write<K extends TableName>(table: K, value: DatabaseSchema[K]): void;
  update<K extends TableName>(
    table: K,
    updater: (current: DatabaseSchema[K]) => DatabaseSchema[K],
  ): DatabaseSchema[K];
}

function createTransaction(): DatabaseTransaction {
  return {
    read: readTable,
    write: writeTable,
    update(table, updater) {
      const next = updater(readTable(table));
      writeTable(table, next);
      return next;
    },
  };
}

/**
 * Атомарная транзакция: все операции выполняются под глобальным мьютексом,
 * а чтения внутри транзакции всегда идут из localStorage (fresh read).
 *
 * ВАЖНО: нельзя вызывать withTransaction изнутри другой транзакции —
 * мьютекс не реентерабельный.
 */
export function withTransaction<T>(
  operation: (tx: DatabaseTransaction) => T | Promise<T>,
): Promise<T> {
  return databaseMutex.runExclusive(() => operation(createTransaction()));
}
