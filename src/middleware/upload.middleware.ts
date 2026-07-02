import multer from "multer";
import { v2 as cloudinaryV2 } from "cloudinary";
import { Request } from "express";
import { Readable } from "stream";

// Configure Cloudinary
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 120000, // 2 minutes timeout
});

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: any) => {
    const allowedTypes = ["image/", "video/"];
    if (allowedTypes.some((type) => file.mimetype.startsWith(type))) {
      cb(null, true);
    } else {
      cb(new Error("Only image and video files are allowed!"));
    }
  },
});

// Upload to Cloudinary
const uploadToCloudinary = (file: Express.Multer.File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const resourceType = file.mimetype.startsWith("video")
      ? "video"
      : file.mimetype.startsWith("audio")
      ? "video" // Cloudinary handles audio uploads as 'video'
      : "image";

    const uploadStream = cloudinaryV2.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder: "travel-backend",
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return reject(new Error("Failed to upload file to Cloudinary"));
        }
        if (!result) {
          console.error("Cloudinary result is empty");
          return reject(new Error("No result from Cloudinary"));
        }
        resolve(result.secure_url);
      }
    );

    const stream = new Readable();
    stream.push(file.buffer);
    stream.push(null);
    stream.pipe(uploadStream);
  });
};

export { upload, uploadToCloudinary };
