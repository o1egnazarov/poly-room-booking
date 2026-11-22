import { beforeEach, describe, expect, it } from 'vitest';
import type { BookingDuration, SearchAuditoriumsInput } from '../shared/types';
import { resetDemoData } from '../storage/seed';
import * as auditoriums from '../modules/auditoriums';
import { dateFromToday, expectFailure, unwrap } from './helpers';

beforeEach(async () => {
  localStorage.clear();
  await resetDemoData();
});

const TOMORROW = dateFromToday(1);

type SearchOptions = Partial<SearchAuditoriumsInput>;

function searchInput(overrides: SearchOptions = {}) {
  return {
    date: TOMORROW,
    startTime: '09:00',
    duration: 90 as BookingDuration,
    ...overrides,
  };
}

function numbers(results: Array<{ auditorium: { number: string } }>): string[] {
  return results.map((result) => result.auditorium.number);
}

describe('auditorium catalog', () => {
  it('по умолчанию показывает только активные аудитории', async () => {
    const active = unwrap(await auditoriums.getCatalog());
    expect(active).toHaveLength(7);
    expect(active.map((room) => room.number)).not.toContain('3-118');
    expect(active.every((room) => room.isActive)).toBe(true);

    const all = unwrap(await auditoriums.listAllAuditoriums());
    expect(all).toHaveLength(8);
    expect(all.map((room) => room.number)).toContain('3-118');
  });

  it('находит аудиторию по id и номеру', async () => {
    expect(unwrap(await auditoriums.getAuditoriumById('room-3-101')).number).toBe('3-101');
    expect(unwrap(await auditoriums.getAuditoriumByNumber('3-101')).id).toBe('room-3-101');

    expectFailure(
      await auditoriums.getAuditoriumById('room-missing'),
      'AUDITORIUM_NOT_FOUND',
    );
    expectFailure(
      await auditoriums.getAuditoriumByNumber('9-999'),
      'AUDITORIUM_NOT_FOUND',
    );
    expectFailure(await auditoriums.getAuditoriumById(''), 'INVALID_INPUT');
    expectFailure(await auditoriums.getAuditoriumByNumber(''), 'INVALID_INPUT');
  });
});

describe('auditorium search', () => {
  it('возвращает только реально свободные активные аудитории', async () => {
    const results = unwrap(await auditoriums.searchAvailable(searchInput()));
    const found = numbers(results);

    expect(results.every((result) => result.isFree)).toBe(true);
    expect(found).toHaveLength(5);
    expect(found).not.toContain('3-118'); // деактивирована
    expect(found).not.toContain('3-204'); // занятие 10:00–11:30 пересекается
    expect(found).not.toContain('3-312'); // бронь студента 10:00–11:30 пересекается
    expect(found).toEqual(
      expect.arrayContaining(['3-101', '3-210', '3-220', '3-305', '3-401']),
    );
  });

  it('фильтрует по номеру аудитории', async () => {
    const exact = unwrap(await auditoriums.searchAvailable(searchInput({ roomNumber: '3-101' })));
    expect(numbers(exact)).toEqual(['3-101']);

    const partial = unwrap(await auditoriums.searchAvailable(searchInput({ roomNumber: '3-10' })));
    expect(numbers(partial)).toEqual(['3-101']);

    const none = unwrap(await auditoriums.searchAvailable(searchInput({ roomNumber: '9-000' })));
    expect(none).toEqual([]);
  });

  it('фильтрует по минимальной вместимости', async () => {
    const results = unwrap(
      await auditoriums.searchAvailable(searchInput({ minCapacity: 100 })),
    );
    expect(numbers(results)).toEqual(['3-101']);
  });

  it('фильтрует по полному набору оборудования', async () => {
    const results = unwrap(
      await auditoriums.searchAvailable(
        searchInput({ equipment: ['Проектор', 'Микрофон'] }),
      ),
    );
    expect(numbers(results)).toEqual(['3-101', '3-220']);
  });

  it('игнорирует отменённые брони при поиске', async () => {
    const results = unwrap(
      await auditoriums.searchAvailable(
        searchInput({ date: TOMORROW, startTime: '14:00', duration: 90 }),
      ),
    );
    expect(numbers(results)).toContain('3-220');
  });

  it('преподаватель видит комнаты, занятые только студентами, с флагом приоритета', async () => {
    const asStudent = unwrap(
      await auditoriums.searchAvailable(searchInput({ startTime: '10:00' }), {
        requesterRole: 'student',
      }),
    );
    expect(numbers(asStudent)).not.toContain('3-312');
    expect(numbers(asStudent)).not.toContain('3-204');

    const asTeacher = unwrap(
      await auditoriums.searchAvailable(searchInput({ startTime: '10:00' }), {
        requesterRole: 'teacher',
      }),
    );
    const preemptable = asTeacher.find((result) => result.auditorium.number === '3-312');

    expect(preemptable).toBeDefined();
    expect(preemptable?.isFree).toBe(false);
    expect(preemptable?.teacherPreemptable).toBe(true);
    expect(preemptable?.conflicts[0]?.source).toBe('BOOKING');
    // Занятость учебным занятием не даёт права вытеснения.
    expect(numbers(asTeacher)).not.toContain('3-204');
  });

  it('без роли преподавателя не показывает вытесняемые комнаты', async () => {
    const results = unwrap(
      await auditoriums.searchAvailable(searchInput({ startTime: '10:00' })),
    );
    expect(numbers(results)).not.toContain('3-312');
  });

  it('валидирует параметры поиска', async () => {
    expectFailure(
      await auditoriums.searchAvailable(searchInput({ date: dateFromToday(-1) })),
      'DATE_IN_PAST',
    );
    expectFailure(
      await auditoriums.searchAvailable(searchInput({ date: dateFromToday(0), startTime: '00:00' })),
      'DATE_IN_PAST',
    );
    expectFailure(
      await auditoriums.searchAvailable(searchInput({ startTime: '07:00' })),
      'OUTSIDE_WORKING_HOURS',
    );
    expectFailure(
      await auditoriums.searchAvailable(searchInput({ startTime: '20:00' })),
      'OUTSIDE_WORKING_HOURS',
    );
    expectFailure(
      await auditoriums.searchAvailable(searchInput({ date: dateFromToday(15) })),
      'EXCEEDS_ADVANCE_LIMIT',
    );
    expectFailure(
      await auditoriums.searchAvailable(
        searchInput({ duration: 60 as BookingDuration }),
      ),
      'INVALID_DURATION',
    );
    expectFailure(
      await auditoriums.searchAvailable(searchInput({ date: '2026-02-30' })),
      'INVALID_INPUT',
    );
    expectFailure(
      await auditoriums.searchAvailable(searchInput({ startTime: '25:00' })),
      'INVALID_INPUT',
    );
    expectFailure(
      await auditoriums.searchAvailable(searchInput({ minCapacity: -1 })),
      'INVALID_INPUT',
    );
    expectFailure(
      await auditoriums.searchAvailable(
        searchInput({ equipment: 'Проектор' as unknown as string[] }),
      ),
      'INVALID_INPUT',
    );
    expectFailure(
      await auditoriums.searchAvailable(
        searchInput({ roomNumber: 42 as unknown as string }),
      ),
      'INVALID_INPUT',
    );
  });
});

describe('auditorium admin CRUD (privileged primitives)', () => {
  it('создаёт аудиторию и сразу отражает её в каталоге и поиске', async () => {
    const created = unwrap(
      await auditoriums.createAuditorium({
        number: '3-999',
        capacity: 40,
        equipment: ['Проектор', 'Микрофон'],
      }),
    );

    expect(created.id).toBe('room-3-999');
    expect(created.isActive).toBe(true);
    expect(unwrap(await auditoriums.getCatalog())).toHaveLength(8);
    expect(unwrap(await auditoriums.listAllAuditoriums())).toHaveLength(9);

    const results = unwrap(await auditoriums.searchAvailable(searchInput()));
    expect(numbers(results)).toContain('3-999');
  });

  it('запрещает дубликаты номеров и некорректные данные', async () => {
    expectFailure(
      await auditoriums.createAuditorium({
        number: '3-101',
        capacity: 10,
        equipment: [],
      }),
      'DUPLICATE_ROOM_NUMBER',
    );
    expectFailure(
      await auditoriums.createAuditorium({
        number: '  3-101  ',
        capacity: 10,
        equipment: [],
      }),
      'DUPLICATE_ROOM_NUMBER',
    );
    expectFailure(
      await auditoriums.createAuditorium({ number: '', capacity: 10, equipment: [] }),
      'INVALID_INPUT',
    );
    expectFailure(
      await auditoriums.createAuditorium({ number: '3-998', capacity: 0, equipment: [] }),
      'INVALID_INPUT',
    );
    expectFailure(
      await auditoriums.createAuditorium({ number: '3-998', capacity: 1.5, equipment: [] }),
      'INVALID_INPUT',
    );
    expectFailure(
      await auditoriums.createAuditorium({
        number: '3-998',
        capacity: 10,
        equipment: [42 as unknown as string],
      }),
      'INVALID_INPUT',
    );
    expectFailure(
      await auditoriums.createAuditorium({
        number: '3-998',
        capacity: 10,
        equipment: [],
        isActive: 'yes' as unknown as boolean,
      }),
      'INVALID_INPUT',
    );
  });

  it('создаёт деактивированную аудиторию, которая не попадает в публичный каталог', async () => {
    const created = unwrap(
      await auditoriums.createAuditorium({
        number: '3-998',
        capacity: 20,
        equipment: [],
        isActive: false,
      }),
    );

    expect(created.isActive).toBe(false);
    expect(unwrap(await auditoriums.getCatalog()).map((room) => room.number)).not.toContain(
      '3-998',
    );
    expect(unwrap(await auditoriums.listAllAuditoriums()).map((room) => room.number)).toContain(
      '3-998',
    );
  });

  it('редактирует аудиторию', async () => {
    const updated = unwrap(
      await auditoriums.updateAuditorium('room-3-101', {
        capacity: 130,
        equipment: ['Проектор', 'Микрофон', 'Интерактивная доска'],
      }),
    );

    expect(updated.capacity).toBe(130);
    expect(updated.equipment).toHaveLength(3);
    expect(unwrap(await auditoriums.getAuditoriumById('room-3-101')).capacity).toBe(130);

    const renumbered = unwrap(
      await auditoriums.updateAuditorium('room-3-101', { number: '3-111' }),
    );
    expect(renumbered.number).toBe('3-111');
    expect(unwrap(await auditoriums.getAuditoriumByNumber('3-111')).id).toBe('room-3-101');

    expectFailure(
      await auditoriums.updateAuditorium('room-3-101', { number: '3-204' }),
      'DUPLICATE_ROOM_NUMBER',
    );
    expectFailure(
      await auditoriums.updateAuditorium('room-3-101', { capacity: 0 }),
      'INVALID_INPUT',
    );
    expectFailure(
      await auditoriums.updateAuditorium('room-missing', { capacity: 10 }),
      'AUDITORIUM_NOT_FOUND',
    );
  });

  it('деактивирует и активирует аудиторию, влияя на каталог и поиск', async () => {
    unwrap(await auditoriums.setAuditoriumActive('room-3-101', false));

    const catalog = unwrap(await auditoriums.getCatalog());
    expect(catalog.map((room) => room.number)).not.toContain('3-101');
    expect(unwrap(await auditoriums.listAllAuditoriums()).find((room) => room.id === 'room-3-101')?.isActive).toBe(
      false,
    );
    expect(numbers(unwrap(await auditoriums.searchAvailable(searchInput())))).not.toContain(
      '3-101',
    );

    unwrap(await auditoriums.setAuditoriumActive('room-3-101', true));
    expect(unwrap(await auditoriums.getCatalog()).map((room) => room.number)).toContain(
      '3-101',
    );
    expect(numbers(unwrap(await auditoriums.searchAvailable(searchInput())))).toContain(
      '3-101',
    );

    expectFailure(
      await auditoriums.setAuditoriumActive('room-missing', false),
      'AUDITORIUM_NOT_FOUND',
    );
  });

  it('удаляет аудиторию из каталога', async () => {
    unwrap(
      await auditoriums.createAuditorium({
        number: '3-999',
        capacity: 40,
        equipment: [],
      }),
    );

    const deleted = unwrap(await auditoriums.deleteAuditorium('room-3-999'));
    expect(deleted.number).toBe('3-999');
    expect(unwrap(await auditoriums.listAllAuditoriums()).map((room) => room.number)).not.toContain(
      '3-999',
    );
    expectFailure(
      await auditoriums.getAuditoriumById('room-3-999'),
      'AUDITORIUM_NOT_FOUND',
    );
    expectFailure(await auditoriums.deleteAuditorium('room-3-999'), 'AUDITORIUM_NOT_FOUND');
    expectFailure(await auditoriums.deleteAuditorium(''), 'INVALID_INPUT');
  });
});
