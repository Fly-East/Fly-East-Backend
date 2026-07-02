import multer from "multer";
import { Request } from "express";

// Use memory storage instead of disk storage to avoid manual cleanup
const storage = multer.memoryStorage();

// File filter to accept all files for debugging
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // For now, accept all files to debug the upload issue
  cb(null, true);
};

const parsedSizeMb = Number(process.env.MULTER_FILE_SIZE_MB ?? "100");
const fileSizeMb = Number.isNaN(parsedSizeMb) ? 100 : Math.max(parsedSizeMb, 1);

// Initialize multer with configuration
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    // File size limit is now configurable via MULTER_FILE_SIZE_MB (default ~100MB)
    fileSize: fileSizeMb * 1024 * 1024,
  },
});

// Error handling middleware
export const handleMulterError = (
  err: any,
  req: Request,
  res: any,
  next: any
) => {
  const allowedFileFields = ["coverImage", "routeMap"];

  if (err instanceof multer.MulterError) {
    let message = err.message;

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      const unexpectedField = err.field || "<unknown>";
      message = `Unexpected file field "${unexpectedField}". Allowed file fields: ${allowedFileFields.join(
        ", "
      )}.`;
      console.warn(
        `[multer] unexpected field "${unexpectedField}" received.`,
        "Current body keys:",
        Object.keys(req.body)
      );
    } else {
      console.warn("[multer] upload error:", err.code, err.message);
    }

    return res.status(400).json({
      status: "error",
      message,
    });
  } else if (err) {
    console.warn("[multer] unknown error:", err);
    return res.status(400).json({
      status: "error",
      message: err.message || "File upload error",
    });
  }
  // No error, proceed to next middleware
  next();
};
