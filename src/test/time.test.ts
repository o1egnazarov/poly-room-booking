import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  addMinutes,
  calendarDaysBetween,
  computeEndTime,
  dateTimeToLocalDate,
  formatMinutesToTime,
  intervalFitsWithin,
  intervalsOverlap,
  isBeyondAdvanceLimit,
  isPastDateTime,
  isValidDateString,
  isValidTimeString,
  isWithinWorkingHours,
  minutesBetween,
  nowTimeString,
  parseLocalDate,
  parseTimeToMinutes,
  toISODate,
  todayISO,
} from '../shared/utils/time';

describe('time utils', () => {
  it('парсит и форматирует время', () => {
    expect(parseTimeToMinutes('08:00')).toBe(480);
    expect(parseTimeToMinutes('21:00')).toBe(1260);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
    expect(formatMinutesToTime(480)).toBe('08:00');
    expect(formatMinutesToTime(1260)).toBe('21:00');
    expect(formatMinutesToTime(1439)).toBe('23:59');
    expect(formatMinutesToTime(-30)).toBe('23:30');
    expect(formatMinutesToTime(1470)).toBe('00:30');
  });

  it('бросает ошибку на некорректном времени', () => {
    expect(() => parseTimeToMinutes('8:00')).toThrow();
    expect(() => parseTimeToMinutes('24:00')).toThrow();
    expect(() => parseTimeToMinutes('12:60')).toThrow();
    expect(() => parseTimeToMinutes('')).toThrow();
  });

  it('добавляет минуты и считает конец интервала', () => {
    expect(addMinutes('10:00', 90)).toBe('11:30');
    expect(addMinutes('10:00', 115)).toBe('11:55');
    expect(addMinutes('23:30', 60)).toBe('00:30');
    expect(computeEndTime('19:05', 115)).toBe('21:00');
    expect(minutesBetween('10:00', '11:30')).toBe(90);
    expect(minutesBetween('11:30', '10:00')).toBe(-90);
  });

  it('применяет формулу пересечения интервалов', () => {
    const base = { startTime: '10:00', endTime: '11:30' };

    expect(intervalsOverlap(base, { startTime: '11:00', endTime: '12:00' })).toBe(true);
    expect(intervalsOverlap(base, { startTime: '09:00', endTime: '10:30' })).toBe(true);
    expect(intervalsOverlap(base, { startTime: '09:00', endTime: '12:00' })).toBe(true);
    expect(intervalsOverlap(base, { startTime: '10:15', endTime: '11:00' })).toBe(true);
    expect(intervalsOverlap(base, { startTime: '10:00', endTime: '11:30' })).toBe(true);

    // Смежные интервалы не пересекаются (docs/01-domain-and-rules.md, п. 2.6).
    expect(intervalsOverlap(base, { startTime: '11:30', endTime: '13:00' })).toBe(false);
    expect(intervalsOverlap(base, { startTime: '08:30', endTime: '10:00' })).toBe(false);
    expect(intervalsOverlap(base, { startTime: '12:00', endTime: '13:00' })).toBe(false);
  });

  it('проверяет вложенность интервала', () => {
    const container = { startTime: '08:00', endTime: '21:00' };
    expect(intervalsOverlap(container, container)).toBe(true);
    expect(intervalFitsWithin({ startTime: '10:00', endTime: '11:30' }, container)).toBe(true);
    expect(intervalFitsWithin({ startTime: '08:00', endTime: '21:00' }, container)).toBe(true);
    expect(intervalFitsWithin({ startTime: '07:59', endTime: '10:00' }, container)).toBe(false);
    expect(intervalFitsWithin({ startTime: '20:00', endTime: '21:30' }, container)).toBe(false);
  });

  it('валидирует даты в формате YYYY-MM-DD', () => {
    expect(isValidDateString('2026-01-15')).toBe(true);
    expect(isValidDateString('2024-02-29')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-00-10')).toBe(false);
    expect(isValidDateString('15.01.2026')).toBe(false);
    expect(isValidDateString('2026-1-5')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString(undefined)).toBe(false);
  });

  it('валидирует время в формате HH:MM', () => {
    expect(isValidTimeString('08:00')).toBe(true);
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
    expect(isValidTimeString('8:00')).toBe(false);
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('12:60')).toBe(false);
    expect(isValidTimeString(null)).toBe(false);
  });

  it('переводит локальные даты без UTC-сдвига', () => {
    expect(toISODate(parseLocalDate('2026-01-15'))).toBe('2026-01-15');
    expect(parseLocalDate('2026-01-15').getHours()).toBe(0);
    expect(parseLocalDate('2026-01-15').getDate()).toBe(15);
    expect(() => parseLocalDate('2026-02-30')).toThrow();
  });

  it('прибавляет календарные дни через границы месяца и года', () => {
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysISO('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDaysISO('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysISO('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('считает разницу в календарных днях', () => {
    expect(calendarDaysBetween('2026-01-01', '2026-01-15')).toBe(14);
    expect(calendarDaysBetween('2026-01-15', '2026-01-01')).toBe(-14);
    expect(calendarDaysBetween('2024-01-01', '2025-01-01')).toBe(366);
    expect(() => calendarDaysBetween('nope', '2026-01-01')).toThrow();
  });

  it('считает старт строго в будущем', () => {
    const now = new Date(2026, 0, 15, 10, 0, 0, 0);

    expect(isPastDateTime('2026-01-15', '10:00', now)).toBe(true);
    expect(isPastDateTime('2026-01-15', '09:59', now)).toBe(true);
    expect(isPastDateTime('2026-01-15', '10:01', now)).toBe(false);
    expect(isPastDateTime('2026-01-16', '09:00', now)).toBe(false);
    expect(isPastDateTime('2026-01-14', '10:00', now)).toBe(true);
  });

  it('применяет горизонт бронирования 14 дней', () => {
    const now = new Date(2026, 0, 15, 12, 0, 0, 0);
    const today = todayISO(now);

    expect(isBeyondAdvanceLimit(today, now)).toBe(false);
    expect(isBeyondAdvanceLimit(addDaysISO(today, 14), now)).toBe(false);
    expect(isBeyondAdvanceLimit(addDaysISO(today, 15), now)).toBe(true);
    expect(isBeyondAdvanceLimit(addDaysISO(today, -1), now)).toBe(false);
  });

  it('проверяет рабочие часы 08:00–21:00', () => {
    expect(isWithinWorkingHours('08:00', '21:00')).toBe(true);
    expect(isWithinWorkingHours('08:00', '09:30')).toBe(true);
    expect(isWithinWorkingHours('19:05', '21:00')).toBe(true);
    expect(isWithinWorkingHours('07:59', '09:30')).toBe(false);
    expect(isWithinWorkingHours('20:00', '21:30')).toBe(false);
    expect(isWithinWorkingHours('21:00', '22:30')).toBe(false);
  });

  it('собирает локальную дату-время корректно', () => {
    const date = dateTimeToLocalDate('2026-01-15', '00:00');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);

    const late = dateTimeToLocalDate('2026-01-15', '21:00');
    expect(late.getHours()).toBe(21);
    expect(nowTimeString(new Date(2026, 0, 15, 9, 5))).toBe('09:05');
  });
});
