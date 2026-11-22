import { CONFIG, isAllowedDuration } from '../../config/constants';
import type { BookingDuration } from '../types/domain';
import { fail, ok, type ServiceResult } from '../types/result';
import {
  addMinutes,
  isBeyondAdvanceLimit,
  isPastDateTime,
  isValidDateString,
  isValidTimeString,
  parseTimeToMinutes,
  type ValidatedInterval,
} from './time';

export interface BookingIntervalInput {
  date: string;
  startTime: string;
  duration: BookingDuration;
}

export interface ValidatedBookingInterval extends ValidatedInterval {
  duration: BookingDuration;
}

/**
 * Единая валидация интервала бронирования для поиска и создания брони.
 *
 * Порядок проверок соответствует приоритету сообщений для пользователя:
 * формат -> длительность -> прошлое -> рабочие часы -> горизонт.
 */
export function validateBookingInterval(
  input: BookingIntervalInput,
  now: Date = new Date(),
): ServiceResult<ValidatedBookingInterval> {
  if (!isValidDateString(input.date)) {
    return fail('INVALID_INPUT', 'Некорректная дата. Ожидается формат ГГГГ-ММ-ДД.');
  }
  if (!isValidTimeString(input.startTime)) {
    return fail('INVALID_INPUT', 'Некорректное время начала. Ожидается формат ЧЧ:ММ.');
  }
  if (!isAllowedDuration(input.duration)) {
    return fail('INVALID_DURATION');
  }

  if (isPastDateTime(input.date, input.startTime, now)) {
    return fail('DATE_IN_PAST');
  }

  const startMinutes = parseTimeToMinutes(input.startTime);
  const workingStart = parseTimeToMinutes(CONFIG.WORKING_HOURS_START);
  const workingEnd = parseTimeToMinutes(CONFIG.WORKING_HOURS_END);

  if (startMinutes < workingStart || startMinutes >= workingEnd) {
    return fail('OUTSIDE_WORKING_HOURS');
  }

  const endTime = addMinutes(input.startTime, input.duration);
  const endMinutes = parseTimeToMinutes(endTime);

  if (endMinutes <= startMinutes) {
    return fail('INVALID_TIME_RANGE');
  }
  if (endMinutes > workingEnd) {
    return fail('OUTSIDE_WORKING_HOURS');
  }

  if (isBeyondAdvanceLimit(input.date, now)) {
    return fail('EXCEEDS_ADVANCE_LIMIT');
  }

  return ok({
    date: input.date,
    startTime: input.startTime,
    endTime,
    duration: input.duration,
  });
}
