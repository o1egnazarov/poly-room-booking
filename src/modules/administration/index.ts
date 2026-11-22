export type {
  AdminCreateRoomBlockInput,
  BookingFilter,
  CreateAuditoriumInput,
  RoomBlockFilter,
  UpdateAuditoriumInput,
} from './types';
export {
  cancelAnyBooking,
  createAuditorium,
  createRoomBlock,
  deleteAuditorium,
  deleteRoomBlock,
  getAllBookings,
  getAuditoriums,
  getRoomBlocks,
  setAuditoriumActive,
  updateAuditorium,
} from './administration.service';
