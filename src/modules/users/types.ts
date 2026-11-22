import type { Role, User } from '../../shared/types/domain';

export interface LoginInput {
  universityId: string;
  /** Тестовый переключатель «Симулировать ошибку аутентификации» (UC-01). */
  simulateSsoFailure?: boolean;
}

export interface SessionInfo {
  user: User;
  startedAt: string;
}

/** Возможности, на которые влияет матрица RBAC из docs/01-domain-and-rules.md. */
export type Permission =
  | 'search'
  | 'book'
  | 'viewOwnBookings'
  | 'cancelOwnBooking'
  | 'manageAuditoriums'
  | 'manageRoomBlocks'
  | 'viewAllBookings'
  | 'cancelAnyBooking';

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  student: ['search', 'book', 'viewOwnBookings', 'cancelOwnBooking'],
  teacher: ['search', 'book', 'viewOwnBookings', 'cancelOwnBooking'],
  admin: [
    'search',
    'book',
    'viewOwnBookings',
    'cancelOwnBooking',
    'manageAuditoriums',
    'manageRoomBlocks',
    'viewAllBookings',
    'cancelAnyBooking',
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
