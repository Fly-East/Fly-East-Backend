import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import axios from "axios";
import fs from "fs";
import { extractPublicId } from "cloudinary-build-url";
import dotenv from "dotenv";
import logger from "./logger";

// Extend the UploadApiResponse to include the url property
interface CloudinaryUploadResponse extends UploadApiResponse {
  url: string;
  secure_url: string;
  public_id: string;
}
dotenv.config();

cloudinary.config({
  cloud_name: process.env.Cloudinary_Cloud_Name,
  api_key: process.env.Cloudinary_API_Key,
  api_secret: process.env.Cloudinary_API_Secret,
});

interface UploadOptions {
  filename?: string;
  contentType?: string;
}

const uploadOnCloudinary = async (
  file: string | Buffer,
  options?: UploadOptions
): Promise<CloudinaryUploadResponse | null> => {
  try {
    if (!file) return null;

    let response;

    if (Buffer.isBuffer(file)) {
      response = await new Promise<CloudinaryUploadResponse>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "auto",
            filename_override: options?.filename,
            folder: "travel-packages",
            use_filename: true,
            unique_filename: true,
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else if (!result) {
              reject(new Error("No result from Cloudinary"));
            } else {
              resolve(result as CloudinaryUploadResponse);
            }
          }
        );

        const bufferStream = require("stream").Readable.from(file);
        bufferStream.pipe(uploadStream);
      });
    } else {
      response = await cloudinary.uploader.upload(file, {
        resource_type: "auto",
      });

      try {
        fs.unlinkSync(file);
      } catch (e) {
        logger.error("Error deleting temp file:", e);
      }
    }

    return response;
  } catch (error) {
    logger.error("Error uploading to Cloudinary:", error);
    return null;
  }
};

export const deleteImage = async (
  publicId: string,
  options?: { resourceType?: "image" | "video" | "raw" | "auto" }
) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: options?.resourceType ?? "image",
    });
    return result;
  } catch (error) {
    logger.error("Error deleting image:", error);
    throw error;
  }
};

export const getPublicId = (imageUrl: string): string | null => {
  try {
    return extractPublicId(imageUrl);
  } catch (error) {
    logger.error("Error extracting public ID:", error);
    return null;
  }
};

type DownloadCloudinaryAssetOptions = {
  url: string;
  publicId: string;
  resourceType?: string;
};

function candidateCloudinaryUrls(
  options: DownloadCloudinaryAssetOptions
): string[] {
  const resourceTypes = Array.from(
    new Set(
      [options.resourceType, "raw", "image", "auto"].filter(
        (v): v is string => Boolean(v)
      )
    )
  );

  const formatGuess =
    options.url.split(".").pop()?.split(/[?#]/)[0]?.toLowerCase() || "pdf";

  const urls: string[] = [];
  if (options.url) urls.push(options.url);

  for (const resource_type of resourceTypes) {
    urls.push(
      cloudinary.url(options.publicId, {
        resource_type,
        type: "upload",
        sign_url: true,
        secure: true,
      })
    );
    urls.push(
      cloudinary.url(options.publicId, {
        resource_type,
        type: "upload",
        sign_url: true,
        secure: true,
        format: formatGuess,
      })
    );
    urls.push(
      cloudinary.utils.private_download_url(options.publicId, formatGuess, {
        resource_type,
        type: "upload",
      })
    );
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

/**
 * Returns a reachable Cloudinary URL (signed if the public URL 401s).
 */
export async function resolveCloudinaryDownloadUrl(
  options: DownloadCloudinaryAssetOptions
): Promise<string> {
  let lastErr: unknown;
  for (const downloadUrl of candidateCloudinaryUrls(options)) {
    try {
      await axios.head(downloadUrl, { timeout: 15_000, maxRedirects: 5 });
      return downloadUrl;
    } catch (err) {
      lastErr = err;
      try {
        await axios.get(downloadUrl, {
          responseType: "arraybuffer",
          timeout: 15_000,
          headers: { Range: "bytes=0-0" },
        });
        return downloadUrl;
      } catch (getErr) {
        lastErr = getErr;
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Failed to resolve Cloudinary URL for ${options.publicId}`);
}

/**
 * Downloads a Cloudinary asset. Falls back to signed URLs when public
 * delivery returns 401 (common for restricted PDFs).
 */
export async function downloadCloudinaryAsset(
  options: DownloadCloudinaryAssetOptions
): Promise<Buffer> {
  const url = await resolveCloudinaryDownloadUrl(options);
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30_000,
  });
  return Buffer.from(response.data);
}

export { uploadOnCloudinary };
