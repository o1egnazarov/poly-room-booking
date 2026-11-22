import type { RoomBlock } from '../shared/types/domain';
import { addDaysISO, todayISO } from '../shared/utils/time';
import { DEMO_ACCOUNT_IDS } from './users.seed';

/** Одна активная блокировка аудитории для демонстрации UC-05. */
export function createBlocksSeed(now: Date = new Date()): RoomBlock[] {
  const tomorrow = addDaysISO(todayISO(now), 1);

  return [
    {
      id: 'block-seed-1',
      auditoriumId: 'room-3-204',
      date: tomorrow,
      startTime: '16:00',
      endTime: '18:00',
      reason: 'Техническое обслуживание проектора',
      createdBy: DEMO_ACCOUNT_IDS.admin1,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
  ];
}
