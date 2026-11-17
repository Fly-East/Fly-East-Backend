
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import axios from "axios";
import fs from "fs";
import { Readable } from "stream";
import { extractPublicId } from "cloudinary-build-url";
import dotenv from "dotenv";
import logger from "./logger";

dotenv.config();

// Extend Cloudinary response.
interface CloudinaryUploadResponse extends UploadApiResponse {
  url: string;
  secure_url: string;
  public_id: string;
}

// Configure Cloudinary.
cloudinary.config({
  cloud_name: process.env.Cloudinary_Cloud_Name,
  api_key: process.env.Cloudinary_API_Key,
  api_secret: process.env.Cloudinary_API_Secret,
});

// Upload options.
interface UploadOptions {
  filename?: string;
  contentType?: string;
  folder?: string;
  resourceType?: "image" | "video" | "raw" | "auto";
}

/**
 * Uploads a file to Cloudinary.
 *
 * Supports:
 * - Buffer files from Multer memoryStorage
 * - Local file paths
 * - Images
 * - Videos
 * - Raw files
 */
const uploadOnCloudinary = async (
  file: string | Buffer,
  options?: UploadOptions
): Promise<CloudinaryUploadResponse | null> => {
  try {
    if (!file || (Buffer.isBuffer(file) && file.length === 0)) {
      return null;
    }

    const resourceType = options?.resourceType ?? "auto";
    const folder = options?.folder ?? "travel-packages";

    const uploadOptions = {
      resource_type: resourceType,
      filename_override: options?.filename,
      folder,
      use_filename: true,
      unique_filename: true,
    };

    let response: CloudinaryUploadResponse;

    // Buffer upload: Multer memoryStorage.
    if (Buffer.isBuffer(file)) {
      response = await new Promise<CloudinaryUploadResponse>(
        (resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
              if (error) {
                reject(error);
                return;
              }

              if (!result) {
                reject(
                  new Error("No result returned from Cloudinary")
                );
                return;
              }

              resolve(result as CloudinaryUploadResponse);
            }
          );

          // Important: Send the entire Buffer as one stream chunk.
          Readable.from([file]).pipe(uploadStream);
        }
      );
    } else {
      // Local file path upload.
      response = (await cloudinary.uploader.upload(
        file,
        uploadOptions
      )) as CloudinaryUploadResponse;

      // Delete temporary local file after successful upload.
      try {
        fs.unlinkSync(file);
      } catch (error) {
        logger.error(
          "Error deleting temporary file:",
          error
        );
      }
    }

    return response;
  } catch (error) {
    logger.error("Error uploading to Cloudinary:", error);
    return null;
  }
};

/**
 * Deletes an asset from Cloudinary.
 *
 * Use resourceType "video" for videos.
 * Use resourceType "image" for images.
 */
export const deleteImage = async (
  publicId: string,
  options?: {
    resourceType?: "image" | "video" | "raw" | "auto";
  }
) => {
  try {
    if (!publicId) {
      return null;
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: options?.resourceType ?? "image",
    });

    return result;
  } catch (error) {
    logger.error("Error deleting Cloudinary asset:", error);
    throw error;
  }
};

/**
 * Extracts Cloudinary public ID from an asset URL.
 */
export const getPublicId = (imageUrl: string): string | null => {
  try {
    if (!imageUrl) {
      return null;
    }

    return extractPublicId(imageUrl);
  } catch (error) {
    logger.error("Error extracting public ID:", error);
    return null;
  }
};

// Download options.
type DownloadCloudinaryAssetOptions = {
  url: string;
  publicId: string;
  resourceType?: string;
};

/**
 * Downloads a Cloudinary asset.
 *
 * First attempts the original URL.
 * Falls back to signed/private download URLs
 * when the public URL returns 401 or fails.
 */
export async function downloadCloudinaryAsset(
  options: DownloadCloudinaryAssetOptions
): Promise<Buffer> {
  const tryGet = async (downloadUrl: string): Promise<Buffer> => {
    const response = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
      timeout: 30_000,
    });

    return Buffer.from(response.data);
  };

  // First attempt: original URL.
  try {
    return await tryGet(options.url);
  } catch (directError) {
    logger.warn(
      `[cloudinary] Direct download failed for ${options.publicId}, trying signed URLs: ${directError}`
    );
  }

  const resourceTypes = Array.from(
    new Set(
      [options.resourceType, "raw", "image", "video", "auto"].filter(
        (value): value is string => Boolean(value)
      )
    )
  );

  const formatGuess =
    options.url
      .split(".")
      .pop()
      ?.split(/[?#]/)[0]
      ?.toLowerCase() || "pdf";

  let lastError: unknown;

  // Try signed and private download URLs.
  for (const resource_type of resourceTypes) {
    // Signed URL.
    try {
      const signedUrl = cloudinary.url(options.publicId, {
        resource_type,
        type: "upload",
        sign_url: true,
        secure: true,
      });

      return await tryGet(signedUrl);
    } catch (error) {
      lastError = error;
    }

    // Signed URL with format.
    try {
      const signedUrlWithFormat = cloudinary.url(
        options.publicId,
        {
          resource_type,
          type: "upload",
          sign_url: true,
          secure: true,
          format: formatGuess,
        }
      );

      return await tryGet(signedUrlWithFormat);
    } catch (error) {
      lastError = error;
    }

    // Private download URL.
    try {
      const privateUrl = cloudinary.utils.private_download_url(
        options.publicId,
        formatGuess,
        {
          resource_type,
          type: "upload",
        }
      );

      return await tryGet(privateUrl);
    } catch (error) {
      lastError = error;
    }
  }

  // Last resort: Cloudinary Admin API.
  for (const resource_type of resourceTypes) {
    try {
      const cloudName = process.env.Cloudinary_Cloud_Name;
      const apiKey = process.env.Cloudinary_API_Key;
      const apiSecret = process.env.Cloudinary_API_Secret;

      if (!cloudName || !apiKey || !apiSecret) {
        break;
      }

      const adminUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resource_type}/download`;

      const response = await axios.post(
        adminUrl,
        new URLSearchParams({
          public_ids: options.publicId,
          resource_type,
          type: "upload",
        }).toString(),
        {
          auth: {
            username: apiKey,
            password: apiSecret,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          responseType: "arraybuffer",
          timeout: 30_000,
          maxRedirects: 5,
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        `Failed to download Cloudinary asset ${options.publicId}`
      );
}

export { uploadOnCloudinary };
