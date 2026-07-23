import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
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


export { uploadOnCloudinary };
