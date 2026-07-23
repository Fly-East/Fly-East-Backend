import { Model, Types } from "mongoose";
import { CreateMediaInput, IMedia } from "../types/media.types";

class MediaRepository {
    constructor(private readonly mediaModel: Model<IMedia>) {}

    async createMedia(media: CreateMediaInput): Promise<IMedia> {
        return this.mediaModel.create({
            ...media,
            owner: {
                type: media.owner.type,
                id: new Types.ObjectId(media.owner.id),
            },
        });
    }

    async getMediaById(id: string): Promise<IMedia | null> {
        return this.mediaModel.findById(id);
    }

    async getMedia({ ownerId, type, typeId }: { ownerId: string, type?: IMedia["type"], typeId?: string }): Promise<IMedia[] | null> {
        return this.mediaModel.find({ "owner.id": ownerId, type, "owner.type": typeId });
    }
}

export default MediaRepository;