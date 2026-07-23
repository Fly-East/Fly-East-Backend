import { deleteImage } from "../../../utils/cloudinary";

export type CloudinaryUploadRef = {
  publicId: string;
  resourceType?: "image" | "video" | "raw" | "auto";
};

/**
 * Best-effort cleanup for Cloudinary uploads that should be discarded
 * after a failed DB transaction or similar rollback path.
 */
export const cleanupCloudinaryUploads = async (
  uploads: CloudinaryUploadRef[]
): Promise<void> => {
  if (uploads.length === 0) {
    return;
  }

  await Promise.allSettled(
    uploads.map((item) =>
      deleteImage(item.publicId, {
        resourceType: item.resourceType ?? "image",
      })
    )
  );
};
