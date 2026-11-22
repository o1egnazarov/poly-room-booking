import type { Booking } from '../shared/types/domain';
import { addDaysISO, todayISO } from '../shared/utils/time';
import { createUsersSeed, DEMO_ACCOUNT_IDS } from './users.seed';

/**
 * Демонстрационные бронирования:
 * - две активные студенческие брони на завтра (для UC-03/UC-04 и приоритета преподавателя);
 * - одна отменённая бронь в истории (для вкладки «Отменённые»).
 */
export function createBookingsSeed(now: Date = new Date()): Booking[] {
  const users = createUsersSeed();
  const student1 = users.find((user) => user.universityId === DEMO_ACCOUNT_IDS.student1);
  const student2 = users.find((user) => user.universityId === DEMO_ACCOUNT_IDS.student2);

  if (!student1 || !student2) {
    throw new Error('Не удалось загрузить демо-пользователей для сида бронирований.');
  }

  const today = todayISO(now);
  const tomorrow = addDaysISO(today, 1);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: 'booking-seed-1',
      auditoriumId: 'room-3-312',
      userId: student1.universityId,
      userRole: student1.role,
      userFullName: student1.fullName,
      date: tomorrow,
      startTime: '10:00',
      endTime: '11:30',
      duration: 90,
      status: 'active',
      createdAt: hourAgo,
    },
    {
      id: 'booking-seed-2',
      auditoriumId: 'room-3-401',
      userId: student2.universityId,
      userRole: student2.role,
      userFullName: student2.fullName,
      date: tomorrow,
      startTime: '12:00',
      endTime: '13:30',
      duration: 90,
      status: 'active',
      createdAt: hourAgo,
    },
    {
      id: 'booking-seed-3',
      auditoriumId: 'room-3-220',
      userId: student1.universityId,
      userRole: student1.role,
      userFullName: student1.fullName,
      date: tomorrow,
      startTime: '14:00',
      endTime: '15:55',
      duration: 115,
      status: 'cancelled',
      createdAt: yesterday,
      cancelledAt: yesterday,
      cancelledBy: student1.universityId,
      cancelReason: 'USER_CANCELLED',
    },
  ];
}
