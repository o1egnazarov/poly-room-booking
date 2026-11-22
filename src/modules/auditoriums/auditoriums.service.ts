import type {
  Auditorium,
  SearchAuditoriumsInput,
} from '../../shared/types/domain';
import { fail, ok, type ServiceResult } from '../../shared/types/result';
import { validateBookingInterval } from '../../shared/utils/bookingRules';
import { auditoriumIdFromNumber, createId } from '../../shared/utils/id';
import { readTable, withTransaction } from '../../storage/db';
import { checkAvailability } from '../availability';
import type {
  AuditoriumCatalogOptions,
  AuditoriumSearchOptions,
  AuditoriumSearchResult,
  CreateAuditoriumInput,
  UpdateAuditoriumInput,
} from './types';

function cloneRoom(room: Auditorium): Auditorium {
  return { ...room, equipment: [...room.equipment] };
}

function sortRooms(rooms: Auditorium[]): Auditorium[] {
  return rooms
    .slice()
    .sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }))
    .map(cloneRoom);
}

function isValidCapacity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function normalizeEquipment(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const seen = new Set<string>();
  const equipment: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      equipment.push(trimmed);
    }
  }

  return equipment;
}

function normalizeRoomNumber(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Каталог аудиторий. По умолчанию только активные — публичное чтение
 * (гость тоже может смотреть каталог, docs/01-domain-and-rules.md).
 */
export async function getCatalog(
  options: AuditoriumCatalogOptions = {},
): Promise<ServiceResult<Auditorium[]>> {
  const rooms = readTable('auditoriums').filter((room) => options.includeInactive || room.isActive);
  return ok(sortRooms(rooms));
}

/** Полный список для админ-панели (включая деактивированные). */
export async function listAllAuditoriums(): Promise<ServiceResult<Auditorium[]>> {
  return getCatalog({ includeInactive: true });
}

export async function getAuditoriumById(
  auditoriumId: string,
): Promise<ServiceResult<Auditorium>> {
  if (!auditoriumId) {
    return fail('INVALID_INPUT', 'Не указан идентификатор аудитории.');
  }
  const room = readTable('auditoriums').find((candidate) => candidate.id === auditoriumId);
  if (!room) {
    return fail('AUDITORIUM_NOT_FOUND');
  }
  return ok(cloneRoom(room));
}

export async function getAuditoriumByNumber(
  roomNumber: string,
): Promise<ServiceResult<Auditorium>> {
  const normalized = normalizeRoomNumber(roomNumber);
  if (!normalized) {
    return fail('INVALID_INPUT', 'Не указан номер аудитории.');
  }
  const room = readTable('auditoriums').find(
    (candidate) => candidate.number.toLowerCase() === normalized.toLowerCase(),
  );
  if (!room) {
    return fail('AUDITORIUM_NOT_FOUND');
  }
  return ok(cloneRoom(room));
}

/**
 * Поиск свободных аудиторий (UC-02).
 *
 * Свободными считаются только активные комнаты без занятия, блокировки и
 * активной брони. Преподавателю дополнительно показываются комнаты, занятые
 * только студентами (флаг teacherPreemptable) — но они не помечаются isFree.
 */
export async function searchAvailable(
  input: SearchAuditoriumsInput,
  options: AuditoriumSearchOptions = {},
): Promise<ServiceResult<AuditoriumSearchResult[]>> {
  const interval = validateBookingInterval(input);
  if (!interval.ok) {
    return interval;
  }

  if (input.roomNumber !== undefined && typeof input.roomNumber !== 'string') {
    return fail('INVALID_INPUT', 'Номер аудитории должен быть строкой.');
  }

  let minCapacity: number | undefined;
  if (input.minCapacity !== undefined) {
    if (
      typeof input.minCapacity !== 'number' ||
      !Number.isFinite(input.minCapacity) ||
      input.minCapacity < 0
    ) {
      return fail('INVALID_INPUT', 'Минимальная вместимость должна быть неотрицательным числом.');
    }
    minCapacity = Math.ceil(input.minCapacity);
  }

  let equipmentFilter: string[] = [];
  if (input.equipment !== undefined) {
    const normalized = normalizeEquipment(input.equipment);
    if (!normalized) {
      return fail('INVALID_INPUT', 'Фильтр оборудования должен быть списком строк.');
    }
    equipmentFilter = normalized;
  }

  const roomNumber = input.roomNumber?.trim().toLowerCase() ?? '';

  const candidates = readTable('auditoriums')
    .filter((room) => room.isActive)
    .filter((room) => !roomNumber || room.number.toLowerCase().includes(roomNumber))
    .filter((room) => minCapacity === undefined || room.capacity >= minCapacity)
    .filter((room) =>
      equipmentFilter.every((required) =>
        room.equipment.some((item) => item.toLowerCase() === required.toLowerCase()),
      ),
    );

  const results: AuditoriumSearchResult[] = [];

  for (const room of candidates) {
    const availability = await checkAvailability({
      auditoriumId: room.id,
      date: interval.data.date,
      startTime: interval.data.startTime,
      endTime: interval.data.endTime,
    });
    if (!availability.ok) {
      return availability;
    }

    const check = availability.data;
    const visibleForTeacher =
      options.requesterRole === 'teacher' && check.teacherPreemptable;

    if (!check.available && !visibleForTeacher) {
      continue;
    }

    results.push({
      auditorium: cloneRoom(room),
      isFree: check.available,
      teacherPreemptable: check.teacherPreemptable,
      conflicts: check.conflicts,
    });
  }

  results.sort((a, b) =>
    a.auditorium.number.localeCompare(b.auditorium.number, 'ru', { numeric: true }),
  );

  return ok(results);
}

/**
 * Создание аудитории. Привилегированная операция: вызывается только через
 * фасад `administration`, который проверяет роль admin.
 */
export async function createAuditorium(
  input: CreateAuditoriumInput,
): Promise<ServiceResult<Auditorium>> {
  const number = normalizeRoomNumber(input.number);
  if (!number) {
    return fail('INVALID_INPUT', 'Укажите номер аудитории.');
  }
  if (!isValidCapacity(input.capacity)) {
    return fail('INVALID_INPUT', 'Вместимость должна быть положительным целым числом.');
  }
  const equipment = normalizeEquipment(input.equipment);
  if (!equipment) {
    return fail('INVALID_INPUT', 'Оборудование должно быть списком строк.');
  }
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
    return fail('INVALID_INPUT', 'Признак активности должен быть логическим значением.');
  }

  return withTransaction((tx) => {
    const auditoriums = tx.read('auditoriums');

    if (
      auditoriums.some((room) => room.number.toLowerCase() === number.toLowerCase())
    ) {
      return fail('DUPLICATE_ROOM_NUMBER');
    }

    let id = auditoriumIdFromNumber(number);
    if (auditoriums.some((room) => room.id === id)) {
      id = createId('room');
    }

    const auditorium: Auditorium = {
      id,
      number,
      capacity: input.capacity,
      equipment,
      isActive: input.isActive ?? true,
    };

    tx.write('auditoriums', [...auditoriums, auditorium]);
    return ok(auditorium);
  });
}

/**
 * Редактирование аудитории. Привилегированная операция (см. administration).
 */
export async function updateAuditorium(
  auditoriumId: string,
  patch: UpdateAuditoriumInput,
): Promise<ServiceResult<Auditorium>> {
  if (!auditoriumId) {
    return fail('INVALID_INPUT', 'Не указан идентификатор аудитории.');
  }

  let number: string | undefined;
  if (patch.number !== undefined) {
    const normalized = normalizeRoomNumber(patch.number);
    if (!normalized) {
      return fail('INVALID_INPUT', 'Укажите номер аудитории.');
    }
    number = normalized;
  }

  if (patch.capacity !== undefined && !isValidCapacity(patch.capacity)) {
    return fail('INVALID_INPUT', 'Вместимость должна быть положительным целым числом.');
  }

  let equipment: string[] | undefined;
  if (patch.equipment !== undefined) {
    const normalized = normalizeEquipment(patch.equipment);
    if (!normalized) {
      return fail('INVALID_INPUT', 'Оборудование должно быть списком строк.');
    }
    equipment = normalized;
  }

  if (patch.isActive !== undefined && typeof patch.isActive !== 'boolean') {
    return fail('INVALID_INPUT', 'Признак активности должен быть логическим значением.');
  }

  return withTransaction((tx) => {
    const auditoriums = tx.read('auditoriums');
    const index = auditoriums.findIndex((room) => room.id === auditoriumId);
    if (index < 0) {
      return fail('AUDITORIUM_NOT_FOUND');
    }

    if (number !== undefined) {
      const normalizedNumber = number.toLowerCase();
      const duplicate = auditoriums.some(
        (room, roomIndex) =>
          roomIndex !== index && room.number.toLowerCase() === normalizedNumber,
      );
      if (duplicate) {
        return fail('DUPLICATE_ROOM_NUMBER');
      }
    }
    const current = auditoriums[index];
    const updated: Auditorium = {
      ...current,
      ...(number !== undefined ? { number } : {}),
      ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
      ...(equipment !== undefined ? { equipment } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    };

    const next = auditoriums.slice();
    next[index] = updated;
    tx.write('auditoriums', next);

    return ok(cloneRoom(updated));
  });
}

/** Активация/деактивация аудитории (привилегированная операция). */
export async function setAuditoriumActive(
  auditoriumId: string,
  isActive: boolean,
): Promise<ServiceResult<Auditorium>> {
  return updateAuditorium(auditoriumId, { isActive });
}

/**
 * Удаление аудитории из каталога. Исторические брони и расписание не удаляются:
 * они остаются для аудита в админ-панели.
 */
export async function deleteAuditorium(
  auditoriumId: string,
): Promise<ServiceResult<Auditorium>> {
  if (!auditoriumId) {
    return fail('INVALID_INPUT', 'Не указан идентификатор аудитории.');
  }

  return withTransaction((tx) => {
    const auditoriums = tx.read('auditoriums');
    const room = auditoriums.find((candidate) => candidate.id === auditoriumId);
    if (!room) {
      return fail('AUDITORIUM_NOT_FOUND');
    }

    tx.write(
      'auditoriums',
      auditoriums.filter((candidate) => candidate.id !== auditoriumId),
    );
    return ok(cloneRoom(room));
  });
}
