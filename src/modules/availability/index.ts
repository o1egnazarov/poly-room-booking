export type {
  AvailabilityCheck,
  AvailabilityConflict,
  CheckAvailabilityInput,
  ConflictSource,
  CreateRoomBlockInput,
  RoomBlockFilter,
} from './types';
export {
  checkAvailability,
  createRoomBlock,
  deleteRoomBlock,
  getOccupiedIntervals,
  getRoomBlockById,
  listRoomBlocks,
} from './availability.service';
