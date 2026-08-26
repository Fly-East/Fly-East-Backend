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
  // Add other properties you need from the response
}
dotenv.config(); // Load environment variables

// Configuration
cloudinary.config({
  cloud_name: process.env.Cloudinary_Cloud_Name,
  api_key: process.env.Cloudinary_API_Key,
  api_secret: process.env.Cloudinary_API_Secret,
});

interface UploadOptions {
  filename?: string;
  contentType?: string;
}

const uploadOnCloudinary = async (file: string | Buffer, options?: UploadOptions): Promise<CloudinaryUploadResponse | null> => {
  try {
    if (!file) return null;
    
    let response;
    
    if (Buffer.isBuffer(file)) {
      // Handle buffer upload
      response = await new Promise<CloudinaryUploadResponse>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'auto',
            filename_override: options?.filename,
            folder: 'travel-packages',
            use_filename: true,
            unique_filename: true,
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else if (!result) {
              reject(new Error('No result from Cloudinary'));
            } else {
              resolve(result as CloudinaryUploadResponse);
            }
          }
        );
        
        const bufferStream = require('stream').Readable.from(file);
        bufferStream.pipe(uploadStream);
      });
    } else {
      // Handle file path upload (original behavior)
      response = await cloudinary.uploader.upload(file, {
        resource_type: 'auto',
      });
      
      // Clean up the temp file
      try {
        fs.unlinkSync(file);
      } catch (e) {
        logger.error('Error deleting temp file:', e);
      }
    }
    
    return response;
  } catch (error) {
    logger.error('Error uploading to Cloudinary:', error);
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

/**
 * Downloads a Cloudinary asset. Falls back to signed / private download URLs
 * when the public URL returns 401 (common for restricted PDFs).
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

  try {
    return await tryGet(options.url);
  } catch (directErr) {
    logger.warn(
      `[cloudinary] Direct download failed for ${options.publicId}, trying signed URLs: ${directErr}`
    );
  }

  const resourceTypes = Array.from(
    new Set(
      [options.resourceType, "raw", "image", "auto"].filter(
        (v): v is string => Boolean(v)
      )
    )
  );

  const formatGuess =
    options.url.split(".").pop()?.split(/[?#]/)[0]?.toLowerCase() || "pdf";

  let lastErr: unknown;
  for (const resource_type of resourceTypes) {
    try {
      const signedUrl = cloudinary.url(options.publicId, {
        resource_type,
        type: "upload",
        sign_url: true,
        secure: true,
      });
      return await tryGet(signedUrl);
    } catch (err) {
      lastErr = err;
    }

    try {
      const signedPdfUrl = cloudinary.url(options.publicId, {
        resource_type,
        type: "upload",
        sign_url: true,
        secure: true,
        format: formatGuess,
      });
      return await tryGet(signedPdfUrl);
    } catch (err) {
      lastErr = err;
    }

    try {
      const privateUrl = cloudinary.utils.private_download_url(
        options.publicId,
        formatGuess,
        { resource_type, type: "upload" }
      );
      return await tryGet(privateUrl);
    } catch (err) {
      lastErr = err;
    }
  }

  // Last resort: Admin API download endpoint (authenticated with API key/secret)
  for (const resource_type of resourceTypes) {
    try {
      const cloudName = process.env.Cloudinary_Cloud_Name;
      const apiKey = process.env.Cloudinary_API_Key;
      const apiSecret = process.env.Cloudinary_API_Secret;
      if (!cloudName || !apiKey || !apiSecret) break;

      const adminUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resource_type}/download`;
      const response = await axios.post(
        adminUrl,
        new URLSearchParams({
          public_ids: options.publicId,
          resource_type,
          type: "upload",
        }).toString(),
        {
          auth: { username: apiKey, password: apiSecret },
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          responseType: "arraybuffer",
          timeout: 30_000,
          maxRedirects: 5,
        }
      );
      return Buffer.from(response.data);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Failed to download Cloudinary asset ${options.publicId}`);
}

export { uploadOnCloudinary };
