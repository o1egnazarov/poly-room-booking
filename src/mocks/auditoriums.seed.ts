import type { Auditorium } from '../shared/types/domain';

const AUDITORIUMS_SEED: readonly Auditorium[] = [
  {
    id: 'room-3-101',
    number: '3-101',
    capacity: 120,
    equipment: ['Проектор', 'Микрофон', 'Маркерная доска'],
    isActive: true,
  },
  {
    id: 'room-3-204',
    number: '3-204',
    capacity: 60,
    equipment: ['Проектор', 'Интерактивная доска', 'ПК (20 шт.)'],
    isActive: true,
  },
  {
    id: 'room-3-210',
    number: '3-210',
    capacity: 30,
    equipment: ['Проектор', 'Маркерная доска'],
    isActive: true,
  },
  {
    id: 'room-3-220',
    number: '3-220',
    capacity: 50,
    equipment: ['Проектор', 'Микрофон', 'Интерактивная доска'],
    isActive: true,
  },
  {
    id: 'room-3-305',
    number: '3-305',
    capacity: 45,
    equipment: ['Проектор', 'ПК (15 шт.)'],
    isActive: true,
  },
  {
    id: 'room-3-312',
    number: '3-312',
    capacity: 25,
    equipment: ['Интерактивная доска', 'Маркерная доска'],
    isActive: true,
  },
  {
    id: 'room-3-401',
    number: '3-401',
    capacity: 15,
    equipment: ['Маркерная доска'],
    isActive: true,
  },
  {
    // Деактивированная аудитория — проверка исключения из поиска (AC-02).
    id: 'room-3-118',
    number: '3-118',
    capacity: 80,
    equipment: ['Проектор', 'Микрофон'],
    isActive: false,
  },
];

export function createAuditoriumsSeed(): Auditorium[] {
  return AUDITORIUMS_SEED.map((room) => ({ ...room, equipment: [...room.equipment] }));
}
