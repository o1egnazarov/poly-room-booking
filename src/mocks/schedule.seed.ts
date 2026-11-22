import type { ScheduleSlot } from '../shared/types/domain';
import { addDaysISO, todayISO } from '../shared/utils/time';

/**
 * Расписание занятий строится относительно текущей даты, чтобы демо-данные
 * никогда не «протухали» в прошлое (docs/03-data-contracts.md, раздел 4).
 */
export function createScheduleSeed(now: Date = new Date()): ScheduleSlot[] {
  const today = todayISO(now);
  const tomorrow = addDaysISO(today, 1);
  const dayAfterTomorrow = addDaysISO(today, 2);

  return [
    {
      id: 'schedule-seed-1',
      auditoriumId: 'room-3-204',
      date: tomorrow,
      startTime: '10:00',
      endTime: '11:30',
      subject: 'Архитектура программных систем',
      group: '5130904/60101',
      lecturer: 'Петров П. П.',
    },
    {
      id: 'schedule-seed-2',
      auditoriumId: 'room-3-305',
      date: tomorrow,
      startTime: '12:00',
      endTime: '13:30',
      subject: 'Базы данных',
      group: '5130904/60102',
      lecturer: 'Смирнова А. В.',
    },
    {
      id: 'schedule-seed-3',
      auditoriumId: 'room-3-210',
      date: dayAfterTomorrow,
      startTime: '14:00',
      endTime: '15:30',
      subject: 'Операционные системы',
      group: '5130904/60103',
      lecturer: 'Орлов С. Н.',
    },
    {
      id: 'schedule-seed-4',
      auditoriumId: 'room-3-101',
      date: today,
      startTime: '18:00',
      endTime: '19:30',
      subject: 'Математический анализ',
      group: '5130904/60101',
      lecturer: 'Фёдорова Е. И.',
    },
  ];
}
