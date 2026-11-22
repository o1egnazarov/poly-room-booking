import { CONFIG } from '../../config/constants';

/**
 * Утилиты для работы с датами и временем.
 *
 * Соглашения MVP:
 * - дата — строка "YYYY-MM-DD" в локальном календаре;
 * - время — строка "HH:MM" (24 часа), интервалы полуоткрытые: [start, end);
 * - все вычисления выполняются в локальной таймзоне, без UTC-сдвигов
 *   (JSON.stringify(new Date("2026-01-01")) даёт UTC-полночь и ломает календарь).
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = 86_400_000;

export interface TimeInterval {
  startTime: string;
  endTime: string;
}

export interface ValidatedInterval extends TimeInterval {
  /** Дата в формате "YYYY-MM-DD". */
  date: string;
}

export function isValidTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

/** "HH:MM" -> минуты от начала суток. Бросает ошибку для некорректной строки. */
export function parseTimeToMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time);
  if (!match) {
    throw new Error(`Некорректное время: "${time}". Ожидается формат HH:MM.`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Минуты от начала суток -> "HH:MM" (значение нормализуется по суткам). */
export function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((Math.trunc(totalMinutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

/** Добавляет минуты ко времени "HH:MM". */
export function addMinutes(time: string, amount: number): string {
  return formatMinutesToTime(parseTimeToMinutes(time) + amount);
}

/** Конец интервала при заданной длительности в минутах. */
export function computeEndTime(startTime: string, durationMinutes: number): string {
  return addMinutes(startTime, durationMinutes);
}

/** Разница в минутах между endTime и startTime (может быть отрицательной). */
export function minutesBetween(startTime: string, endTime: string): number {
  return parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime);
}

/**
 * Формула пересечения из docs/01-domain-and-rules.md:
 * A_start < B_end && B_start < A_end.
 * Смежные интервалы (10:00–11:30 и 11:30–13:00) не пересекаются.
 */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return (
    parseTimeToMinutes(a.startTime) < parseTimeToMinutes(b.endTime) &&
    parseTimeToMinutes(b.startTime) < parseTimeToMinutes(a.endTime)
  );
}

/** Полностью ли интервал помещается в другой (границы включительно). */
export function intervalFitsWithin(interval: TimeInterval, container: TimeInterval): boolean {
  return (
    parseTimeToMinutes(interval.startTime) >= parseTimeToMinutes(container.startTime) &&
    parseTimeToMinutes(interval.endTime) <= parseTimeToMinutes(container.endTime)
  );
}

/** Локальная полночь для "YYYY-MM-DD". Бросает ошибку для некорректной даты. */
export function parseLocalDate(date: string): Date {
  if (!isValidDateString(date)) {
    throw new Error(`Некорректная дата: "${date}". Ожидается формат YYYY-MM-DD.`);
  }
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Date -> "YYYY-MM-DD" по локальному календарю. */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

/** Текущее локальное время "HH:MM". */
export function nowTimeString(now: Date = new Date()): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/** Прибавляет календарные дни к ISO-дате (корректно переживает DST). */
export function addDaysISO(date: string, days: number): string {
  const local = parseLocalDate(date);
  local.setDate(local.getDate() + days);
  return toISODate(local);
}

/** Локальная дата-время из даты и времени. */
export function dateTimeToLocalDate(date: string, time: string): Date {
  const local = parseLocalDate(date);
  const totalMinutes = parseTimeToMinutes(time);
  local.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return local;
}

/**
 * Начало бронирования уже наступило? По правилу MVP старт должен быть
 * СТРОГО в будущем, поэтому равенство текущему моменту считается прошлым.
 */
export function isPastDateTime(date: string, time: string, now: Date = new Date()): boolean {
  return dateTimeToLocalDate(date, time).getTime() <= now.getTime();
}

/** Разница в календарных днях: to - from (для "2026-01-10", "2026-01-01" -> 9). */
export function calendarDaysBetween(fromDate: string, toDate: string): number {
  if (!isValidDateString(fromDate) || !isValidDateString(toDate)) {
    throw new Error('calendarDaysBetween: ожидаются даты в формате YYYY-MM-DD.');
  }
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDate);
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / MS_PER_DAY);
}

/** Дата дальше горизонта MAX_ADVANCE_BOOKING_DAYS относительно today. */
export function isBeyondAdvanceLimit(
  date: string,
  now: Date = new Date(),
  maxAdvanceDays: number = CONFIG.MAX_ADVANCE_BOOKING_DAYS,
): boolean {
  return calendarDaysBetween(todayISO(now), date) > maxAdvanceDays;
}

/** Оба времени входят в рабочие часы корпуса (границы включительно). */
export function isWithinWorkingHours(startTime: string, endTime: string): boolean {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  return start >= parseTimeToMinutes(CONFIG.WORKING_HOURS_START) && end <= parseTimeToMinutes(CONFIG.WORKING_HOURS_END);
}
