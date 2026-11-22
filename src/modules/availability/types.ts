import type { Role } from '../../shared/types/domain';

export type ConflictSource = 'SCHEDULE' | 'BLOCK' | 'BOOKING';

/** Один занятый интервал, приведённый к единому виду. */
export interface AvailabilityConflict {
  source: ConflictSource;
  id: string;
  auditoriumId: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Название занятия / причина блокировки / ФИО автора брони. */
  title: string;
  bookingId?: string;
  bookingUserId?: string;
  bookingUserRole?: Role;
}

export interface CheckAvailabilityInput {
  auditoriumId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface AvailabilityCheck {
  auditoriumId: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Свободна ли аудитория строго (нет ни одного конфликта). */
  available: boolean;
  conflicts: AvailabilityConflict[];
  scheduleConflicts: AvailabilityConflict[];
  blockConflicts: AvailabilityConflict[];
  bookingConflicts: AvailabilityConflict[];
  /** Конфликты только со студенческими активными бронями. */
  studentBookingConflicts: AvailabilityConflict[];
  hasScheduleConflict: boolean;
  hasBlockConflict: boolean;
  hasBookingConflict: boolean;
  /**
   * Может ли преподаватель вытеснить все конфликты по правилу приоритета:
   * нет занятия/блокировки, есть хотя бы одна активная бронь, и ВСЕ брони — студенческие.
   */
  teacherPreemptable: boolean;
}

export interface CreateRoomBlockInput {
  auditoriumId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  /** universityId администратора, создающего блокировку. */
  createdBy: string;
}

export interface RoomBlockFilter {
  auditoriumId?: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
}
