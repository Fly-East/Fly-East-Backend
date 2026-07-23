export const MEDIA_TYPES = ["Image", "Video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_OWNER_TYPES = ["Itinerary"] as const;
export type MediaOwnerType = (typeof MEDIA_OWNER_TYPES)[number];

export const MEDIA_PROVIDERS = ["cloudinary", "cdn"] as const;
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];
