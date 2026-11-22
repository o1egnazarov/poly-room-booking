import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCOUNT_IDS } from '../mocks';
import type { Role } from '../shared/types';
import { readTable, writeTable } from '../storage/db';
import { resetDemoData } from '../storage/seed';
import * as users from '../modules/users';
import type { Permission } from '../modules/users';
import { expectFailure, loginAsAdmin, loginAsStudent1, unwrap } from './helpers';

beforeEach(async () => {
  localStorage.clear();
  await resetDemoData();
});

describe('users module', () => {
  it('возвращает 4 демо-аккаунта для SSO-экрана', async () => {
    const accounts = unwrap(await users.listDemoAccounts());

    expect(accounts).toHaveLength(4);
    expect(accounts.map((account) => account.universityId)).toEqual(
      expect.arrayContaining(Object.values(DEMO_ACCOUNT_IDS)),
    );
  });

  it('выполняет вход и сохраняет сессию', async () => {
    const session = unwrap(
      await users.login({ universityId: DEMO_ACCOUNT_IDS.student1 }),
    );

    expect(session.user.universityId).toBe(DEMO_ACCOUNT_IDS.student1);
    expect(session.user.role).toBe('student');
    expect(session.startedAt).toBeTruthy();
    expect(readTable('session')?.universityId).toBe(DEMO_ACCOUNT_IDS.student1);
    expect(unwrap(await users.getCurrentUser())?.fullName).toBe('Иванов Иван Иванович');
  });

  it('возвращает SSO_AUTH_FAILED при тестовой ошибке аутентификации', async () => {
    const result = await users.login({
      universityId: DEMO_ACCOUNT_IDS.student1,
      simulateSsoFailure: true,
    });

    expectFailure(result, 'SSO_AUTH_FAILED');
    expect(readTable('session')).toBeNull();
    if (!result.ok) {
      expect(result.error.message).toContain('СПбПУ');
    }
  });

  it('возвращает SSO_AUTH_FAILED для неизвестной учётной записи', async () => {
    expectFailure(
      await users.login({ universityId: 'spbpu-unknown-9999' }),
      'SSO_AUTH_FAILED',
    );
    expect(readTable('session')).toBeNull();
  });

  it('отклоняет вход без идентификатора', async () => {
    expectFailure(await users.login({ universityId: '   ' }), 'INVALID_INPUT');
  });

  it('выполняет выход и очищает сессию', async () => {
    await loginAsStudent1();
    expect(unwrap(await users.getCurrentUser())).not.toBeNull();

    expect(unwrap(await users.logout())).toBeNull();
    expect(readTable('session')).toBeNull();
    expect(unwrap(await users.getCurrentUser())).toBeNull();

    // Повторный выход идемпотентен.
    expect((await users.logout()).ok).toBe(true);
  });

  it('не считает отсутствие сессии ошибкой getCurrentUser', async () => {
    const result = await users.getCurrentUser();
    expect(result.ok).toBe(true);
    expect(unwrap(result)).toBeNull();
  });

  it('требует аутентификацию для защищённых операций', async () => {
    expectFailure(await users.requireAuthenticated(), 'UNAUTHENTICATED');
    expectFailure(await users.requireRole('admin'), 'UNAUTHENTICATED');
  });

  it('проверяет роль на уровне домена', async () => {
    await loginAsStudent1();

    expectFailure(await users.requireRole('admin'), 'FORBIDDEN');
    expect((await users.requireRole('student')).ok).toBe(true);
    expect((await users.requireRole(['student', 'teacher'])).ok).toBe(true);

    await loginAsAdmin();
    expect(unwrap(await users.requireRole('admin')).role).toBe('admin');
  });

  it('предоставляет RBAC-хелперы текущего пользователя', async () => {
    expect(await users.hasRole('admin')).toBe(false);
    expect(await users.hasPermission('manageAuditoriums')).toBe(false);

    await loginAsStudent1();
    expect(await users.hasRole('student')).toBe(true);
    expect(await users.hasRole(['teacher', 'admin'])).toBe(false);
    expect(await users.hasPermission('book')).toBe(true);
    expect(await users.hasPermission('manageAuditoriums')).toBe(false);
    expect(await users.hasPermission('cancelAnyBooking')).toBe(false);

    await loginAsAdmin();
    expect(await users.hasRole('admin')).toBe(true);
    expect(await users.hasPermission('manageAuditoriums')).toBe(true);
    expect(await users.hasPermission('cancelAnyBooking')).toBe(true);
  });

  it('описывает матрицу прав ролей', () => {
    const expected: Record<Role, Record<Permission, boolean>> = {
      student: {
        search: true,
        book: true,
        viewOwnBookings: true,
        cancelOwnBooking: true,
        manageAuditoriums: false,
        manageRoomBlocks: false,
        viewAllBookings: false,
        cancelAnyBooking: false,
      },
      teacher: {
        search: true,
        book: true,
        viewOwnBookings: true,
        cancelOwnBooking: true,
        manageAuditoriums: false,
        manageRoomBlocks: false,
        viewAllBookings: false,
        cancelAnyBooking: false,
      },
      admin: {
        search: true,
        book: true,
        viewOwnBookings: true,
        cancelOwnBooking: true,
        manageAuditoriums: true,
        manageRoomBlocks: true,
        viewAllBookings: true,
        cancelAnyBooking: true,
      },
    };

    for (const [role, permissions] of Object.entries(expected) as Array<
      [Role, Record<Permission, boolean>]
    >) {
      for (const [permission, allowed] of Object.entries(permissions) as Array<
        [Permission, boolean]
      >) {
        expect(users.roleHasPermission(role, permission)).toBe(allowed);
      }
    }
  });

  it('возвращает null для сессии со ссылкой на удалённого пользователя', async () => {
    writeTable('session', {
      universityId: 'spbpu-ghost-0000',
      startedAt: new Date().toISOString(),
    });

    expect(unwrap(await users.getCurrentUser())).toBeNull();
    expectFailure(await users.requireAuthenticated(), 'UNAUTHENTICATED');
  });

  it('находит пользователя по университетскому id', async () => {
    const user = unwrap(await users.getUserById(DEMO_ACCOUNT_IDS.teacher1));
    expect(user?.role).toBe('teacher');

    expect(unwrap(await users.getUserById('spbpu-ghost-0000'))).toBeNull();
    expectFailure(await users.getUserById(''), 'INVALID_INPUT');
  });
});
