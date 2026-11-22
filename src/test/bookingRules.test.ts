import { describe, expect, it } from 'vitest';
import type { BookingDuration } from '../shared/types';
import {
  validateBookingInterval,
  type BookingIntervalInput,
} from '../shared/utils/bookingRules';
import { addDaysISO } from '../shared/utils/time';
import { expectFailure, unwrap } from './helpers';

const NOW = new Date(2026, 0, 15, 12, 0, 0, 0);
const TODAY = '2026-01-15';
const TOMORROW = '2026-01-16';

function validate(input: BookingIntervalInput) {
  return validateBookingInterval(input, NOW);
}

describe('validateBookingInterval', () => {
  it('принимает корректный интервал на 90 минут', () => {
    const result = unwrap(
      validate({ date: TOMORROW, startTime: '10:00', duration: 90 }),
    );
    expect(result.date).toBe(TOMORROW);
    expect(result.startTime).toBe('10:00');
    expect(result.endTime).toBe('11:30');
    expect(result.duration).toBe(90);
  });

  it('принимает корректный интервал на 115 минут', () => {
    const result = unwrap(
      validate({ date: TOMORROW, startTime: '10:00', duration: 115 }),
    );
    expect(result.endTime).toBe('11:55');
    expect(result.duration).toBe(115);
  });

  it('разрешает граничные рабочие часы 08:00 и 21:00', () => {
    expect(
      unwrap(validate({ date: TOMORROW, startTime: '08:00', duration: 90 })).endTime,
    ).toBe('09:30');
    expect(
      unwrap(validate({ date: TOMORROW, startTime: '19:05', duration: 115 })).endTime,
    ).toBe('21:00');
  });

  it('отклоняет прошедшую дату', () => {
    expectFailure(
      validate({ date: addDaysISO(TODAY, -1), startTime: '10:00', duration: 90 }),
      'DATE_IN_PAST',
    );
  });

  it('отклоняет прошедшее время сегодняшнего дня', () => {
    expectFailure(
      validate({ date: TODAY, startTime: '10:00', duration: 90 }),
      'DATE_IN_PAST',
    );
  });

  it('принимает будущее время сегодня', () => {
    expect(
      unwrap(validate({ date: TODAY, startTime: '18:00', duration: 90 })).endTime,
    ).toBe('19:30');
  });

  it('отклоняет некорректную дату', () => {
    expectFailure(
      validate({ date: '2026-02-30', startTime: '10:00', duration: 90 }),
      'INVALID_INPUT',
    );
    expectFailure(
      validate({ date: 'завтра', startTime: '10:00', duration: 90 }),
      'INVALID_INPUT',
    );
  });

  it('отклоняет некорректное время', () => {
    expectFailure(
      validate({ date: TOMORROW, startTime: '25:00', duration: 90 }),
      'INVALID_INPUT',
    );
    expectFailure(
      validate({ date: TOMORROW, startTime: '9:00', duration: 90 }),
      'INVALID_INPUT',
    );
  });

  it('отклоняет недопустимую длительность', () => {
    expectFailure(
      validate({ date: TOMORROW, startTime: '10:00', duration: 60 as BookingDuration }),
      'INVALID_DURATION',
    );
    expectFailure(
      validate({ date: TOMORROW, startTime: '10:00', duration: 120 as BookingDuration }),
      'INVALID_DURATION',
    );
  });

  it('отклоняет время до открытия корпуса', () => {
    expectFailure(
      validate({ date: TOMORROW, startTime: '07:00', duration: 90 }),
      'OUTSIDE_WORKING_HOURS',
    );
    expectFailure(
      validate({ date: TOMORROW, startTime: '07:59', duration: 90 }),
      'OUTSIDE_WORKING_HOURS',
    );
  });

  it('отклоняет время после закрытия корпуса', () => {
    expectFailure(
      validate({ date: TOMORROW, startTime: '20:00', duration: 90 }),
      'OUTSIDE_WORKING_HOURS',
    );
    expectFailure(
      validate({ date: TOMORROW, startTime: '21:00', duration: 90 }),
      'OUTSIDE_WORKING_HOURS',
    );
    expectFailure(
      validate({ date: TOMORROW, startTime: '19:06', duration: 115 }),
      'OUTSIDE_WORKING_HOURS',
    );
  });

  it('отклоняет дату за горизонтом 14 дней', () => {
    expect(
      unwrap(validate({ date: addDaysISO(TODAY, 14), startTime: '10:00', duration: 90 }))
        .date,
    ).toBe(addDaysISO(TODAY, 14));

    expectFailure(
      validate({ date: addDaysISO(TODAY, 15), startTime: '10:00', duration: 90 }),
      'EXCEEDS_ADVANCE_LIMIT',
    );
  });

  it('приоритет ошибок: прошедшее время важнее рабочих часов', () => {
    expectFailure(
      validate({ date: TODAY, startTime: '00:00', duration: 90 }),
      'DATE_IN_PAST',
    );
  });
});
