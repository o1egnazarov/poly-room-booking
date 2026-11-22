import { CONFIG } from '../../config/constants';

/** Коды ошибок доменного слоя (docs/03-data-contracts.md). */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'SSO_AUTH_FAILED'
  | 'INVALID_INPUT'
  | 'DATE_IN_PAST'
  | 'INVALID_TIME_RANGE'
  | 'INVALID_DURATION'
  | 'OUTSIDE_WORKING_HOURS'
  | 'EXCEEDS_ADVANCE_LIMIT'
  | 'AUDITORIUM_NOT_FOUND'
  | 'AUDITORIUM_INACTIVE'
  | 'CONFLICT_SCHEDULE'
  | 'CONFLICT_BLOCK'
  | 'CONFLICT_BOOKING'
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_ALREADY_CANCELLED'
  | 'DUPLICATE_ROOM_NUMBER';

export interface ServiceError {
  code: ErrorCode;
  message: string;
}

export interface ServiceSuccess<T> {
  ok: true;
  data: T;
  /** Не блокирующие предупреждения (например, о вытеснении студенческой брони). */
  warnings?: string[];
}

export interface ServiceFailure {
  ok: false;
  error: ServiceError;
}

export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

export function ok<T>(data: T, warnings?: string[]): ServiceSuccess<T> {
  return warnings && warnings.length > 0 ? { ok: true, data, warnings } : { ok: true, data };
}

export function fail(code: ErrorCode, message?: string): ServiceFailure {
  return { ok: false, error: { code, message: message ?? getErrorMessage(code) } };
}

export function isOk<T>(result: ServiceResult<T>): result is ServiceSuccess<T> {
  return result.ok;
}

export function isFailure<T>(result: ServiceResult<T>): result is ServiceFailure {
  return !result.ok;
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Необходимо войти в систему.',
  FORBIDDEN: 'Недостаточно прав для выполнения операции.',
  SSO_AUTH_FAILED:
    'Не удалось выполнить вход через СПбПУ. Проверьте выбранную учётную запись и попробуйте ещё раз.',
  INVALID_INPUT: 'Некорректные данные запроса.',
  DATE_IN_PAST: 'Нельзя забронировать на прошедшее время.',
  INVALID_TIME_RANGE: 'Время окончания должно быть позже времени начала.',
  INVALID_DURATION: `Допустимая продолжительность бронирования — ${CONFIG.ALLOWED_DURATIONS.join(
    ' или ',
  )} минут.`,
  OUTSIDE_WORKING_HOURS: `Время выходит за рабочие часы корпуса ${CONFIG.WORKING_HOURS_START}–${CONFIG.WORKING_HOURS_END}.`,
  EXCEEDS_ADVANCE_LIMIT: `Бронирование возможно не более чем на ${CONFIG.MAX_ADVANCE_BOOKING_DAYS} дней вперёд.`,
  AUDITORIUM_NOT_FOUND: 'Аудитория не найдена.',
  AUDITORIUM_INACTIVE: 'Аудитория недоступна для бронирования.',
  CONFLICT_SCHEDULE: 'Аудитория занята учебным занятием.',
  CONFLICT_BLOCK: 'Аудитория заблокирована администратором.',
  CONFLICT_BOOKING: 'Аудитория уже забронирована на выбранное время.',
  BOOKING_NOT_FOUND: 'Бронирование не найдено.',
  BOOKING_ALREADY_CANCELLED: 'Бронирование уже отменено.',
  DUPLICATE_ROOM_NUMBER: 'Аудитория с таким номером уже существует.',
};

/** Русское сообщение по умолчанию для кода ошибки. */
export function getErrorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code];
}
