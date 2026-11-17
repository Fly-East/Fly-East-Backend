// import multer from "multer";
// import { Request } from "express";

// // Use memory storage instead of disk storage to avoid manual cleanup
// const storage = multer.memoryStorage();

// // File filter to accept all files for debugging
// const fileFilter = (
//   req: Request,
//   file: Express.Multer.File,
//   cb: multer.FileFilterCallback
// ) => {
//   // For now, accept all files to debug the upload issue
//   cb(null, true);
// };

// const parsedSizeMb = Number(process.env.MULTER_FILE_SIZE_MB ?? "100");
// const fileSizeMb = Number.isNaN(parsedSizeMb) ? 100 : Math.max(parsedSizeMb, 1);

// // Initialize multer with configuration
// export const upload = multer({
//   storage: storage,
//   fileFilter: fileFilter,
//   limits: {
//     // File size limit is now configurable via MULTER_FILE_SIZE_MB (default ~100MB)
//     fileSize: fileSizeMb * 1024 * 1024,
//   },
// });

// // Error handling middleware
// export const handleMulterError = (
//   err: any,
//   req: Request,
//   res: any,
//   next: any
// ) => {
//   const allowedFileFields = [
//   "coverImage",
//   "routeMap",
//   "image",
//   "images",
//   "video",
//   "videos",
//   "banner",
//   "gallery",
//   "galleryFiles",
//   "videoFiles",
//   "pdf",
// ];

//   if (err instanceof multer.MulterError) {
//     let message = err.message;

//     if (err.code === "LIMIT_UNEXPECTED_FILE") {
//       const unexpectedField = err.field || "<unknown>";
//       message = `Unexpected file field "${unexpectedField}". Allowed file fields: ${allowedFileFields.join(
//         ", "
//       )}.`;
//       console.warn(
//         `[multer] unexpected field "${unexpectedField}" received.`,
//         "Current body keys:",
//         Object.keys(req.body)
//       );
//     } else {
//       console.warn("[multer] upload error:", err.code, err.message);
//     }

//     return res.status(400).json({
//       status: "error",
//       message,
//     });
//   } else if (err) {
//     console.warn("[multer] unknown error:", err);
//     return res.status(400).json({
//       status: "error",
//       message: err.message || "File upload error",
//     });
//   }
//   // No error, proceed to next middleware
//   next();
// };




import multer from "multer";
import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";

// Use memory storage because Cloudinary uploads use file.buffer.
const storage = multer.memoryStorage();

// Supported MIME types.
const allowedMimeTypes = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",

  // Videos
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",

  // Documents
  "application/pdf",
]);

const fileFilter: multer.Options["fileFilter"] = (
  req,
  file,
  cb
) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    return cb(null, true);
  }

  return cb(
    new Error(
      `Unsupported file type: ${file.mimetype}. Please upload an image, video, or PDF.`
    )
  );
};

// Configurable maximum file size.
// Default: 100 MB per file.
const parsedSizeMb = Number(
  process.env.MULTER_FILE_SIZE_MB ?? "100"
);

const fileSizeMb =
  Number.isFinite(parsedSizeMb) && parsedSizeMb >= 1
    ? parsedSizeMb
    : 100;

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: fileSizeMb * 1024 * 1024,
  },
});

// Fields accepted by different upload routes.
const allowedFileFields = [
  "coverImage",
  "routeMap",
  "image",
  "images",
  "video",
  "videos",
  "banner",
  "gallery",
  "galleryFiles",
  "videoFiles",
  "pdf",
];

// Centralized Multer error handler.
export const handleMulterError: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    let message = err.message;

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      const unexpectedField = err.field || "<unknown>";

      message = `Unexpected file field "${unexpectedField}". Allowed file fields: ${allowedFileFields.join(
        ", "
      )}.`;

      console.warn(
        `[multer] Unexpected file field "${unexpectedField}".`,
        "Current body keys:",
        Object.keys(req.body || {})
      );
    } else if (err.code === "LIMIT_FILE_SIZE") {
      message = `File size exceeds the maximum allowed limit of ${fileSizeMb} MB.`;
    } else {
      console.warn(
        "[multer] Upload error:",
        err.code,
        err.message
      );
    }

    res.status(400).json({
      status: "error",
      message,
    });

    return;
  }

  if (err instanceof Error) {
    console.warn("[multer] File upload error:", err.message);

    res.status(400).json({
      status: "error",
      message: err.message || "File upload error",
    });

    return;
  }

  next(err);
};

