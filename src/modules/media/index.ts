import { Media } from "./model/media.model";
import MediaRepository from "./repository/media.repository";
import MediaService from "./service/media.service";

const mediaRepository = new MediaRepository(Media);
export const mediaService = new MediaService(mediaRepository);

export type { IMedia, CreateMediaInput } from "./types/media.types";
export { createMediaSchema } from "./validation/media.validation";
export {
    MEDIA_TYPES,
    MEDIA_OWNER_TYPES,
    MEDIA_PROVIDERS,
} from "./constants/media.constants";
export type {
    MediaType,
    MediaOwnerType,
    MediaProvider,
} from "./constants/media.constants";
