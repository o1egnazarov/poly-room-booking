export type {
  AuditoriumCatalogOptions,
  AuditoriumSearchOptions,
  AuditoriumSearchResult,
  CreateAuditoriumInput,
  UpdateAuditoriumInput,
} from './types';
export {
  createAuditorium,
  deleteAuditorium,
  getAuditoriumById,
  getAuditoriumByNumber,
  getCatalog,
  listAllAuditoriums,
  searchAvailable,
  setAuditoriumActive,
  updateAuditorium,
} from './auditoriums.service';
