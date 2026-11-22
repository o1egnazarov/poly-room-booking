/**
 * Доменные модели и контракты обмена данными (docs/03-data-contracts.md).
 */

export type Role = 'student' | 'teacher' | 'admin';

export interface User {
  /** Университетский идентификатор, например "spbpu-st-1001". */
  universityId: string;
  fullName: string;
  role: Role;
  email?: string;
}

export interface Auditorium {
  /** UUID или стабильный слаг, например "room-3-201". */
  id: string;
  /** Уникальный номер, например "3-201". */
  number: string;
  /** Положительное целое число мест. */
  capacity: number;
  /** Например, ["Проектор", "Маркерная доска", "ПК (20 шт.)"]. */
  equipment: string[];
  /** Деактивированные аудитории исключаются из поиска и бронирования. */
  isActive: boolean;
}

export type BookingDuration = 90 | 115;

export type BookingStatus = 'active' | 'cancelled';

export type CancelReason = 'USER_CANCELLED' | 'ADMIN_CANCELLED' | 'PREEMPTED_BY_TEACHER';

export interface Booking {
  id: string;
  auditoriumId: string;
  /** User.universityId автора бронирования. */
  userId: string;
  /** Снимок роли автора на момент создания (для проверки приоритета). */
  userRole: Role;
  /** Денормализованное ФИО для таблицы администратора. */
  userFullName: string;
  /** ISO-дата "YYYY-MM-DD". */
  date: string;
  /** 24-часовое "HH:MM". */
  startTime: string;
  /** 24-часовое "HH:MM". */
  endTime: string;
  duration: BookingDuration;
  status: BookingStatus;
  /** ISO-метка создания. */
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: CancelReason;
}

export interface ScheduleSlot {
  id: string;
  auditoriumId: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM". */
  startTime: string;
  /** "HH:MM". */
  endTime: string;
  subject: string;
  group?: string;
  lecturer?: string;
}

export interface RoomBlock {
  id: string;
  auditoriumId: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM". */
  startTime: string;
  /** "HH:MM". */
  endTime: string;
  reason: string;
  /** universityId администратора. */
  createdBy: string;
  /** ISO-метка создания. */
  createdAt: string;
}

/** Сессия мокового SSO хранится отдельно от таблицы пользователей. */
export interface Session {
  universityId: string;
  startedAt: string;
}

export interface SearchAuditoriumsInput {
  /** "YYYY-MM-DD" (обязательно). */
  date: string;
  /** "HH:MM" (обязательно). */
  startTime: string;
  /** 90 | 115 (обязательно). */
  duration: BookingDuration;
  /** Необязательная подстрока или точное совпадение номера. */
  roomNumber?: string;
  /** Необязательный фильтр по минимальной вместимости. */
  minCapacity?: number;
  /** Необязательный фильтр: аудитория должна иметь всё перечисленное оборудование. */
  equipment?: string[];
}

export interface CreateBookingInput {
  auditoriumId: string;
  date: string;
  startTime: string;
  /** 90 | 115. */
  duration: BookingDuration;
}

/** Человекочитаемые подписи ролей (используются UI и уведомлениями). */
export const ROLE_LABELS: Record<Role, string> = {
  student: 'Студент',
  teacher: 'Преподаватель',
  admin: 'Администратор',
};

/** Человекочитаемые причины отмены (используются UI). */
export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  USER_CANCELLED: 'Отменено пользователем',
  ADMIN_CANCELLED: 'Отменено администратором',
  PREEMPTED_BY_TEACHER: 'Отменено в пользу преподавателя',
};
