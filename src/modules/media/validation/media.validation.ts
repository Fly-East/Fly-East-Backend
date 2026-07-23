import { z } from "zod";
import {
    MEDIA_OWNER_TYPES,
    MEDIA_PROVIDERS,
    MEDIA_TYPES,
} from "../constants/media.constants";

const objectIdSchema = z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/, "Invalid ObjectId");

const createMediaSchema = z.object({
    type: z.enum(MEDIA_TYPES),
    owner: z.object({
        type: z.enum(MEDIA_OWNER_TYPES),
        id: objectIdSchema,
    }),
    provider: z.enum(MEDIA_PROVIDERS),
    url: z.string(),
    publicId: z.string().optional(),
    originalName: z.string(),
    mimeType: z.string().optional(),
    size: z.number().optional(),
    height: z.number().optional(),
    width: z.number().optional(),
    duration: z.number().optional(),
});

export { createMediaSchema };
