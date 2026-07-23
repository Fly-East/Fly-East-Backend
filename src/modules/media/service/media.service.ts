import MediaRepository from "../repository/media.repository";
import { IMedia } from "../types/media.types";
import { createMediaSchema } from "../validation/media.validation";
import { assertValid } from "../../shared";

class MediaService {
    constructor(private readonly mediaRepository: MediaRepository) {}

    async createMedia(media: unknown): Promise<IMedia> {
        const validated = assertValid(createMediaSchema, media);
        return this.mediaRepository.createMedia(validated);
    }

    async getMediaById(id: string): Promise<IMedia | null> {
        return this.mediaRepository.getMediaById(id);
    }

    async getMedia({ ownerId, type, typeId }: { ownerId: string, type?: IMedia["type"], typeId?: string }): Promise<IMedia[] | null> {
        return this.mediaRepository.getMedia({ ownerId, type, typeId });
    }
}

export default MediaService;