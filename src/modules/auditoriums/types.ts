import type { Auditorium, Role } from '../../shared/types/domain';
import type { AvailabilityConflict } from '../availability';

export interface AuditoriumCatalogOptions {
  /** Для админ-таблицы: показывать и деактивированные аудитории. */
  includeInactive?: boolean;
}

export interface AuditoriumSearchOptions {
  /**
   * Роль инициатора поиска. Только преподавателю разрешено видеть комнаты,
   * занятые исключительно студенческими бронями (с флагом teacherPreemptable),
   * чтобы затем воспользоваться приоритетом преподавателя.
   */
  requesterRole?: Role;
}

export interface AuditoriumSearchResult {
  auditorium: Auditorium;
  /** Комната полностью свободна на запрошенный интервал. */
  isFree: boolean;
  /** Занята только студенческими бронями: преподаватель может вытеснить. */
  teacherPreemptable: boolean;
  conflicts: AvailabilityConflict[];
}

export interface CreateAuditoriumInput {
  number: string;
  capacity: number;
  equipment: string[];
  isActive?: boolean;
}

export interface UpdateAuditoriumInput {
  number?: string;
  capacity?: number;
  equipment?: string[];
  isActive?: boolean;
}
