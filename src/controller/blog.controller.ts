// import { NextFunction, Request, Response } from "express";
// import AppError from "../utils/appError";
// import BlogModel from "../models/blog.model";
// import { UpdateBlogInput } from "../schema/blog.schema";
// import {
//   createBlog,
//   findBlog,
//   findAndUpdateBlog,
//   deleteBlog,
//   findAllBlog,
//   deleteManyBlog,
// } from "../service/blog.service";
// import { uploadOnCloudinary } from "../utils/cloudinary";
// import logger from "../utils/logger";
// var colors = require("colors");

// export async function createBlogHandler(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const {
//       title,
//       description,
//       slug,
//       sortOrder,
//       estimatedReadTime,
//       author,
//       isActive,
//     } = req.body;

//     let bannerUrl = "";

//     // Only process image if it exists in the request
//     if (req.file && req.file.buffer) {
//       const result = await uploadOnCloudinary(req.file.buffer);

//       if (!result?.secure_url) {
//         return res.status(400).json({ message: "Image upload failed." });
//       }
//       bannerUrl = result.secure_url;
//     }

//     // If sortOrder is not provided, is 0, or is NaN, find the max sortOrder and add 1
//     let calculatedSortOrder =
//       typeof sortOrder !== "undefined" ? Number(sortOrder) : 0;
//     if (calculatedSortOrder === 0 || isNaN(calculatedSortOrder)) {
//       const lastBlog = await BlogModel.findOne({})
//         .sort({ sortOrder: -1 })
//         .select("sortOrder")
//         .lean();
//       calculatedSortOrder = lastBlog ? (lastBlog.sortOrder || 0) + 1 : 1;
//     }

//     const blogData = {
//       title,
//       description: description || "",
//       slug: slug || title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, "-"),
//       banner: bannerUrl,
//       sortOrder: calculatedSortOrder,
//       estimatedReadTime: estimatedReadTime ? Number(estimatedReadTime) : 5,
//       author: author || "Admin",
//       isActive: isActive !== undefined ? isActive : true,
//     };

//     const blog = await createBlog(blogData);

//     // Clear the blog list cache
//     await clearCacheByPrefix("blog:list");
//     await clearCacheByPrefix("");
//     res.status(201).json({
//       status: "success",
//       data: blog,
//     });
//   } catch (err: any) {
//     if (err.code === 11000) {
//       return res.status(409).json({
//         status: "fail",
//         message: "Blog with that title or slug already exists",
//       });
//     }
//     next(err);
//   }
// }

// export async function updateBlogHandler(
//   req: Request<UpdateBlogInput["params"]>,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const blogId = req.params.blogId;
//     const {
//       title,
//       description,
//       slug,
//       sortOrder,
//       estimatedReadTime,
//       author,
//       isActive,
//     } = req.body;

//     const blog = await findBlog({ _id: blogId });

//     if (!blog) {
//       return next(new AppError("Blog not found", 404));
//     }

//     let bannerUrl = blog.banner;
//     if (req.file && req.file.buffer) {
//       const result = await uploadOnCloudinary(req.file.buffer);
//       if (!result?.secure_url) {
//         return res.status(400).json({ message: "Image upload failed." });
//       }
//       bannerUrl = result.secure_url;
//     }

//     const updateData = {
//       title: title || blog.title,
//       description: description || blog.description,
//       slug: slug || blog.slug,
//       banner: bannerUrl,
//       sortOrder: sortOrder ? Number(sortOrder) : blog.sortOrder,
//       estimatedReadTime:
//         estimatedReadTime !== undefined
//           ? Number(estimatedReadTime)
//           : blog.estimatedReadTime,
//       author: author || blog.author,
//       isActive: isActive !== undefined ? isActive : blog.isActive,
//     };

//     const updatedBlog = await findAndUpdateBlog({ _id: blogId }, updateData, {
//       new: true,
//       runValidators: true,
//     });

//     // Clear relevant caches
//     await Promise.all([
//       clearCacheByPrefix(`blog:${blogId}`),
//       clearCacheByPrefix("blog:list"),
//     ]);
//     await clearCacheByPrefix("");
//     res.status(200).json({
//       status: "success",
//       data: updatedBlog,
//     });
//   } catch (err: any) {
//     if (err.code === 11000) {
//       return res.status(409).json({
//         status: "fail",
//         message: "Blog with that title or slug already exists",
//       });
//     }
//     next(err);
//   }
// }

// export async function getBlogHandler(
//   req: Request<UpdateBlogInput["params"]>,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const blogId = req.params.blogId;

//     // Generate cache key based on blog ID
//     const cacheKey = `blog:${blogId}`;

//     // Try to get from cache first
//     const cached = await getCache(cacheKey);
//     if (cached) {
//       return res.json({
//         status: "success",
//         msg: "Get success (from cache)",
//         data: cached,
//         cached: true,
//       });
//     }

//     // Check if the blogId is a valid MongoDB ObjectId
//     const isObjectId = /^[0-9a-fA-F]{24}$/.test(blogId);
//     let blog = null;

//     // Only try to find by ID if it's a valid ObjectId
//     if (isObjectId) {
//       blog = await BlogModel.findById(blogId);
//     }

//     // If not found by ID or not a valid ObjectId, try to find by slug
//     if (!blog) {
//       blog = await BlogModel.findOne({ slug: blogId });

//       // If still not found, return 404
//       if (!blog) {
//         return next(new AppError("No blog found with that ID or slug", 404));
//       }

//       // Update cache with the found blog using its ID
//       const newCacheKey = `blog:${blog._id}`;
//       await setCache(newCacheKey, blog, 3600); // Cache for 1 hour
//     }

//     // Cache the result
//     await setCache(cacheKey, blog, CACHE_TTL);

//     return res.json({
//       status: "success",
//       msg: "Get success",
//       data: blog,
//     });
//   } catch (error: any) {
//     logger.error(colors.red("msg:", error.message));
//     next(new AppError("Internal server error", 500));
//   }
// }

// export async function deleteBlogHandler(
//   req: Request<UpdateBlogInput["params"]>,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const blogId = req.params.blogId;
//     const expedition = await findBlog({ blogId });

//     if (!expedition) {
//       next(new AppError("expedition does not exist", 404));
//     }

//     await deleteBlog({ _id: blogId });

//     // Clear relevant caches
//     await clearCacheByPrefix("blog:");
//     await clearCacheByPrefix("");
//     res.status(204).json({
//       status: "success",
//       message: "Blog deleted successfully",
//     });
//   } catch (error: any) {
//     logger.error(colors.red("msg:", error.message));
//     next(new AppError("Internal server error", 500));
//   }
// }

// import {
//   getCache,
//   setCache,
//   deleteCache,
//   clearCacheByPrefix,
// } from "../utils/redis";

// // Cache TTL in seconds (1 hour)
// const CACHE_TTL = 60 * 60;

// export async function getAllBlogHandler(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     // Pagination parameters
//     const page = parseInt(req.query.page as string) || 1;
//     const limit = parseInt(req.query.limit as string) || 100;
//     const skip = (page - 1) * limit;

//     // Create a cache key that includes pagination parameters and query filters
//     const cacheKey = `blogs:all:page_${page}_limit_${limit}_${JSON.stringify(
//       req.query
//     )}`;

//     // Try to get data from cache first
//     const cachedData = await getCache(cacheKey);
//     if (cachedData) {
//       return res.json({
//         status: "success",
//         ...cachedData,
//         fromCache: true,
//       });
//     }

//     const filter: any = { ...req.query };
//     // Remove pagination parameters from filter
//     delete filter.page;
//     delete filter.limit;

//     // Get total count and paginated results
//     const [total, results] = await Promise.all([
//       BlogModel.countDocuments(filter),
//       findAllBlog(filter, {
//         lean: true,
//         skip,
//         limit,
//         sort: { sortOrder: -1, createdAt: -1 },
//       }),
//     ]);

//     // Calculate pagination metadata
//     const totalPages = Math.ceil(total / limit);
//     const hasNextPage = page < totalPages;
//     const hasPreviousPage = page > 1;

//     // Prepare response data with pagination
//     const responseData = {
//       data: results,
//       pagination: {
//         total,
//         totalPages,
//         currentPage: page,
//         itemsPerPage: limit,
//         hasNextPage,
//         hasPreviousPage,
//         nextPage: hasNextPage ? page + 1 : null,
//         previousPage: hasPreviousPage ? page - 1 : null,
//       },
//     };

//     // Store in cache for future requests
//     await setCache(cacheKey, responseData, CACHE_TTL);

//     res.json({
//       status: "success",
//       msg: "Get all success",
//       ...responseData,
//       fromCache: false,
//     });
//   } catch (error: any) {
//     logger.error(colors.red("msg:", error.message));
//     next(new AppError("Internal server error", 500));
//   }
// }

// export async function getAllBlogHandlerForCard(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     // Pagination parameters
//     const page = parseInt(req.query.page as string) || 1;
//     const limit = parseInt(req.query.limit as string) || 10;
//     const skip = (page - 1) * limit;

//     // Create a cache key that includes pagination parameters
//     const cacheKey = `blogs:card:page_${page}_limit_${limit}`;

//     // Try to get data from cache first
//     const cachedData = await getCache(cacheKey);
//     if (cachedData) {
//       return res.json({
//         status: "success",
//         ...cachedData,
//         fromCache: true,
//       });
//     }

//     // Get total count and paginated results
//     const [total, results] = await Promise.all([
//       BlogModel.countDocuments({}),
//       BlogModel.find({}, "title slug banner createdAt")
//         .sort({ sortOrder: -1, createdAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .lean(),
//     ]);

//     // Calculate pagination metadata
//     const totalPages = Math.ceil(total / limit);
//     const hasNextPage = page < totalPages;
//     const hasPreviousPage = page > 1;

//     // Prepare response data with pagination
//     const responseData = {
//       data: results,
//       pagination: {
//         total,
//         totalPages,
//         currentPage: page,
//         itemsPerPage: limit,
//         hasNextPage,
//         hasPreviousPage,
//         nextPage: hasNextPage ? page + 1 : null,
//         previousPage: hasPreviousPage ? page - 1 : null,
//       },
//     };

//     // Store in cache for future requests
//     await setCache(cacheKey, responseData, CACHE_TTL);

//     res.json({
//       status: "success",
//       msg: "Get all success",
//       ...responseData,
//       fromCache: false,
//     });
//   } catch (error: any) {
//     logger.error(colors.red("msg:", error.message));
//     next(new AppError("Internal server error", 500));
//   }
// }

// export async function deleteManyBlogHandler(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     if (req.body.id) {
//       await deleteManyBlog({ blogId: { $in: req.body.id } });
//       await clearCacheByPrefix("");
//       return res.json({
//         status: "success",
//         msg: "Delete success",
//         data: {},
//       });
//     } else {
//       return res.json({
//         status: "error",
//         msg: "Delete error",
//         data: {},
//       });
//     }
//   } catch (error: any) {
//     logger.error(colors.red("msg:", error.message));
//     next(new AppError("Internal server error", 500));
//   }
// }


// import { NextFunction, Request, Response } from "express";
// import mongoose from "mongoose";
// import AppError from "../utils/appError";
// import BlogModel, {
//   BlogInput,
//   BlogVideo,
//   BlogFAQ,
// } from "../models/blog.model";
// import { UpdateBlogInput } from "../schema/blog.schema";

// import {
//   createBlog,
//   findBlog,
//   findAndUpdateBlog,
//   deleteBlog,
//   deleteManyBlog,
// } from "../service/blog.service";

// import {
//   uploadOnCloudinary,
//   deleteImage,
//   getPublicId,
// } from "../utils/cloudinary";

// import logger from "../utils/logger";

// import {
//   getCache,
//   setCache,
//   clearCacheByPrefix,
// } from "../utils/redis";

// const CACHE_TTL = 60 * 60;

// interface BlogUploadedFiles {
//   banner?: Express.Multer.File[];
//   galleryFiles?: Express.Multer.File[];
//   videoFiles?: Express.Multer.File[];
// }

// interface UploadedMedia {
//   url: string;
//   resourceType: "image" | "video";
// }

// // ------------------------------------------------------
// // HELPERS
// // ------------------------------------------------------

// function generateSlug(value: string): string {
//   return value
//     .toLowerCase()
//     .trim()
//     .replace(/[^a-z0-9]+/g, "-")
//     .replace(/^-|-$/g, "");
// }

// function parseArrayField<T>(
//   value: unknown,
//   fieldName: string
// ): T[] | undefined {
//   if (
//     value === undefined ||
//     value === null ||
//     value === ""
//   ) {
//     return undefined;
//   }

//   try {
//     const parsed =
//       typeof value === "string"
//         ? JSON.parse(value)
//         : value;

//     if (!Array.isArray(parsed)) {
//       throw new Error("Expected an array");
//     }

//     return parsed as T[];
//   } catch {
//     throw new AppError(
//       `Invalid ${fieldName} format`,
//       400
//     );
//   }
// }

// function parseBoolean(
//   value: unknown,
//   fallback = true,
//   fieldName = "isActive"
// ): boolean {
//   if (
//     value === undefined ||
//     value === null ||
//     value === ""
//   ) {
//     return fallback;
//   }

//   if (typeof value === "boolean") {
//     return value;
//   }

//   if (value === "true" || value === "1") {
//     return true;
//   }

//   if (value === "false" || value === "0") {
//     return false;
//   }

//   throw new AppError(
//     `Invalid ${fieldName} value`,
//     400
//   );
// }

// function parseNumber(
//   value: unknown,
//   fallback: number,
//   fieldName: string
// ): number {
//   if (
//     value === undefined ||
//     value === null ||
//     value === ""
//   ) {
//     return fallback;
//   }

//   const parsed = Number(value);

//   if (!Number.isFinite(parsed)) {
//     throw new AppError(
//       `${fieldName} must be a valid number`,
//       400
//     );
//   }

//   return parsed;
// }

// function getBlogFiles(req: Request): BlogUploadedFiles {
//   return (req.files || {}) as BlogUploadedFiles;
// }

// function getVideoTitle(filename: string): string {
//   return filename.replace(/\.[^/.]+$/, "").trim();
// }

// function getVideoTitles(req: Request): string[] {
//   return (
//     parseArrayField<string>(
//       req.body.videoTitles,
//       "videoTitles"
//     ) || []
//   );
// }

// // ------------------------------------------------------
// // CLOUDINARY UPLOAD
// // ------------------------------------------------------

// async function uploadBlogFile(
//   file: Express.Multer.File,
//   resourceType: "image" | "video",
//   uploadedMedia?: UploadedMedia[]
// ): Promise<string> {
//   if (!file.buffer || file.buffer.length === 0) {
//     throw new AppError(
//       `Empty file: ${file.originalname}`,
//       400
//     );
//   }

//   if (
//     resourceType === "image" &&
//     !file.mimetype.startsWith("image/")
//   ) {
//     throw new AppError(
//       `${file.originalname} must be an image`,
//       400
//     );
//   }

//   if (
//     resourceType === "video" &&
//     !file.mimetype.startsWith("video/")
//   ) {
//     throw new AppError(
//       `${file.originalname} must be a video`,
//       400
//     );
//   }

//   const result = await uploadOnCloudinary(file.buffer, {
//     filename: file.originalname,
//     contentType: file.mimetype,
//     folder:
//       resourceType === "video"
//         ? "blogs/videos"
//         : "blogs/images",
//     resourceType,
//   });

//   if (!result?.secure_url) {
//     throw new AppError(
//       `Failed to upload ${file.originalname}`,
//       500
//     );
//   }

//   // Track immediately after a successful upload.
//   // This allows cleanup if a later upload or DB operation fails.
//   uploadedMedia?.push({
//     url: result.secure_url,
//     resourceType,
//   });

//   return result.secure_url;
// }

// async function uploadBlogImages(
//   files: Express.Multer.File[] = [],
//   uploadedMedia?: UploadedMedia[]
// ): Promise<string[]> {
//   const urls: string[] = [];

//   // Sequential uploads prevent unfinished uploads
//   // from continuing after a Promise.all rejection.
//   for (const file of files) {
//     const url = await uploadBlogFile(
//       file,
//       "image",
//       uploadedMedia
//     );

//     urls.push(url);
//   }

//   return urls;
// }

// async function uploadBlogVideos(
//   files: Express.Multer.File[] = [],
//   titles: string[] = [],
//   uploadedMedia?: UploadedMedia[]
// ): Promise<BlogVideo[]> {
//   const videos: BlogVideo[] = [];

//   for (let index = 0; index < files.length; index++) {
//     const file = files[index];

//     const url = await uploadBlogFile(
//       file,
//       "video",
//       uploadedMedia
//     );

//     const customTitle = titles[index];

//     videos.push({
//       title:
//         typeof customTitle === "string" &&
//         customTitle.trim()
//           ? customTitle.trim()
//           : getVideoTitle(file.originalname),
//       url,
//       type: "upload",
//     });
//   }

//   return videos;
// }

// // ------------------------------------------------------
// // VALIDATION
// // ------------------------------------------------------

// function validateRelatedPackages(
//   packageIds: string[] = []
// ): mongoose.Types.ObjectId[] {
//   if (!Array.isArray(packageIds)) {
//     throw new AppError(
//       "Related packages must be an array",
//       400
//     );
//   }

//   const invalidIds = packageIds.filter(
//     (id) =>
//       typeof id !== "string" ||
//       !mongoose.Types.ObjectId.isValid(id)
//   );

//   if (invalidIds.length > 0) {
//     throw new AppError(
//       "One or more related package IDs are invalid",
//       400
//     );
//   }

//   return packageIds.map(
//     (id) => new mongoose.Types.ObjectId(id)
//   );
// }

// function validateVideos(
//   videos: BlogVideo[] = []
// ): BlogVideo[] {
//   if (!Array.isArray(videos)) {
//     throw new AppError(
//       "Videos must be an array",
//       400
//     );
//   }

//   for (const video of videos) {
//     if (
//       !video ||
//       typeof video.url !== "string" ||
//       !video.url.trim()
//     ) {
//       throw new AppError(
//         "Every video must contain a valid URL",
//         400
//       );
//     }

//     if (
//       !["upload", "youtube", "external"].includes(
//         video.type
//       )
//     ) {
//       throw new AppError(
//         "Invalid video type",
//         400
//       );
//     }

//     if (
//       video.title !== undefined &&
//       typeof video.title !== "string"
//     ) {
//       throw new AppError(
//         "Video title must be a string",
//         400
//       );
//     }
//   }

//   return videos.map((video) => ({
//     title: video.title?.trim() || "",
//     url: video.url.trim(),
//     type: video.type,
//   }));
// }

// function validateFAQs(
//   faqs: BlogFAQ[] = []
// ): BlogFAQ[] {
//   if (!Array.isArray(faqs)) {
//     throw new AppError(
//       "FAQs must be an array",
//       400
//     );
//   }

//   for (const faq of faqs) {
//     if (
//       !faq ||
//       typeof faq.question !== "string" ||
//       typeof faq.answer !== "string" ||
//       !faq.question.trim() ||
//       !faq.answer.trim()
//     ) {
//       throw new AppError(
//         "Every FAQ must contain a question and answer",
//         400
//       );
//     }
//   }

//   return faqs.map((faq) => ({
//     question: faq.question.trim(),
//     answer: faq.answer.trim(),
//   }));
// }

// // ------------------------------------------------------
// // CLOUDINARY CLEANUP
// // ------------------------------------------------------

// async function deleteCloudinaryAsset(
//   url: string,
//   resourceType: "image" | "video"
// ): Promise<void> {
//   if (!url || !url.includes("cloudinary.com")) {
//     return;
//   }

//   const publicId = getPublicId(url);

//   if (!publicId) {
//     logger.warn(
//       `Could not extract Cloudinary public ID: ${url}`
//     );
//     return;
//   }

//   try {
//     await deleteImage(publicId, { resourceType });
//   } catch (error) {
//     logger.error(
//       `Failed to delete Cloudinary asset ${publicId}:`,
//       error
//     );
//   }
// }

// // Delete only newly uploaded assets when a DB operation fails.
// async function cleanupUploadedMedia(
//   uploadedMedia: UploadedMedia[]
// ): Promise<void> {
//   if (!uploadedMedia.length) {
//     return;
//   }

//   await Promise.allSettled(
//     uploadedMedia.map(({ url, resourceType }) =>
//       deleteCloudinaryAsset(url, resourceType)
//     )
//   );
// }

// // Delete media removed from an existing blog.
// // This runs only after the database update succeeds.
// async function cleanupRemovedBlogMedia(
//   oldBlog: any,
//   newMedia: {
//     banner: string;
//     gallery: string[];
//     videos: BlogVideo[];
//   }
// ): Promise<void> {
//   const retainedImages = new Set<string>([
//     newMedia.banner,
//     ...newMedia.gallery,
//   ]);

//   const retainedVideos = new Set(
//     newMedia.videos
//       .filter((video) => video.type === "upload")
//       .map((video) => video.url)
//   );

//   const oldImages = new Set<string>([
//     oldBlog.banner || "",
//     ...(oldBlog.gallery || []),
//   ]);

//   const deletionTasks: Promise<void>[] = [];

//   for (const url of oldImages) {
//     if (url && !retainedImages.has(url)) {
//       deletionTasks.push(
//         deleteCloudinaryAsset(url, "image")
//       );
//     }
//   }

//   for (const video of oldBlog.videos || []) {
//     if (
//       video.type === "upload" &&
//       video.url &&
//       !retainedVideos.has(video.url)
//     ) {
//       deletionTasks.push(
//         deleteCloudinaryAsset(video.url, "video")
//       );
//     }
//   }

//   await Promise.allSettled(deletionTasks);
// }

// async function deleteAllBlogMedia(blog: any): Promise<void> {
//   const deletionTasks: Promise<void>[] = [];

//   const imageUrls = new Set<string>([
//     ...(blog.banner ? [blog.banner] : []),
//     ...(blog.gallery || []),
//   ]);

//   for (const imageUrl of imageUrls) {
//     deletionTasks.push(
//       deleteCloudinaryAsset(imageUrl, "image")
//     );
//   }

//   const videoUrls = new Set<string>(
//     (blog.videos || [])
//       .filter(
//         (video: BlogVideo) =>
//           video.type === "upload" && video.url
//       )
//       .map((video: BlogVideo) => video.url)
//   );

//   for (const videoUrl of videoUrls) {
//     deletionTasks.push(
//       deleteCloudinaryAsset(videoUrl, "video")
//     );
//   }

//   await Promise.allSettled(deletionTasks);
// }

// // ------------------------------------------------------
// // REDIS CACHE
// // ------------------------------------------------------

// async function clearBlogCaches(): Promise<void> {
//   await Promise.all([
//     clearCacheByPrefix("blog:"),
//     clearCacheByPrefix("blogs:"),
//   ]);
// }

// // ------------------------------------------------------
// // CREATE BLOG
// // ------------------------------------------------------

// export async function createBlogHandler(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   const uploadedMedia: UploadedMedia[] = [];
//   let blogCreated = false;

//   try {
//     const {
//       title,
//       description,
//       slug,
//       sortOrder,
//       estimatedReadTime,
//       author,
//       isActive,
//     } = req.body;

//     if (
//       typeof title !== "string" ||
//       !title.trim()
//     ) {
//       throw new AppError(
//         "Blog title is required",
//         400
//       );
//     }

//     const files = getBlogFiles(req);

//     // Banner
//     const bannerUrl = files.banner?.[0]
//       ? await uploadBlogFile(
//           files.banner[0],
//           "image",
//           uploadedMedia
//         )
//       : "";

//     // Gallery
//     const existingGallery =
//       parseArrayField<string>(
//         req.body.gallery,
//         "gallery"
//       ) || [];

//     const uploadedGallery = await uploadBlogImages(
//       files.galleryFiles || [],
//       uploadedMedia
//     );

//     const gallery = [
//       ...existingGallery,
//       ...uploadedGallery,
//     ];

//     // Videos
//     const existingVideos =
//       parseArrayField<BlogVideo>(
//         req.body.videos,
//         "videos"
//       ) || [];

//     const uploadedVideos = await uploadBlogVideos(
//       files.videoFiles || [],
//       getVideoTitles(req),
//       uploadedMedia
//     );

//     const videos = validateVideos([
//       ...existingVideos,
//       ...uploadedVideos,
//     ]);

//     // FAQs
//     const faqs = validateFAQs(
//       parseArrayField<BlogFAQ>(
//         req.body.faqs,
//         "faqs"
//       ) || []
//     );

//     // Related packages
//     const relatedPackages = validateRelatedPackages(
//       parseArrayField<string>(
//         req.body.relatedPackages,
//         "relatedPackages"
//       ) || []
//     );

//     // Sort order
//     let calculatedSortOrder = parseNumber(
//       sortOrder,
//       0,
//       "sortOrder"
//     );

//     if (calculatedSortOrder === 0) {
//       const lastBlog = await BlogModel.findOne({})
//         .sort({ sortOrder: -1 })
//         .select("sortOrder")
//         .lean();

//       calculatedSortOrder = lastBlog
//         ? (lastBlog.sortOrder || 0) + 1
//         : 1;
//     }

//     const blogData: BlogInput = {
//       title: title.trim(),
//       slug: slug?.trim()
//         ? generateSlug(slug)
//         : generateSlug(title),
//       description: description || "",
//       banner: bannerUrl,
//       gallery,
//       videos,
//       faqs,
//       relatedPackages,
//       sortOrder: calculatedSortOrder,
//       estimatedReadTime: parseNumber(
//         estimatedReadTime,
//         5,
//         "estimatedReadTime"
//       ),
//       author: author?.trim() || "Admin",
//       isActive: parseBoolean(isActive, true),
//     };

//     const blog = await createBlog(blogData);

//     blogCreated = true;

//     await clearBlogCaches();

//     return res.status(201).json({
//       status: "success",
//       data: blog,
//     });
//   } catch (error: any) {
//     // Remove uploaded assets if blog creation failed.
//     if (!blogCreated) {
//       await cleanupUploadedMedia(uploadedMedia);
//     }

//     if (error?.code === 11000) {
//       return res.status(409).json({
//         status: "fail",
//         message:
//           "Blog with that title or slug already exists",
//       });
//     }

//     return next(error);
//   }
// }

// // ------------------------------------------------------
// // UPDATE BLOG
// // ------------------------------------------------------

// export async function updateBlogHandler(
//   req: Request<UpdateBlogInput["params"]>,
//   res: Response,
//   next: NextFunction
// ) {
//   const uploadedMedia: UploadedMedia[] = [];
//   let updateSucceeded = false;

//   try {
//     const blogId = req.params.blogId;

//     if (!mongoose.Types.ObjectId.isValid(blogId)) {
//       throw new AppError("Invalid blog ID", 400);
//     }

//     const {
//       title,
//       description,
//       slug,
//       sortOrder,
//       estimatedReadTime,
//       author,
//       isActive,
//     } = req.body;

//     const blog = await findBlog({
//       _id: blogId,
//     });

//     if (!blog) {
//       throw new AppError("Blog not found", 404);
//     }

//     const files = getBlogFiles(req);

//     // Banner
//     const shouldRemoveBanner = parseBoolean(
//       req.body.removeBanner,
//       false,
//       "removeBanner"
//     );

//     const bannerUrl = files.banner?.[0]
//       ? await uploadBlogFile(
//           files.banner[0],
//           "image",
//           uploadedMedia
//         )
//       : shouldRemoveBanner
//         ? ""
//         : blog.banner || "";

//     // Gallery
//     const galleryFromBody =
//       parseArrayField<string>(
//         req.body.gallery,
//         "gallery"
//       );

//     const uploadedGallery = await uploadBlogImages(
//       files.galleryFiles || [],
//       uploadedMedia
//     );

//     const gallery =
//       galleryFromBody !== undefined
//         ? [
//             ...galleryFromBody,
//             ...uploadedGallery,
//           ]
//         : [
//             ...(blog.gallery || []),
//             ...uploadedGallery,
//           ];

//     // Videos
//     const videosFromBody =
//       parseArrayField<BlogVideo>(
//         req.body.videos,
//         "videos"
//       );

//     const uploadedVideos = await uploadBlogVideos(
//       files.videoFiles || [],
//       getVideoTitles(req),
//       uploadedMedia
//     );

//     const previousVideos: BlogVideo[] =
//       (blog.videos || []).map((video: any) => ({
//         title: video.title || "",
//         url: video.url,
//         type: video.type,
//       }));

//     const videos = validateVideos([
//       ...(videosFromBody !== undefined
//         ? videosFromBody
//         : previousVideos),
//       ...uploadedVideos,
//     ]);

//     // FAQs
//     const faqsFromBody =
//       parseArrayField<BlogFAQ>(
//         req.body.faqs,
//         "faqs"
//       );

//     const faqs = validateFAQs(
//       faqsFromBody !== undefined
//         ? faqsFromBody
//         : (blog.faqs || []).map((faq: any) => ({
//             question: faq.question,
//             answer: faq.answer,
//           }))
//     );

//     // Related packages
//     const packagesFromBody =
//       parseArrayField<string>(
//         req.body.relatedPackages,
//         "relatedPackages"
//       );

//     const relatedPackages =
//       packagesFromBody !== undefined
//         ? validateRelatedPackages(packagesFromBody)
//         : (blog.relatedPackages || []).map(
//             (id: any) =>
//               new mongoose.Types.ObjectId(
//                 id.toString()
//               )
//           );

//     // Title and slug
//     const updatedTitle =
//       typeof title === "string" && title.trim()
//         ? title.trim()
//         : blog.title;

//     const updatedSlug =
//       typeof slug === "string" && slug.trim()
//         ? generateSlug(slug)
//         : typeof title === "string" && title.trim()
//           ? generateSlug(updatedTitle)
//           : blog.slug;

//     const updateData: Partial<BlogInput> = {
//       title: updatedTitle,
//       slug: updatedSlug,
//       description:
//         description !== undefined
//           ? description
//           : blog.description,
//       banner: bannerUrl,
//       gallery,
//       videos,
//       faqs,
//       relatedPackages,
//       sortOrder: parseNumber(
//         sortOrder,
//         blog.sortOrder || 0,
//         "sortOrder"
//       ),
//       estimatedReadTime: parseNumber(
//         estimatedReadTime,
//         blog.estimatedReadTime || 5,
//         "estimatedReadTime"
//       ),
//       author:
//         author !== undefined
//           ? author
//           : blog.author,
//       isActive: parseBoolean(
//         isActive,
//         blog.isActive
//       ),
//     };

//     const updatedBlog = await findAndUpdateBlog(
//       { _id: blogId },
//       updateData,
//       {
//         new: true,
//         runValidators: true,
//       }
//     );

//     if (!updatedBlog) {
//       throw new AppError(
//         "Failed to update blog",
//         500
//       );
//     }

//     updateSucceeded = true;

//     // Delete old media only after database update succeeds.
//     await cleanupRemovedBlogMedia(blog, {
//       banner: bannerUrl,
//       gallery,
//       videos,
//     });

//     await clearBlogCaches();

//     return res.status(200).json({
//       status: "success",
//       data: updatedBlog,
//     });
//   } catch (error: any) {
//     // If update failed, remove only the newly uploaded files.
//     // Existing blog media remains untouched.
//     if (!updateSucceeded) {
//       await cleanupUploadedMedia(uploadedMedia);
//     }

//     if (error?.code === 11000) {
//       return res.status(409).json({
//         status: "fail",
//         message:
//           "Blog with that title or slug already exists",
//       });
//     }

//     return next(error);
//   }
// }

// // ------------------------------------------------------
// // GET SINGLE BLOG
// // ------------------------------------------------------

// export async function getBlogHandler(
//   req: Request<UpdateBlogInput["params"]>,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const blogId = req.params.blogId;
//     const cacheKey = `blog:${blogId}`;

//     const cached = await getCache(cacheKey);

//     if (cached) {
//       return res.json({
//         status: "success",
//         msg: "Get success (from cache)",
//         data: cached,
//         cached: true,
//       });
//     }

//     const isObjectId =
//       mongoose.Types.ObjectId.isValid(blogId) &&
//       /^[0-9a-fA-F]{24}$/.test(blogId);

//     const query = isObjectId
//       ? BlogModel.findById(blogId)
//       : BlogModel.findOne({ slug: blogId });

//     const blog = await query.populate(
//       "relatedPackages"
//     );

//     if (!blog) {
//       throw new AppError(
//         "No blog found with that ID or slug",
//         404
//       );
//     }

//     await setCache(
//       `blog:${blog._id}`,
//       blog,
//       CACHE_TTL
//     );

//     await setCache(
//       cacheKey,
//       blog,
//       CACHE_TTL
//     );

//     return res.json({
//       status: "success",
//       msg: "Get success",
//       data: blog,
//     });
//   } catch (error: any) {
//     if (error instanceof AppError) {
//       return next(error);
//     }

//     logger.error("Get blog error:", error);

//     return next(
//       new AppError("Internal server error", 500)
//     );
//   }
// }

// // ------------------------------------------------------
// // DELETE BLOG
// // ------------------------------------------------------

// export async function deleteBlogHandler(
//   req: Request<UpdateBlogInput["params"]>,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const blogId = req.params.blogId;

//     if (!mongoose.Types.ObjectId.isValid(blogId)) {
//       throw new AppError("Invalid blog ID", 400);
//     }

//     const blog = await findBlog({
//       _id: blogId,
//     });

//     if (!blog) {
//       throw new AppError(
//         "Blog does not exist",
//         404
//       );
//     }

//     await deleteBlog({
//       _id: blogId,
//     });

//     await deleteAllBlogMedia(blog);

//     await clearBlogCaches();

//     return res.status(204).send();
//   } catch (error: any) {
//     if (error instanceof AppError) {
//       return next(error);
//     }

//     logger.error("Delete blog error:", error);

//     return next(
//       new AppError("Internal server error", 500)
//     );
//   }
// }

// // ------------------------------------------------------
// // GET ALL BLOGS
// // ------------------------------------------------------

// export async function getAllBlogHandler(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const page = Math.max(
//       parseInt(req.query.page as string) || 1,
//       1
//     );

//     const limit = Math.max(
//       parseInt(req.query.limit as string) || 100,
//       1
//     );

//     const skip = (page - 1) * limit;

//     const cacheKey =
//       `blogs:all:page_${page}_limit_${limit}_` +
//       JSON.stringify(req.query);

//     const cachedData = await getCache(cacheKey);

//     if (cachedData) {
//       return res.json({
//         status: "success",
//         ...cachedData,
//         fromCache: true,
//       });
//     }

//     const filter: any = {
//       ...req.query,
//     };

//     delete filter.page;
//     delete filter.limit;

//     if (filter.isActive !== undefined) {
//       filter.isActive = parseBoolean(
//         filter.isActive,
//         true
//       );
//     }

//     const [total, results] = await Promise.all([
//       BlogModel.countDocuments(filter),

//       BlogModel.find(filter)
//         .populate("relatedPackages")
//         .sort({
//           sortOrder: -1,
//           createdAt: -1,
//         })
//         .skip(skip)
//         .limit(limit)
//         .lean(),
//     ]);

//     const totalPages = Math.ceil(total / limit);

//     const responseData = {
//       data: results,
//       pagination: {
//         total,
//         totalPages,
//         currentPage: page,
//         itemsPerPage: limit,
//         hasNextPage: page < totalPages,
//         hasPreviousPage: page > 1,
//         nextPage:
//           page < totalPages ? page + 1 : null,
//         previousPage:
//           page > 1 ? page - 1 : null,
//       },
//     };

//     await setCache(
//       cacheKey,
//       responseData,
//       CACHE_TTL
//     );

//     return res.json({
//       status: "success",
//       msg: "Get all success",
//       ...responseData,
//       fromCache: false,
//     });
//   } catch (error: any) {
//     logger.error("Get all blogs error:", error);

//     return next(
//       new AppError("Internal server error", 500)
//     );
//   }
// }

// // ------------------------------------------------------
// // GET BLOG CARDS
// // ------------------------------------------------------

// export async function getAllBlogHandlerForCard(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const page = Math.max(
//       parseInt(req.query.page as string) || 1,
//       1
//     );

//     const limit = Math.max(
//       parseInt(req.query.limit as string) || 10,
//       1
//     );

//     const skip = (page - 1) * limit;

//     const cacheKey =
//       `blogs:card:page_${page}_limit_${limit}`;

//     const cachedData = await getCache(cacheKey);

//     if (cachedData) {
//       return res.json({
//         status: "success",
//         ...cachedData,
//         fromCache: true,
//       });
//     }

//     const [total, results] = await Promise.all([
//       BlogModel.countDocuments({}),

//       BlogModel.find(
//         {},
//         "title slug banner createdAt"
//       )
//         .sort({
//           sortOrder: -1,
//           createdAt: -1,
//         })
//         .skip(skip)
//         .limit(limit)
//         .lean(),
//     ]);

//     const totalPages = Math.ceil(total / limit);

//     const responseData = {
//       data: results,
//       pagination: {
//         total,
//         totalPages,
//         currentPage: page,
//         itemsPerPage: limit,
//         hasNextPage: page < totalPages,
//         hasPreviousPage: page > 1,
//         nextPage:
//           page < totalPages ? page + 1 : null,
//         previousPage:
//           page > 1 ? page - 1 : null,
//       },
//     };

//     await setCache(
//       cacheKey,
//       responseData,
//       CACHE_TTL
//     );

//     return res.json({
//       status: "success",
//       msg: "Get all success",
//       ...responseData,
//       fromCache: false,
//     });
//   } catch (error: any) {
//     logger.error("Get blog cards error:", error);

//     return next(
//       new AppError("Internal server error", 500)
//     );
//   }
// }

// // ------------------------------------------------------
// // DELETE MULTIPLE BLOGS
// // ------------------------------------------------------

// export async function deleteManyBlogHandler(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const ids = req.body.id;

//     if (!Array.isArray(ids) || ids.length === 0) {
//       throw new AppError(
//         "Please provide an array of blog IDs",
//         400
//       );
//     }

//     const invalidIds = ids.filter(
//       (id: string) =>
//         typeof id !== "string" ||
//         !mongoose.Types.ObjectId.isValid(id)
//     );

//     if (invalidIds.length > 0) {
//       throw new AppError(
//         "One or more blog IDs are invalid",
//         400
//       );
//     }

//     const blogs = await BlogModel.find({
//       _id: { $in: ids },
//     });

//     await deleteManyBlog({
//       _id: { $in: ids },
//     });

//     await Promise.all(
//       blogs.map((blog) => deleteAllBlogMedia(blog))
//     );

//     await clearBlogCaches();

//     return res.json({
//       status: "success",
//       msg: "Delete success",
//       data: {},
//     });
//   } catch (error: any) {
//     if (error instanceof AppError) {
//       return next(error);
//     }

//     logger.error("Delete multiple blogs error:", error);

//     return next(
//       new AppError("Internal server error", 500)
//     );
//   }
// }



import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import AppError from "../utils/appError";
import BlogModel, {
  BlogInput,
  BlogVideo,
  BlogFAQ,
} from "../models/blog.model";
import { UpdateBlogInput } from "../schema/blog.schema";

import {
  createBlog,
  findBlog,
  findAndUpdateBlog,
  deleteBlog,
  deleteManyBlog,
} from "../service/blog.service";

import {
  uploadOnCloudinary,
  deleteImage,
  getPublicId,
} from "../utils/cloudinary";

import logger from "../utils/logger";

import {
  getCache,
  setCache,
  clearCacheByPrefix,
} from "../utils/redis";

const CACHE_TTL = 60 * 60;

const RELATED_PACKAGE_FIELDS =
  "name slug coverImage location duration overview";

const RELATED_ARTICLE_FIELDS =
  "title slug banner description isActive";

interface BlogUploadedFiles {
  banner?: Express.Multer.File[];
  galleryFiles?: Express.Multer.File[];
  videoFiles?: Express.Multer.File[];
}

interface UploadedMedia {
  url: string;
  resourceType: "image" | "video";
}

interface BlogMedia {
  banner: string;
  gallery: string[];
  videos: BlogVideo[];
}

// ------------------------------------------------------
// HELPERS
// ------------------------------------------------------

function generateSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidObjectId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-fA-F0-9]{24}$/.test(value)
  );
}

function parseArrayField<T>(
  value: unknown,
  fieldName: string
): T[] | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  try {
    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : value;

    if (!Array.isArray(parsed)) {
      throw new Error("Expected an array");
    }

    return parsed as T[];
  } catch {
    throw new AppError(
      `Invalid ${fieldName} format`,
      400
    );
  }
}

function parseBoolean(
  value: unknown,
  fallback = true,
  fieldName = "isActive"
): boolean {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new AppError(
    `Invalid ${fieldName} value`,
    400
  );
}

function parseNumber(
  value: unknown,
  fallback: number,
  fieldName: string
): number {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError(
      `${fieldName} must be a valid number`,
      400
    );
  }

  return parsed;
}

function getBlogFiles(req: Request): BlogUploadedFiles {
  return (req.files || {}) as BlogUploadedFiles;
}

function getVideoTitle(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "").trim();
}

function getVideoTitles(req: Request): string[] {
  return (
    parseArrayField<string>(
      req.body.videoTitles,
      "videoTitles"
    ) || []
  );
}

// ------------------------------------------------------
// CACHE HELPERS
// ------------------------------------------------------

async function getBlogCache(
  key: string
): Promise<any | null> {
  try {
    return await getCache(key);
  } catch (error) {
    logger.warn(`Blog cache read failed (${key}):`, error);
    return null;
  }
}

async function setBlogCache(
  key: string,
  data: unknown
): Promise<void> {
  try {
    await setCache(key, data, CACHE_TTL);
  } catch (error) {
    logger.warn(`Blog cache write failed (${key}):`, error);
  }
}

async function clearBlogCaches(): Promise<void> {
  try {
    await Promise.all([
      clearCacheByPrefix("blog:"),
      clearCacheByPrefix("blogs:"),
    ]);
  } catch (error) {
    logger.error("Blog cache invalidation failed:", error);
  }
}

// ------------------------------------------------------
// CLOUDINARY UPLOAD
// ------------------------------------------------------

async function uploadBlogFile(
  file: Express.Multer.File,
  resourceType: "image" | "video",
  uploadedMedia?: UploadedMedia[]
): Promise<string> {
  if (!file.buffer || file.buffer.length === 0) {
    throw new AppError(
      `Empty file: ${file.originalname}`,
      400
    );
  }

  if (
    resourceType === "image" &&
    !file.mimetype.startsWith("image/")
  ) {
    throw new AppError(
      `${file.originalname} must be an image`,
      400
    );
  }

  if (
    resourceType === "video" &&
    !file.mimetype.startsWith("video/")
  ) {
    throw new AppError(
      `${file.originalname} must be a video`,
      400
    );
  }

  const result = await uploadOnCloudinary(file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype,
    folder:
      resourceType === "video"
        ? "blogs/videos"
        : "blogs/images",
    resourceType,
  });

  if (!result?.secure_url) {
    throw new AppError(
      `Failed to upload ${file.originalname}`,
      500
    );
  }

  uploadedMedia?.push({
    url: result.secure_url,
    resourceType,
  });

  return result.secure_url;
}

async function uploadBlogImages(
  files: Express.Multer.File[] = [],
  uploadedMedia?: UploadedMedia[]
): Promise<string[]> {
  const urls: string[] = [];

  for (const file of files) {
    urls.push(
      await uploadBlogFile(
        file,
        "image",
        uploadedMedia
      )
    );
  }

  return urls;
}

async function uploadBlogVideos(
  files: Express.Multer.File[] = [],
  titles: string[] = [],
  uploadedMedia?: UploadedMedia[]
): Promise<BlogVideo[]> {
  const videos: BlogVideo[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];

    const url = await uploadBlogFile(
      file,
      "video",
      uploadedMedia
    );

    const customTitle = titles[index];

    videos.push({
      title:
        typeof customTitle === "string" &&
        customTitle.trim()
          ? customTitle.trim()
          : getVideoTitle(file.originalname),
      url,
      type: "upload",
    });
  }

  return videos;
}

// ------------------------------------------------------
// VALIDATION
// ------------------------------------------------------

function validateRelatedPackages(
  packageIds: string[] = []
): mongoose.Types.ObjectId[] {
  if (!Array.isArray(packageIds)) {
    throw new AppError(
      "Related packages must be an array",
      400
    );
  }

  if (!packageIds.every(isValidObjectId)) {
    throw new AppError(
      "One or more related package IDs are invalid",
      400
    );
  }

  return packageIds.map(
    (id) => new mongoose.Types.ObjectId(id)
  );
}

// NEW: VALIDATE RELATED ARTICLES

async function validateRelatedArticles(
  articleIds: string[] = [],
  currentBlogId?: string
): Promise<mongoose.Types.ObjectId[]> {
  if (!Array.isArray(articleIds)) {
    throw new AppError(
      "Related articles must be an array",
      400
    );
  }

  if (!articleIds.every(isValidObjectId)) {
    throw new AppError(
      "One or more related article IDs are invalid",
      400
    );
  }

  const uniqueIds = [...new Set(articleIds)];

  if (
    currentBlogId &&
    uniqueIds.includes(currentBlogId)
  ) {
    throw new AppError(
      "A blog cannot be related to itself",
      400
    );
  }

  if (uniqueIds.length === 0) {
    return [];
  }

  const existingArticles = await BlogModel.find({
    _id: { $in: uniqueIds },
  })
    .select("_id")
    .lean();

  if (existingArticles.length !== uniqueIds.length) {
    throw new AppError(
      "One or more related articles do not exist",
      400
    );
  }

  return uniqueIds.map(
    (id) => new mongoose.Types.ObjectId(id)
  );
}

function validateVideos(
  videos: BlogVideo[] = []
): BlogVideo[] {
  if (!Array.isArray(videos)) {
    throw new AppError("Videos must be an array", 400);
  }

  for (const video of videos) {
    if (
      !video ||
      typeof video.url !== "string" ||
      !video.url.trim()
    ) {
      throw new AppError(
        "Every video must contain a valid URL",
        400
      );
    }

    if (
      !["upload", "youtube", "external"].includes(
        video.type
      )
    ) {
      throw new AppError("Invalid video type", 400);
    }

    if (
      video.title !== undefined &&
      typeof video.title !== "string"
    ) {
      throw new AppError(
        "Video title must be a string",
        400
      );
    }
  }

  return videos.map((video) => ({
    title: video.title?.trim() || "",
    url: video.url.trim(),
    type: video.type,
  }));
}

function validateFAQs(
  faqs: BlogFAQ[] = []
): BlogFAQ[] {
  if (!Array.isArray(faqs)) {
    throw new AppError("FAQs must be an array", 400);
  }

  for (const faq of faqs) {
    if (
      !faq ||
      typeof faq.question !== "string" ||
      typeof faq.answer !== "string" ||
      !faq.question.trim() ||
      !faq.answer.trim()
    ) {
      throw new AppError(
        "Every FAQ must contain a question and answer",
        400
      );
    }
  }

  return faqs.map((faq) => ({
    question: faq.question.trim(),
    answer: faq.answer.trim(),
  }));
}

function normalizeBlogMedia(blog: any): BlogMedia {
  return {
    banner: blog.banner || "",
    gallery: blog.gallery || [],
    videos: (blog.videos || []).map((video: any) => ({
      title: video.title || "",
      url: video.url,
      type: video.type,
    })),
  };
}

// ------------------------------------------------------
// CLOUDINARY CLEANUP
// ------------------------------------------------------

async function deleteCloudinaryAsset(
  url: string,
  resourceType: "image" | "video"
): Promise<void> {
  if (!url || !url.includes("cloudinary.com")) {
    return;
  }

  const publicId = getPublicId(url);

  if (!publicId) {
    logger.warn(
      `Could not extract Cloudinary public ID: ${url}`
    );
    return;
  }

  try {
    await deleteImage(publicId, { resourceType });
  } catch (error) {
    logger.error(
      `Failed to delete Cloudinary asset ${publicId}:`,
      error
    );
  }
}

async function cleanupUploadedMedia(
  uploadedMedia: UploadedMedia[]
): Promise<void> {
  if (!uploadedMedia.length) return;

  await Promise.allSettled(
    uploadedMedia.map(({ url, resourceType }) =>
      deleteCloudinaryAsset(url, resourceType)
    )
  );
}

async function cleanupRemovedBlogMedia(
  oldBlog: any,
  newMedia: BlogMedia
): Promise<void> {
  const retainedImages = new Set<string>([
    newMedia.banner,
    ...newMedia.gallery,
  ]);

  const retainedVideos = new Set(
    newMedia.videos
      .filter((video) => video.type === "upload")
      .map((video) => video.url)
  );

  const oldImages = new Set<string>([
    oldBlog.banner || "",
    ...(oldBlog.gallery || []),
  ]);

  const deletionTasks: Promise<void>[] = [];

  for (const url of oldImages) {
    if (url && !retainedImages.has(url)) {
      deletionTasks.push(
        deleteCloudinaryAsset(url, "image")
      );
    }
  }

  for (const video of oldBlog.videos || []) {
    if (
      video.type === "upload" &&
      video.url &&
      !retainedVideos.has(video.url)
    ) {
      deletionTasks.push(
        deleteCloudinaryAsset(video.url, "video")
      );
    }
  }

  await Promise.allSettled(deletionTasks);
}

async function deleteAllBlogMedia(blog: any): Promise<void> {
  const deletionTasks: Promise<void>[] = [];

  const imageUrls = new Set<string>([
    ...(blog.banner ? [blog.banner] : []),
    ...(blog.gallery || []),
  ]);

  for (const url of imageUrls) {
    deletionTasks.push(
      deleteCloudinaryAsset(url, "image")
    );
  }

  const videoUrls = new Set<string>(
    (blog.videos || [])
      .filter(
        (video: BlogVideo) =>
          video.type === "upload" && video.url
      )
      .map((video: BlogVideo) => video.url)
  );

  for (const url of videoUrls) {
    deletionTasks.push(
      deleteCloudinaryAsset(url, "video")
    );
  }

  await Promise.allSettled(deletionTasks);
}

// ------------------------------------------------------
// CREATE BLOG
// ------------------------------------------------------

export async function createBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const uploadedMedia: UploadedMedia[] = [];
  let blogCreated = false;

  try {
    const {
      title,
      description,
      slug,
      sortOrder,
      estimatedReadTime,
      author,
      isActive,
    } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim()
    ) {
      throw new AppError("Blog title is required", 400);
    }

    const files = getBlogFiles(req);

    const bannerUrl = files.banner?.[0]
      ? await uploadBlogFile(
          files.banner[0],
          "image",
          uploadedMedia
        )
      : "";

    const existingGallery =
      parseArrayField<string>(
        req.body.gallery,
        "gallery"
      ) || [];

    const uploadedGallery = await uploadBlogImages(
      files.galleryFiles || [],
      uploadedMedia
    );

    const gallery = [
      ...existingGallery,
      ...uploadedGallery,
    ];

    const existingVideos =
      parseArrayField<BlogVideo>(
        req.body.videos,
        "videos"
      ) || [];

    const uploadedVideos = await uploadBlogVideos(
      files.videoFiles || [],
      getVideoTitles(req),
      uploadedMedia
    );

    const videos = validateVideos([
      ...existingVideos,
      ...uploadedVideos,
    ]);

    const faqs = validateFAQs(
      parseArrayField<BlogFAQ>(
        req.body.faqs,
        "faqs"
      ) || []
    );

    const relatedPackages = validateRelatedPackages(
      parseArrayField<string>(
        req.body.relatedPackages,
        "relatedPackages"
      ) || []
    );

    // NEW: RELATED ARTICLES
    const relatedArticles = await validateRelatedArticles(
      parseArrayField<string>(
        req.body.relatedArticles,
        "relatedArticles"
      ) || []
    );

    let calculatedSortOrder = parseNumber(
      sortOrder,
      0,
      "sortOrder"
    );

    if (calculatedSortOrder === 0) {
      const lastBlog = await BlogModel.findOne({})
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean();

      calculatedSortOrder = lastBlog
        ? (lastBlog.sortOrder || 0) + 1
        : 1;
    }

    const generatedSlug = generateSlug(
      typeof slug === "string" && slug.trim()
        ? slug
        : title
    );

    if (!generatedSlug) {
      throw new AppError(
        "A valid blog slug could not be generated",
        400
      );
    }

    const blogData: BlogInput = {
      title: title.trim(),
      slug: generatedSlug,
      description: description || "",
      banner: bannerUrl,
      gallery,
      videos,
      faqs,
      relatedPackages,
      relatedArticles,
      sortOrder: calculatedSortOrder,
      estimatedReadTime: parseNumber(
        estimatedReadTime,
        5,
        "estimatedReadTime"
      ),
      author: author?.trim() || "Admin",
      isActive: parseBoolean(isActive, true),
    };

    const blog = await createBlog(blogData);

    blogCreated = true;

    await clearBlogCaches();

    return res.status(201).json({
      status: "success",
      msg: "Blog created successfully",
      data: blog,
      cached: false,
    });
  } catch (error: any) {
    if (!blogCreated) {
      await cleanupUploadedMedia(uploadedMedia);
    }

    if (error?.code === 11000) {
      return res.status(409).json({
        status: "error",
        msg: "Blog with that slug already exists",
      });
    }

    return next(error);
  }
}

// ------------------------------------------------------
// UPDATE BLOG
// ------------------------------------------------------

export async function updateBlogHandler(
  req: Request<UpdateBlogInput["params"]>,
  res: Response,
  next: NextFunction
) {
  const uploadedMedia: UploadedMedia[] = [];
  let updateSucceeded = false;

  try {
    const blogId = req.params.blogId;

    if (!isValidObjectId(blogId)) {
      throw new AppError("Invalid blog ID", 400);
    }

    const {
      title,
      description,
      slug,
      sortOrder,
      estimatedReadTime,
      author,
      isActive,
    } = req.body;

    const blog = await findBlog({ _id: blogId });

    if (!blog) {
      throw new AppError("Blog not found", 404);
    }

    const files = getBlogFiles(req);

    const shouldRemoveBanner = parseBoolean(
      req.body.removeBanner,
      false,
      "removeBanner"
    );

    const bannerUrl = files.banner?.[0]
      ? await uploadBlogFile(
          files.banner[0],
          "image",
          uploadedMedia
        )
      : shouldRemoveBanner
        ? ""
        : blog.banner || "";

    const galleryFromBody =
      parseArrayField<string>(
        req.body.gallery,
        "gallery"
      );

    const uploadedGallery = await uploadBlogImages(
      files.galleryFiles || [],
      uploadedMedia
    );

    const gallery =
      galleryFromBody !== undefined
        ? [...galleryFromBody, ...uploadedGallery]
        : [...(blog.gallery || []), ...uploadedGallery];

    const videosFromBody =
      parseArrayField<BlogVideo>(
        req.body.videos,
        "videos"
      );

    const uploadedVideos = await uploadBlogVideos(
      files.videoFiles || [],
      getVideoTitles(req),
      uploadedMedia
    );

    const previousVideos = normalizeBlogMedia(blog).videos;

    const videos = validateVideos([
      ...(videosFromBody !== undefined
        ? videosFromBody
        : previousVideos),
      ...uploadedVideos,
    ]);

    const faqsFromBody =
      parseArrayField<BlogFAQ>(
        req.body.faqs,
        "faqs"
      );

    const faqs = validateFAQs(
      faqsFromBody !== undefined
        ? faqsFromBody
        : (blog.faqs || []).map((faq: any) => ({
            question: faq.question,
            answer: faq.answer,
          }))
    );

    const packagesFromBody =
      parseArrayField<string>(
        req.body.relatedPackages,
        "relatedPackages"
      );

    const relatedPackages =
      packagesFromBody !== undefined
        ? validateRelatedPackages(packagesFromBody)
        : (blog.relatedPackages || []).map(
            (id: any) =>
              new mongoose.Types.ObjectId(id.toString())
          );

    // NEW: RELATED ARTICLES
    const articlesFromBody =
      parseArrayField<string>(
        req.body.relatedArticles,
        "relatedArticles"
      );

    const relatedArticles =
      articlesFromBody !== undefined
        ? await validateRelatedArticles(
            articlesFromBody,
            blogId
          )
        : (blog.relatedArticles || []).map(
            (id: any) =>
              new mongoose.Types.ObjectId(
                id._id?.toString() || id.toString()
              )
          );

    const updatedTitle =
      typeof title === "string" && title.trim()
        ? title.trim()
        : blog.title;

    const updatedSlug =
      typeof slug === "string" && slug.trim()
        ? generateSlug(slug)
        : typeof title === "string" && title.trim()
          ? generateSlug(updatedTitle)
          : blog.slug;

    if (!updatedSlug) {
      throw new AppError("Invalid blog slug", 400);
    }

    const updateData: Partial<BlogInput> = {
      title: updatedTitle,
      slug: updatedSlug,
      description:
        description !== undefined
          ? description
          : blog.description,
      banner: bannerUrl,
      gallery,
      videos,
      faqs,
      relatedPackages,
      relatedArticles,
      sortOrder: parseNumber(
        sortOrder,
        blog.sortOrder || 0,
        "sortOrder"
      ),
      estimatedReadTime: parseNumber(
        estimatedReadTime,
        blog.estimatedReadTime || 5,
        "estimatedReadTime"
      ),
      author:
        author !== undefined
          ? author
          : blog.author,
      isActive: parseBoolean(
        isActive,
        blog.isActive
      ),
    };

    const updatedBlog = await findAndUpdateBlog(
      { _id: blogId },
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedBlog) {
      throw new AppError(
        "Failed to update blog",
        500
      );
    }

    updateSucceeded = true;

    await cleanupRemovedBlogMedia(blog, {
      banner: bannerUrl,
      gallery,
      videos,
    });

    await clearBlogCaches();

    return res.status(200).json({
      status: "success",
      msg: "Blog updated successfully",
      data: updatedBlog,
      cached: false,
    });
  } catch (error: any) {
    if (!updateSucceeded) {
      await cleanupUploadedMedia(uploadedMedia);
    }

    if (error?.code === 11000) {
      return res.status(409).json({
        status: "error",
        msg: "Blog with that slug already exists",
      });
    }

    return next(error);
  }
}

// ------------------------------------------------------
// GET SINGLE BLOG
// ------------------------------------------------------

export async function getBlogHandler(
  req: Request<UpdateBlogInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const blogId = req.params.blogId;
    const cacheKey = `blog:${blogId}`;

    const cached = await getBlogCache(cacheKey);

    if (cached) {
      return res.json({
        status: "success",
        msg: "Get success",
        data: cached,
        cached: true,
      });
    }

    const query = isValidObjectId(blogId)
      ? BlogModel.findById(blogId)
      : BlogModel.findOne({ slug: blogId });

    const blog = await query
      .populate({
        path: "relatedPackages",
        select: RELATED_PACKAGE_FIELDS,
      })
      .populate({
        path: "relatedArticles",
        select: RELATED_ARTICLE_FIELDS,
        match: { isActive: true },
      });

    if (!blog) {
      throw new AppError(
        "No blog found with that ID or slug",
        404
      );
    }

    const blogData = blog.toObject();

    await Promise.all([
      setBlogCache(`blog:${blog._id}`, blogData),
      setBlogCache(`blog:${blog.slug}`, blogData),
    ]);

    return res.json({
      status: "success",
      msg: "Get success",
      data: blogData,
      cached: false,
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error("Get blog error:", error);

    return next(
      new AppError("Internal server error", 500)
    );
  }
}

// ------------------------------------------------------
// DELETE BLOG
// ------------------------------------------------------

export async function deleteBlogHandler(
  req: Request<UpdateBlogInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const blogId = req.params.blogId;

    if (!isValidObjectId(blogId)) {
      throw new AppError("Invalid blog ID", 400);
    }

    const blog = await findBlog({ _id: blogId });

    if (!blog) {
      throw new AppError(
        "Blog does not exist",
        404
      );
    }

    await deleteBlog({ _id: blogId });

    await deleteAllBlogMedia(blog);

    await clearBlogCaches();

    return res.status(204).send();
  } catch (error: any) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error("Delete blog error:", error);

    return next(
      new AppError("Internal server error", 500)
    );
  }
}

// ------------------------------------------------------
// GET ALL BLOGS
// ------------------------------------------------------

export async function getAllBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = Math.max(
      parseInt(req.query.page as string) || 1,
      1
    );

    const limit = Math.max(
      parseInt(req.query.limit as string) || 100,
      1
    );

    const skip = (page - 1) * limit;

    const cacheKey =
      `blogs:all:page_${page}_limit_${limit}_` +
      JSON.stringify(req.query);

    const cachedData = await getBlogCache(cacheKey);

    if (cachedData) {
      return res.json({
        status: "success",
        msg: "Get all success",
        ...cachedData,
        cached: true,
      });
    }

    const filter: Record<string, any> = {
      ...req.query,
    };

    delete filter.page;
    delete filter.limit;

    if (filter.isActive !== undefined) {
      filter.isActive = parseBoolean(
        filter.isActive,
        true
      );
    }

    const [total, results] = await Promise.all([
      BlogModel.countDocuments(filter),

      BlogModel.find(filter)
        .populate({
          path: "relatedPackages",
          select: RELATED_PACKAGE_FIELDS,
        })
        .populate({
          path: "relatedArticles",
          select: RELATED_ARTICLE_FIELDS,
          match: { isActive: true },
        })
        .sort({
          sortOrder: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const pages = Math.ceil(total / limit);

    const responseData = {
      data: results,
      pagination: {
        total,
        page,
        pages,
        hasNextPage: page < pages,
        hasPreviousPage: page > 1,
      },
    };

    await setBlogCache(cacheKey, responseData);

    return res.json({
      status: "success",
      msg: "Get all success",
      ...responseData,
      cached: false,
    });
  } catch (error: any) {
    logger.error("Get all blogs error:", error);

    return next(
      new AppError("Internal server error", 500)
    );
  }
}

// ------------------------------------------------------
// GET BLOG CARDS
// ------------------------------------------------------

export async function getAllBlogHandlerForCard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = Math.max(
      parseInt(req.query.page as string) || 1,
      1
    );

    const limit = Math.max(
      parseInt(req.query.limit as string) || 10,
      1
    );

    const skip = (page - 1) * limit;

    const cacheKey =
      `blogs:card:page_${page}_limit_${limit}`;

    const cachedData = await getBlogCache(cacheKey);

    if (cachedData) {
      return res.json({
        status: "success",
        msg: "Get all success",
        ...cachedData,
        cached: true,
      });
    }

    const filter = { isActive: true };

    const [total, results] = await Promise.all([
      BlogModel.countDocuments(filter),

      BlogModel.find(
        filter,
        "title slug banner createdAt"
      )
        .sort({
          sortOrder: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const pages = Math.ceil(total / limit);

    const responseData = {
      data: results,
      pagination: {
        total,
        page,
        pages,
        hasNextPage: page < pages,
        hasPreviousPage: page > 1,
      },
    };

    await setBlogCache(cacheKey, responseData);

    return res.json({
      status: "success",
      msg: "Get all success",
      ...responseData,
      cached: false,
    });
  } catch (error: any) {
    logger.error("Get blog cards error:", error);

    return next(
      new AppError("Internal server error", 500)
    );
  }
}

// ------------------------------------------------------
// DELETE MULTIPLE BLOGS
// ------------------------------------------------------

export async function deleteManyBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const ids = req.body.id;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError(
        "Please provide an array of blog IDs",
        400
      );
    }

    if (!ids.every(isValidObjectId)) {
      throw new AppError(
        "One or more blog IDs are invalid",
        400
      );
    }

    const blogs = await BlogModel.find({
      _id: { $in: ids },
    });

    await deleteManyBlog({
      _id: { $in: ids },
    });

    await Promise.all(
      blogs.map((blog) => deleteAllBlogMedia(blog))
    );

    await clearBlogCaches();

    return res.json({
      status: "success",
      msg: "Delete success",
      data: {},
      cached: false,
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error("Delete multiple blogs error:", error);

    return next(
      new AppError("Internal server error", 500)
    );
  }
}
