import { ClientSession } from "mongoose";
import MediaRepository from "../repository/media.repository";
import { IMedia } from "../types/media.types";
import { createMediaSchema } from "../validation/media.validation";
import { assertValid } from "../../shared";

class MediaService {
    constructor(private readonly mediaRepository: MediaRepository) {}

    async createMedia(
        media: unknown,
        session?: ClientSession
    ): Promise<IMedia> {
        const validated = assertValid(createMediaSchema, media);
        return this.mediaRepository.createMedia(validated, session);
    }

    async createManyMedia(
        mediaItems: unknown[],
        session?: ClientSession
    ): Promise<IMedia[]> {
        const validated = mediaItems.map((media) =>
            assertValid(createMediaSchema, media)
        );
        return this.mediaRepository.createManyMedia(validated, session);
    }

    async getMediaById(id: string): Promise<IMedia | null> {
        return this.mediaRepository.getMediaById(id);
    }

    async getMedia({
        ownerId,
        type,
        typeId,
    }: {
        ownerId: string;
        type?: IMedia["type"];
        typeId?: string;
    }): Promise<IMedia[]> {
        return this.mediaRepository.getMedia({ ownerId, type, typeId });
    }

    async getMediaByOwnerIds({
        ownerIds,
        ownerType,
        type,
    }: {
        ownerIds: string[];
        ownerType: IMedia["owner"]["type"];
        type?: IMedia["type"];
    }): Promise<IMedia[]> {
        return this.mediaRepository.getMediaByOwnerIds({
            ownerIds,
            ownerType,
            type,
        });
    }

    async deleteByOwner({
        ownerId,
        ownerType,
        type,
        session,
    }: {
        ownerId: string;
        ownerType: IMedia["owner"]["type"];
        type?: IMedia["type"];
        session?: ClientSession;
    }): Promise<IMedia[]> {
        return this.mediaRepository.deleteByOwner({
            ownerId,
            ownerType,
            type,
            session,
        });
    }
}

export default MediaService;
