import type { Booking, BookingStatus } from '../../shared/types/domain';

export interface CreateBookingResult {
  booking: Booking;
  /** Студенческие брони, атомарно отменённые по приоритету преподавателя. */
  preemptedBookings: Booking[];
}

export interface OwnBookings {
  active: Booking[];
  cancelled: Booking[];
}

export interface BookingFilter {
  status?: BookingStatus;
  auditoriumId?: string;
  userId?: string;
  date?: string;
}
