export type { CreateAuditoriumInput, UpdateAuditoriumInput } from '../auditoriums';
export type { BookingFilter } from '../booking';
export type { RoomBlockFilter } from '../availability';

/** Входные данные блокировки: createdBy подставляет фасад из сессии админа. */
export interface AdminCreateRoomBlockInput {
  auditoriumId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
}
