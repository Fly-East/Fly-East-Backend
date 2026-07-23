import { ClientSession, Model, Types } from "mongoose";
import { CreateMediaInput, IMedia } from "../types/media.types";

class MediaRepository {
    constructor(private readonly mediaModel: Model<IMedia>) {}

    async createMedia(
        media: CreateMediaInput,
        session?: ClientSession
    ): Promise<IMedia> {
        const [created] = await this.mediaModel.create(
            [
                {
                    ...media,
                    owner: {
                        type: media.owner.type,
                        id: new Types.ObjectId(media.owner.id),
                    },
                },
            ],
            { session }
        );
        return created;
    }

    async createManyMedia(
        mediaItems: CreateMediaInput[],
        session?: ClientSession
    ): Promise<IMedia[]> {
        if (mediaItems.length === 0) {
            return [];
        }

        return this.mediaModel.create(
            mediaItems.map((media) => ({
                ...media,
                owner: {
                    type: media.owner.type,
                    id: new Types.ObjectId(media.owner.id),
                },
            })),
            { session }
        );
    }

    async getMediaById(id: string): Promise<IMedia | null> {
        return this.mediaModel.findById(id);
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
        return this.mediaModel.find({
            "owner.id": new Types.ObjectId(ownerId),
            ...(type ? { type } : {}),
            ...(typeId ? { "owner.type": typeId } : {}),
        });
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
        if (ownerIds.length === 0) {
            return [];
        }

        return this.mediaModel
            .find({
                "owner.id": {
                    $in: ownerIds.map((id) => new Types.ObjectId(id)),
                },
                "owner.type": ownerType,
                ...(type ? { type } : {}),
            })
            .lean();
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
        const filter = {
            "owner.id": new Types.ObjectId(ownerId),
            "owner.type": ownerType,
            ...(type ? { type } : {}),
        };

        const existing = await this.mediaModel.find(filter).session(session ?? null);
        if (existing.length === 0) {
            return [];
        }

        await this.mediaModel.deleteMany(filter, { session });
        return existing;
    }
}

export default MediaRepository;
