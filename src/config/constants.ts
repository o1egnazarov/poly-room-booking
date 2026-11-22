import type { BookingDuration } from '../shared/types/domain';

/**
 * Единая точка конфигурации MVP.
 *
 * Все настраиваемые ограничения (рабочие часы, допустимые длительности,
 * горизонт бронирования) живут здесь — в сервисах не должно быть магических чисел.
 */
export const CONFIG = {
  BUILDING_NAME: '3 корпус ФГАОУ ВО СПбПУ',
  WORKING_HOURS_START: '08:00',
  WORKING_HOURS_END: '21:00',
  ALLOWED_DURATIONS: [90, 115] as const,
  MAX_ADVANCE_BOOKING_DAYS: 14,
} as const;

/** Префикс всех ключей localStorage (см. docs/02-architecture-mvp.md). */
export const STORAGE_KEY_PREFIX = 'polyroombooking_v1_';

/**
 * Ключи хранилища. `seedVersion` — служебный маркер, а не таблица домена:
 * он позволяет понять, что демо-данные уже загружены (или устарели).
 */
export const STORAGE_KEYS = {
  users: `${STORAGE_KEY_PREFIX}users`,
  auditoriums: `${STORAGE_KEY_PREFIX}auditoriums`,
  schedule: `${STORAGE_KEY_PREFIX}schedule`,
  blocks: `${STORAGE_KEY_PREFIX}blocks`,
  bookings: `${STORAGE_KEY_PREFIX}bookings`,
  session: `${STORAGE_KEY_PREFIX}session`,
  seedVersion: `${STORAGE_KEY_PREFIX}seed_version`,
} as const;

/** Версия сида: увеличивается при несовместимом изменении демо-данных. */
export const SEED_VERSION = 1;

export function isAllowedDuration(value: number): value is BookingDuration {
  return (CONFIG.ALLOWED_DURATIONS as readonly number[]).includes(value);
}
