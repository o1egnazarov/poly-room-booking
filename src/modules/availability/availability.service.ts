import type { Booking, RoomBlock, ScheduleSlot } from '../../shared/types/domain';
import { fail, ok, type ServiceError, type ServiceResult } from '../../shared/types/result';
import { createId } from '../../shared/utils/id';
import {
  intervalsOverlap,
  isValidDateString,
  isValidTimeString,
  parseTimeToMinutes,
} from '../../shared/utils/time';
import { readTable, withTransaction } from '../../storage/db';
import type {
  AvailabilityCheck,
  AvailabilityConflict,
  CheckAvailabilityInput,
  CreateRoomBlockInput,
  RoomBlockFilter,
} from './types';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function compareConflicts(a: AvailabilityConflict, b: AvailabilityConflict): number {
  return (
    a.startTime.localeCompare(b.startTime) ||
    a.endTime.localeCompare(b.endTime) ||
    a.source.localeCompare(b.source)
  );
}

function scheduleToConflict(slot: ScheduleSlot): AvailabilityConflict {
  return {
    source: 'SCHEDULE',
    id: slot.id,
    auditoriumId: slot.auditoriumId,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    title: slot.subject,
  };
}

function blockToConflict(block: RoomBlock): AvailabilityConflict {
  return {
    source: 'BLOCK',
    id: block.id,
    auditoriumId: block.auditoriumId,
    date: block.date,
    startTime: block.startTime,
    endTime: block.endTime,
    title: block.reason,
  };
}

function bookingToConflict(booking: Booking): AvailabilityConflict {
  return {
    source: 'BOOKING',
    id: booking.id,
    auditoriumId: booking.auditoriumId,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    title: booking.userFullName,
    bookingId: booking.id,
    bookingUserId: booking.userId,
    bookingUserRole: booking.userRole,
  };
}

/** Общие проверки окна запроса (без правил «будущего» — это забота booking). */
function validateWindow(input: CheckAvailabilityInput): ServiceError | null {
  if (!isNonEmptyString(input.auditoriumId)) {
    return fail('INVALID_INPUT', 'Не указана аудитория.').error;
  }
  if (!isValidDateString(input.date)) {
    return fail('INVALID_INPUT', 'Некорректная дата. Ожидается формат ГГГГ-ММ-ДД.').error;
  }
  if (!isValidTimeString(input.startTime) || !isValidTimeString(input.endTime)) {
    return fail('INVALID_INPUT', 'Некорректное время. Ожидается формат ЧЧ:ММ.').error;
  }
  if (parseTimeToMinutes(input.endTime) <= parseTimeToMinutes(input.startTime)) {
    return fail('INVALID_TIME_RANGE').error;
  }
  return null;
}

function collectConflicts(
  input: CheckAvailabilityInput,
  schedule: ScheduleSlot[],
  blocks: RoomBlock[],
  bookings: Booking[],
): AvailabilityConflict[] {
  const target = { startTime: input.startTime, endTime: input.endTime };
  const conflicts: AvailabilityConflict[] = [];

  for (const slot of schedule) {
    if (
      slot.auditoriumId === input.auditoriumId &&
      slot.date === input.date &&
      intervalsOverlap(slot, target)
    ) {
      conflicts.push(scheduleToConflict(slot));
    }
  }

  for (const block of blocks) {
    if (
      block.auditoriumId === input.auditoriumId &&
      block.date === input.date &&
      intervalsOverlap(block, target)
    ) {
      conflicts.push(blockToConflict(block));
    }
  }

  for (const booking of bookings) {
    if (booking.status !== 'active') {
      continue;
    }
    if (
      booking.auditoriumId === input.auditoriumId &&
      booking.date === input.date &&
      intervalsOverlap(booking, target)
    ) {
      conflicts.push(bookingToConflict(booking));
    }
  }

  return conflicts.sort(compareConflicts);
}

/**
 * Проверка доступности: объединяет расписание, блокировки и активные брони.
 * Отменённые брони игнорируются.
 */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<ServiceResult<AvailabilityCheck>> {
  const validationError = validateWindow(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const conflicts = collectConflicts(
    input,
    readTable('schedule'),
    readTable('blocks'),
    readTable('bookings'),
  );

  const scheduleConflicts = conflicts.filter((conflict) => conflict.source === 'SCHEDULE');
  const blockConflicts = conflicts.filter((conflict) => conflict.source === 'BLOCK');
  const bookingConflicts = conflicts.filter((conflict) => conflict.source === 'BOOKING');
  const studentBookingConflicts = bookingConflicts.filter(
    (conflict) => conflict.bookingUserRole === 'student',
  );

  return ok({
    auditoriumId: input.auditoriumId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    available: conflicts.length === 0,
    conflicts,
    scheduleConflicts,
    blockConflicts,
    bookingConflicts,
    studentBookingConflicts,
    hasScheduleConflict: scheduleConflicts.length > 0,
    hasBlockConflict: blockConflicts.length > 0,
    hasBookingConflict: bookingConflicts.length > 0,
    teacherPreemptable:
      scheduleConflicts.length === 0 &&
      blockConflicts.length === 0 &&
      bookingConflicts.length > 0 &&
      studentBookingConflicts.length === bookingConflicts.length,
  });
}

/** Все занятые интервалы аудитории на дату (для сетки расписания в UI). */
export async function getOccupiedIntervals(
  auditoriumId: string,
  date: string,
): Promise<ServiceResult<AvailabilityConflict[]>> {
  if (!isNonEmptyString(auditoriumId)) {
    return fail('INVALID_INPUT', 'Не указана аудитория.');
  }
  if (!isValidDateString(date)) {
    return fail('INVALID_INPUT', 'Некорректная дата. Ожидается формат ГГГГ-ММ-ДД.');
  }

  const conflicts: AvailabilityConflict[] = [];

  for (const slot of readTable('schedule')) {
    if (slot.auditoriumId === auditoriumId && slot.date === date) {
      conflicts.push(scheduleToConflict(slot));
    }
  }
  for (const block of readTable('blocks')) {
    if (block.auditoriumId === auditoriumId && block.date === date) {
      conflicts.push(blockToConflict(block));
    }
  }
  for (const booking of readTable('bookings')) {
    if (
      booking.status === 'active' &&
      booking.auditoriumId === auditoriumId &&
      booking.date === date
    ) {
      conflicts.push(bookingToConflict(booking));
    }
  }

  return ok(conflicts.sort(compareConflicts));
}

export async function listRoomBlocks(
  filter: RoomBlockFilter = {},
): Promise<ServiceResult<RoomBlock[]>> {
  if (filter.date !== undefined && !isValidDateString(filter.date)) {
    return fail('INVALID_INPUT', 'Некорректная дата фильтра. Ожидается формат ГГГГ-ММ-ДД.');
  }
  if (filter.fromDate !== undefined && !isValidDateString(filter.fromDate)) {
    return fail('INVALID_INPUT', 'Некорректная начальная дата фильтра.');
  }
  if (filter.toDate !== undefined && !isValidDateString(filter.toDate)) {
    return fail('INVALID_INPUT', 'Некорректная конечная дата фильтра.');
  }

  const blocks = readTable('blocks').filter((block) => {
    if (filter.auditoriumId && block.auditoriumId !== filter.auditoriumId) {
      return false;
    }
    if (filter.date && block.date !== filter.date) {
      return false;
    }
    if (filter.fromDate && block.date < filter.fromDate) {
      return false;
    }
    if (filter.toDate && block.date > filter.toDate) {
      return false;
    }
    return true;
  });

  return ok(
    blocks
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.startTime.localeCompare(b.startTime) ||
          a.endTime.localeCompare(b.endTime),
      ),
  );
}

export async function getRoomBlockById(blockId: string): Promise<ServiceResult<RoomBlock>> {
  if (!isNonEmptyString(blockId)) {
    return fail('INVALID_INPUT', 'Не указан идентификатор блокировки.');
  }
  const block = readTable('blocks').find((candidate) => candidate.id === blockId);
  if (!block) {
    return fail('INVALID_INPUT', 'Блокировка не найдена.');
  }
  return ok(block);
}

/**
 * Низкоуровневое создание блокировки. RBAC-проверку администратора выполняет
 * фасад `administration`, который передаёт createdBy.
 */
export async function createRoomBlock(
  input: CreateRoomBlockInput,
): Promise<ServiceResult<RoomBlock>> {
  if (!isNonEmptyString(input.auditoriumId)) {
    return fail('INVALID_INPUT', 'Не указана аудитория.');
  }
  if (!isValidDateString(input.date)) {
    return fail('INVALID_INPUT', 'Некорректная дата блокировки. Ожидается формат ГГГГ-ММ-ДД.');
  }
  if (!isValidTimeString(input.startTime) || !isValidTimeString(input.endTime)) {
    return fail('INVALID_INPUT', 'Некорректное время блокировки. Ожидается формат ЧЧ:ММ.');
  }
  if (parseTimeToMinutes(input.endTime) <= parseTimeToMinutes(input.startTime)) {
    return fail('INVALID_TIME_RANGE');
  }
  if (!isNonEmptyString(input.reason)) {
    return fail('INVALID_INPUT', 'Укажите причину блокировки.');
  }
  if (!isNonEmptyString(input.createdBy)) {
    return fail('INVALID_INPUT', 'Не указан автор блокировки.');
  }

  return withTransaction((tx) => {
    const block: RoomBlock = {
      id: createId('block'),
      auditoriumId: input.auditoriumId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason.trim(),
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };

    tx.write('blocks', [...tx.read('blocks'), block]);
    return ok(block);
  });
}

export async function deleteRoomBlock(blockId: string): Promise<ServiceResult<RoomBlock>> {
  if (!isNonEmptyString(blockId)) {
    return fail('INVALID_INPUT', 'Не указан идентификатор блокировки.');
  }

  return withTransaction((tx) => {
    const blocks = tx.read('blocks');
    const block = blocks.find((candidate) => candidate.id === blockId);
    if (!block) {
      return fail('INVALID_INPUT', 'Блокировка не найдена.');
    }

    tx.write(
      'blocks',
      blocks.filter((candidate) => candidate.id !== blockId),
    );
    return ok(block);
  });
}
