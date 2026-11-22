import type { Role, User } from '../../shared/types/domain';
import { fail, ok, type ServiceResult } from '../../shared/types/result';
import { readTable, withTransaction } from '../../storage/db';
import {
  roleHasPermission,
  type LoginInput,
  type Permission,
  type SessionInfo,
} from './types';

/**
 * Моковый университетский SSO.
 *
 * Сессия хранится в localStorage; все методы асинхронные, чтобы позже
 * заменить реализацию на реальный backend без изменения UI.
 */
export async function login(input: LoginInput): Promise<ServiceResult<SessionInfo>> {
  if (!input || typeof input.universityId !== 'string' || input.universityId.trim() === '') {
    return fail('INVALID_INPUT', 'Не выбрана учётная запись для входа.');
  }

  return withTransaction((tx) => {
    if (input.simulateSsoFailure) {
      return fail('SSO_AUTH_FAILED');
    }

    const user = tx
      .read('users')
      .find((candidate) => candidate.universityId === input.universityId);

    if (!user) {
      return fail(
        'SSO_AUTH_FAILED',
        'Учётная запись с таким идентификатором не найдена в системе СПбПУ.',
      );
    }

    const startedAt = new Date().toISOString();
    tx.write('session', { universityId: user.universityId, startedAt });

    return ok({ user, startedAt });
  });
}

/** Завершает сессию. Идемпотентно: выход без сессии не является ошибкой. */
export async function logout(): Promise<ServiceResult<null>> {
  return withTransaction((tx) => {
    tx.write('session', null);
    return ok(null);
  });
}

/** Текущий пользователь или null, если сессии нет. */
export async function getCurrentUser(): Promise<ServiceResult<User | null>> {
  const session = readTable('session');
  if (!session) {
    return ok(null);
  }

  const user = readTable('users').find(
    (candidate) => candidate.universityId === session.universityId,
  );

  return ok(user ?? null);
}

/** Требует активную сессию. */
export async function requireAuthenticated(): Promise<ServiceResult<User>> {
  const current = await getCurrentUser();
  if (!current.ok) {
    return current;
  }
  if (!current.data) {
    return fail('UNAUTHENTICATED');
  }
  return ok(current.data);
}

/** Требует одну из указанных ролей (RBAC на уровне домена, а не только UI). */
export async function requireRole(role: Role | Role[]): Promise<ServiceResult<User>> {
  const authenticated = await requireAuthenticated();
  if (!authenticated.ok) {
    return authenticated;
  }

  const allowedRoles = typeof role === 'string' ? [role] : role;
  if (!allowedRoles.includes(authenticated.data.role)) {
    return fail('FORBIDDEN');
  }

  return authenticated;
}

/** Есть ли у текущего пользователя указанная роль. */
export async function hasRole(role: Role | Role[]): Promise<boolean> {
  const current = await getCurrentUser();
  if (!current.ok || !current.data) {
    return false;
  }
  const allowedRoles = typeof role === 'string' ? [role] : role;
  return allowedRoles.includes(current.data.role);
}

/** Есть ли у текущего пользователя указанная возможность. */
export async function hasPermission(permission: Permission): Promise<boolean> {
  const current = await getCurrentUser();
  if (!current.ok || !current.data) {
    return false;
  }
  return roleHasPermission(current.data.role, permission);
}

/** Список демо-аккаунтов для экрана входа (UC-01). */
export async function listDemoAccounts(): Promise<ServiceResult<User[]>> {
  const users = readTable('users').map((user) => ({ ...user }));
  return ok(users);
}

export async function getUserById(universityId: string): Promise<ServiceResult<User | null>> {
  if (!universityId) {
    return fail('INVALID_INPUT', 'Не указан идентификатор пользователя.');
  }
  const user = readTable('users').find((candidate) => candidate.universityId === universityId);
  return ok(user ?? null);
}
