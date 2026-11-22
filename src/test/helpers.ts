import { expect } from 'vitest';
import { DEMO_ACCOUNT_IDS } from '../mocks';
import type {
  Booking,
  BookingDuration,
  ErrorCode,
  RoomBlock,
  ScheduleSlot,
  ServiceResult,
  User,
} from '../shared/types';
import { createId } from '../shared/utils/id';
import { addDaysISO, minutesBetween, todayISO } from '../shared/utils/time';
import { withTransaction } from '../storage/db';
import * as usersService from '../modules/users';

export const ACCOUNTS = DEMO_ACCOUNT_IDS;

/** Дата со сдвигом в календарных днях от сегодняшней. */
export function dateFromToday(offset: number): string {
  return addDaysISO(todayISO(), offset);
}

export function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(
      `Ожидался успешный результат, получена ошибка ${result.error.code}: ${result.error.message}`,
    );
  }
  return result.data;
}

export function expectFailure<T>(result: ServiceResult<T>, code: ErrorCode): void {
  if (result.ok) {
    throw new Error(`Ожидалась ошибка ${code}, но операция завершилась успешно.`);
  }
  expect(result.error.code).toBe(code);
}

export async function loginAs(universityId: string): Promise<User> {
  return unwrap(await usersService.login({ universityId })).user;
}

export const loginAsStudent1 = () => loginAs(ACCOUNTS.student1);
export const loginAsStudent2 = () => loginAs(ACCOUNTS.student2);
export const loginAsTeacher = () => loginAs(ACCOUNTS.teacher1);
export const loginAsAdmin = () => loginAs(ACCOUNTS.admin1);

export async function addUser(user: User): Promise<void> {
  await withTransaction((tx) => {
    tx.write('users', [...tx.read('users'), user]);
  });
}

export async function addBooking(booking: Booking): Promise<void> {
  await withTransaction((tx) => {
    tx.write('bookings', [...tx.read('bookings'), booking]);
  });
}

export async function addSchedule(slot: ScheduleSlot): Promise<void> {
  await withTransaction((tx) => {
    tx.write('schedule', [...tx.read('schedule'), slot]);
  });
}

export async function addBlock(block: RoomBlock): Promise<void> {
  await withTransaction((tx) => {
    tx.write('blocks', [...tx.read('blocks'), block]);
  });
}

type BookingFixture = Partial<Booking> &
  Pick<Booking, 'auditoriumId' | 'date' | 'startTime' | 'endTime'>;

/** Фикстура брони с разумными значениями по умолчанию. */
export function makeBooking(fixture: BookingFixture): Booking {
  const duration =
    fixture.duration ??
    (minutesBetween(fixture.startTime, fixture.endTime) as BookingDuration);

  return {
    id: createId('test-booking'),
    userId: ACCOUNTS.student1,
    userRole: 'student',
    userFullName: 'Иванов Иван Иванович',
    status: 'active',
    createdAt: new Date().toISOString(),
    ...fixture,
    duration,
  };
}

export function makeSchedule(fixture: Partial<ScheduleSlot> &
  Pick<ScheduleSlot, 'auditoriumId' | 'date' | 'startTime' | 'endTime'>): ScheduleSlot {
  return {
    id: createId('test-schedule'),
    subject: 'Тестовое занятие',
    ...fixture,
  };
}

export function makeBlock(fixture: Partial<RoomBlock> &
  Pick<RoomBlock, 'auditoriumId' | 'date' | 'startTime' | 'endTime'>): RoomBlock {
  return {
    id: createId('test-block'),
    reason: 'Тестовая блокировка',
    createdBy: ACCOUNTS.admin1,
    createdAt: new Date().toISOString(),
    ...fixture,
  };
}
