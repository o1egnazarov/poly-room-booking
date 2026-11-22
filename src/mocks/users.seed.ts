import type { User } from '../shared/types/domain';

/** Идентификаторы демо-аккаунтов (используются тестами и экраном входа). */
export const DEMO_ACCOUNT_IDS = {
  student1: 'spbpu-st-1001',
  student2: 'spbpu-st-1002',
  teacher1: 'spbpu-tc-2001',
  admin1: 'spbpu-ad-3001',
} as const;

const USERS_SEED: readonly User[] = [
  {
    universityId: DEMO_ACCOUNT_IDS.student1,
    fullName: 'Иванов Иван Иванович',
    role: 'student',
    email: 'ivanov@edu.spbstu.ru',
  },
  {
    universityId: DEMO_ACCOUNT_IDS.student2,
    fullName: 'Петрова Анна Сергеевна',
    role: 'student',
    email: 'petrova@edu.spbstu.ru',
  },
  {
    universityId: DEMO_ACCOUNT_IDS.teacher1,
    fullName: 'Смирнов Павел Викторович',
    role: 'teacher',
    email: 'smirnov@spbstu.ru',
  },
  {
    universityId: DEMO_ACCOUNT_IDS.admin1,
    fullName: 'Кузнецов Дмитрий Андреевич',
    role: 'admin',
    email: 'kuznetsov@spbstu.ru',
  },
];

/** Возвращает копию демо-пользователей, чтобы сервисы не мутировали константу. */
export function createUsersSeed(): User[] {
  return USERS_SEED.map((user) => ({ ...user }));
}
