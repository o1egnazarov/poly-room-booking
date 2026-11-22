import type { Auditorium, Booking, RoomBlock, User } from '../../shared/types/domain';
import type { ServiceResult } from '../../shared/types/result';
import * as auditoriumsService from '../auditoriums';
import type { CreateAuditoriumInput, UpdateAuditoriumInput } from '../auditoriums';
import * as availabilityService from '../availability';
import type { RoomBlockFilter } from '../availability';
import * as bookingService from '../booking';
import type { BookingFilter } from '../booking';
import { requireRole } from '../users';
import type { AdminCreateRoomBlockInput } from './types';

/**
 * Фасад административных сценариев (UC-05, AC-06).
 *
 * Каждый метод начинается с проверки роли admin на уровне домена:
 * скрытие кнопок в UI не является защитой (AGENT.md, правило 4).
 */
async function requireAdmin(): Promise<ServiceResult<User>> {
  return requireRole('admin');
}

// --- Аудитории -------------------------------------------------------------

/** Все аудитории, включая деактивированные. */
export async function getAuditoriums(): Promise<ServiceResult<Auditorium[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }
  return auditoriumsService.listAllAuditoriums();
}

export async function createAuditorium(
  input: CreateAuditoriumInput,
): Promise<ServiceResult<Auditorium>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }
  return auditoriumsService.createAuditorium(input);
}

export async function updateAuditorium(
  auditoriumId: string,
  patch: UpdateAuditoriumInput,
): Promise<ServiceResult<Auditorium>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }
  return auditoriumsService.updateAuditorium(auditoriumId, patch);
}

export async function setAuditoriumActive(
  auditoriumId: string,
  isActive: boolean,
): Promise<ServiceResult<Auditorium>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }
  return auditoriumsService.setAuditoriumActive(auditoriumId, isActive);
}

export async function deleteAuditorium(
  auditoriumId: string,
): Promise<ServiceResult<Auditorium>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }
  return auditoriumsService.deleteAuditorium(auditoriumId);
}

// --- Блокировки аудиторий --------------------------------------------------

export async function getRoomBlocks(
  filter: RoomBlockFilter = {},
): Promise<ServiceResult<RoomBlock[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }
  return availabilityService.listRoomBlocks(filter);
}

export async function createRoomBlock(
  input: AdminCreateRoomBlockInput,
): Promise<ServiceResult<RoomBlock>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }

  // Проверяем существование аудитории до создания блокировки.
  const auditorium = await auditoriumsService.getAuditoriumById(input.auditoriumId);
  if (!auditorium.ok) {
    return auditorium;
  }

  return availabilityService.createRoomBlock({
    auditoriumId: input.auditoriumId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    reason: input.reason,
    createdBy: gate.data.universityId,
  });
}

export async function deleteRoomBlock(blockId: string): Promise<ServiceResult<RoomBlock>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }
  return availabilityService.deleteRoomBlock(blockId);
}

// --- Все бронирования ------------------------------------------------------

export async function getAllBookings(
  filter: BookingFilter = {},
): Promise<ServiceResult<Booking[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }
  return bookingService.listAllBookings(filter);
}

export async function cancelAnyBooking(bookingId: string): Promise<ServiceResult<Booking>> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate;
  }
  return bookingService.cancelBookingByAdmin(bookingId);
}
