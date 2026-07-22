import { Schema, model } from "mongoose";
import { IMedia } from "../types/media.types";

const mediaSchema = new Schema<IMedia>(
    {
        title: {
            type: String,
            trim: true,
        },

        type: {
            type: String,
            enum: ["Image", "Video"],
            required: true,
        },

        owner: {
            type: {
                type: String,
                required: true,
            },

            id: {
                type: Schema.Types.ObjectId,
                required: true,
            },
        },

        provider: {
            type: String,
            enum: ["cloudinary", "cdn"],
            default: "cloudinary",
            required: true,
        },

        url: {
            type: String,
            required: true,
            trim: true,
        },

        publicId: {
            type: String,
            trim: true,
        },

        originalName: {
            type: String,
            required: true,
            trim: true,
        },

        mimeType: {
            type: String,
            required: true,
            trim: true,
        },

        size: {
            type: Number,
            required: true,
        },

        height: {
            type: Number,
        },

        width: {
            type: Number,
        },

        duration: {
            type: Number,
        },
    },
    {
        timestamps: true,
    }
);

mediaSchema.index({
    "owner.type": 1,
    "owner.id": 1,
});

mediaSchema.index({
    "owner.id": 1,
    type: 1,
});


export const Media = model<IMedia>("Media", mediaSchema);