import type { Booking, CreateBookingInput } from '../../shared/types/domain';
import { fail, ok, type ServiceResult } from '../../shared/types/result';
import { validateBookingInterval } from '../../shared/utils/bookingRules';
import { isValidDateString } from '../../shared/utils/time';
import { createId } from '../../shared/utils/id';
import { readTable, withTransaction } from '../../storage/db';
import { checkAvailability } from '../availability';
import { getAuditoriumById } from '../auditoriums';
import { requireAuthenticated, requireRole } from '../users';
import type { BookingFilter, CreateBookingResult, OwnBookings } from './types';

function compareUpcoming(a: Booking, b: Booking): number {
  return (
    a.date.localeCompare(b.date) ||
    a.startTime.localeCompare(b.startTime) ||
    a.endTime.localeCompare(b.endTime)
  );
}

function compareHistory(a: Booking, b: Booking): number {
  return (
    b.date.localeCompare(a.date) ||
    b.startTime.localeCompare(a.startTime) ||
    b.createdAt.localeCompare(a.createdAt)
  );
}

/**
 * Создание бронирования (UC-03, AC-03/AC-04).
 *
 * Вся операция выполняется в транзакции с глобальным мьютексом:
 * 1) пользователь и RBAC проверяются на серверной стороне (в домене);
 * 2) интервал валидируется (длительность, прошлое, рабочие часы, горизонт);
 * 3) доступность ПЕРЕПРОВЕРЯЕТСЯ заново из localStorage перед записью;
 * 4) преподаватель может атомарно вытеснить только студенческие брони.
 */
export async function createBooking(
  input: CreateBookingInput,
): Promise<ServiceResult<CreateBookingResult>> {
  return withTransaction(async (tx) => {
    const authenticated = await requireAuthenticated();
    if (!authenticated.ok) {
      return authenticated;
    }
    const user = authenticated.data;

    if (!input || typeof input.auditoriumId !== 'string' || input.auditoriumId.trim() === '') {
      return fail('INVALID_INPUT', 'Не указана аудитория.');
    }

    const interval = validateBookingInterval(input);
    if (!interval.ok) {
      return interval;
    }

    const auditoriumResult = await getAuditoriumById(input.auditoriumId);
    if (!auditoriumResult.ok) {
      return auditoriumResult;
    }
    const auditorium = auditoriumResult.data;

    if (!auditorium.isActive) {
      return fail('AUDITORIUM_INACTIVE');
    }

    // Never trust UI search state: fresh check right before committing.
    const availability = await checkAvailability({
      auditoriumId: auditorium.id,
      date: interval.data.date,
      startTime: interval.data.startTime,
      endTime: interval.data.endTime,
    });
    if (!availability.ok) {
      return availability;
    }

    const check = availability.data;

    if (check.hasScheduleConflict) {
      return fail('CONFLICT_SCHEDULE');
    }
    if (check.hasBlockConflict) {
      return fail('CONFLICT_BLOCK');
    }

    let bookings = tx.read('bookings');
    const preemptedBookings: Booking[] = [];
    const createdAt = new Date().toISOString();

    if (check.bookingConflicts.length > 0) {
      const canPreempt = user.role === 'teacher' && check.teacherPreemptable;
      if (!canPreempt) {
        return fail('CONFLICT_BOOKING');
      }

      const conflictIds = new Set(
        check.bookingConflicts.map((conflict) => conflict.bookingId ?? conflict.id),
      );

      bookings = bookings.map((booking) => {
        if (booking.status !== 'active' || !conflictIds.has(booking.id)) {
          return booking;
        }
        const displaced: Booking = {
          ...booking,
          status: 'cancelled',
          cancelledAt: createdAt,
          cancelledBy: user.universityId,
          cancelReason: 'PREEMPTED_BY_TEACHER',
        };
        preemptedBookings.push(displaced);
        return displaced;
      });
    }

    const booking: Booking = {
      id: createId('booking'),
      auditoriumId: auditorium.id,
      userId: user.universityId,
      userRole: user.role,
      userFullName: user.fullName,
      date: interval.data.date,
      startTime: interval.data.startTime,
      endTime: interval.data.endTime,
      duration: interval.data.duration,
      status: 'active',
      createdAt,
    };

    tx.write('bookings', [...bookings, booking]);

    const warnings =
      preemptedBookings.length > 0
        ? [
            `Бронирование создано с приоритетом преподавателя. Отменено студенческих бронирований: ${preemptedBookings.length}.`,
          ]
        : undefined;

    return ok({ booking, preemptedBookings }, warnings);
  });
}

/** Собственные брони текущего пользователя, разделённые на активные и историю. */
export async function listOwnBookings(): Promise<ServiceResult<OwnBookings>> {
  const authenticated = await requireAuthenticated();
  if (!authenticated.ok) {
    return authenticated;
  }

  const own = readTable('bookings').filter(
    (booking) => booking.userId === authenticated.data.universityId,
  );

  return ok({
    active: own.filter((booking) => booking.status === 'active').sort(compareUpcoming),
    cancelled: own.filter((booking) => booking.status === 'cancelled').sort(compareHistory),
  });
}

/** Отмена собственной брони (UC-04, AC-05). */
export async function cancelOwnBooking(bookingId: string): Promise<ServiceResult<Booking>> {
  if (!bookingId) {
    return fail('INVALID_INPUT', 'Не указан идентификатор бронирования.');
  }

  return withTransaction(async (tx) => {
    const authenticated = await requireAuthenticated();
    if (!authenticated.ok) {
      return authenticated;
    }
    const user = authenticated.data;

    const bookings = tx.read('bookings');
    const index = bookings.findIndex((booking) => booking.id === bookingId);
    if (index < 0) {
      return fail('BOOKING_NOT_FOUND');
    }

    const booking = bookings[index];
    // Сначала владение, потом статус: чужую бронь нельзя даже «отменить повторно».
    if (booking.userId !== user.universityId) {
      return fail('FORBIDDEN');
    }
    if (booking.status === 'cancelled') {
      return fail('BOOKING_ALREADY_CANCELLED');
    }

    const cancelled: Booking = {
      ...booking,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelledBy: user.universityId,
      cancelReason: 'USER_CANCELLED',
    };

    const next = bookings.slice();
    next[index] = cancelled;
    tx.write('bookings', next);

    return ok(cancelled);
  });
}

/**
 * Все бронирования (только admin). Вызывается фасадом administration,
 * но RBAC проверяется и здесь — домен не доверяет UI.
 */
export async function listAllBookings(
  filter: BookingFilter = {},
): Promise<ServiceResult<Booking[]>> {
  const authorized = await requireRole('admin');
  if (!authorized.ok) {
    return authorized;
  }

  if (
    filter.status !== undefined &&
    filter.status !== 'active' &&
    filter.status !== 'cancelled'
  ) {
    return fail('INVALID_INPUT', 'Некорректный статус фильтра.');
  }
  if (filter.date !== undefined && !isValidDateString(filter.date)) {
    return fail('INVALID_INPUT', 'Некорректная дата фильтра.');
  }

  const bookings = readTable('bookings')
    .filter((booking) => {
      if (filter.status && booking.status !== filter.status) {
        return false;
      }
      if (filter.auditoriumId && booking.auditoriumId !== filter.auditoriumId) {
        return false;
      }
      if (filter.userId && booking.userId !== filter.userId) {
        return false;
      }
      if (filter.date && booking.date !== filter.date) {
        return false;
      }
      return true;
    })
    .sort(compareHistory);

  return ok(bookings);
}

/** Отмена любой активной брони администратором (AC-06). */
export async function cancelBookingByAdmin(
  bookingId: string,
): Promise<ServiceResult<Booking>> {
  if (!bookingId) {
    return fail('INVALID_INPUT', 'Не указан идентификатор бронирования.');
  }

  return withTransaction(async (tx) => {
    const authorized = await requireRole('admin');
    if (!authorized.ok) {
      return authorized;
    }
    const admin = authorized.data;

    const bookings = tx.read('bookings');
    const index = bookings.findIndex((booking) => booking.id === bookingId);
    if (index < 0) {
      return fail('BOOKING_NOT_FOUND');
    }

    const booking = bookings[index];
    if (booking.status === 'cancelled') {
      return fail('BOOKING_ALREADY_CANCELLED');
    }

    const cancelled: Booking = {
      ...booking,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelledBy: admin.universityId,
      cancelReason: 'ADMIN_CANCELLED',
    };

    const next = bookings.slice();
    next[index] = cancelled;
    tx.write('bookings', next);

    return ok(cancelled);
  });
}
