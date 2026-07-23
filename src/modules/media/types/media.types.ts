import { Types } from "mongoose";
import { z } from "zod";
import {
    MediaOwnerType,
    MediaProvider,
    MediaType,
} from "../constants/media.constants";
import { createMediaSchema } from "../validation/media.validation";

interface IMedia {
    title?: string;

    type: MediaType;

    owner: {
        type: MediaOwnerType;
        id: Types.ObjectId;
    };

    provider: MediaProvider;

    url: string;

    publicId?: string;

    originalName: string;
    mimeType: string;
    size: number;

    height?: number;
    width?: number;
    duration?: number;

    createdAt?: Date;
    updatedAt?: Date;
}

type CreateMediaInput = z.infer<typeof createMediaSchema>;

export { IMedia, CreateMediaInput };
