import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors, { CorsOptions } from "cors";
import helmet from "helmet";
import http from "http";
import { Server } from "./shims/socketIoServer";

import morgan from "morgan";
import {
  ALLOWED_ORIGINS,
  IS_DEV,
  IS_PROD,
  ADMIN_BOOTSTRAP_EMAIL,
  ADMIN_BOOTSTRAP_PASSWORD,
  PORT,
} from "./configs/env";
import logger from "./utils/logger";
import connectDB from "./utils/connectDB";
import UserModel from "./models/user.model";
import rateLimiter from "./middleware/rateLimiter";
import { sanitizeHtmlMiddleware } from "./middleware/sanitizeHtml.middleware";
import { revalidateSitesMiddleware } from "./middleware/revalidateSites.middleware";
import { SocketController } from "./socket/socket";
import { connectRedis, clearCacheByPrefix } from "./utils/redis";
import { FixedDateExpiryCron } from "./cron/fixedDateCron";
import { ensureContactIndexes } from "./utils/ensureContactIndexes";
import { EmailWorker } from "./service/email.worker";

import userRouter from "./routes/user.route";
import inquiryRoute from "./routes/inquiry.route";
import inquiryReplyRoute from "./routes/inquiryReply.routes";
import blogRoute from "./routes/blog.route";
import teamMemberRoute from "./routes/team-member.routes";
import packageRoute from "./routes/package.routes";
import subCategoryRoute from "./routes/subCategory.route";
import categoryRoute from "./routes/category.route";
import testimonialRoute from "./routes/testimonial.routes";
import bookingRoute from "./routes/booking.routes";
import deleteImageRoute from "./routes/deleteImage.routes";
import pageRoute from "./routes/page.routes";
import certificateRoute from "./routes/certificate.routes";
import usefulInfoRoute from "./routes/usefulInfo.routes";
import itineraryRoute from "./routes/itinerary.route";
import shortItineraryRoute from "./routes/shortItinerary.route";
import attractionRoute from "./routes/attraction.route";
import inclusionRoute from "./routes/inclusion.route";
import exclusionRoute from "./routes/exclusion.route";
import fixedDateRoute from "./routes/fixedDate.route";
import paxRoute from "./routes/pax.route";
import requirementRoute from "./routes/requirement.route";
import trackVisitRouter from "./routes/trackVisit.route";
import contactRouter from "./routes/contact.routes";
import contactReplyRoute from "./routes/contactReply.routes";
import faqRoute from "./routes/faq.route";
import statsRoute from "./routes/stats.route";
import popularRoute from "./routes/popular.routes";
import tripHighlightRoute from "./routes/trip-highlight.routes";
import visitPlaceRoute from "./routes/visit-place.routes";
import bookingReplyRoutes from "./routes/bookingReply.routes";
import imageRoute from "./routes/image.route";
import NotifiRoute from "./routes/seenNotification";
import galleryRoute from "./routes/gallery.route";
import { externalTravelerRecordsRoutes, travelerRecordsRoutes } from "./modules/traveler-records";
import { guidesRoutes } from "./modules/guides";
import packageInfoRoute from "./routes/packageInfo.route";
import searchRoute from "./routes/search.routes";
import customBookingRoute from "./routes/customBooking.route";
import customBookingReplyRoutes from "./routes/customBookingReply.routes";
import detailedItineraryRoute from "./routes/detailedItinerary.route";
import homeGalleryRoute from "./routes/homeGallery.route";
import homeFaqRoute from "./routes/homefaq";
import homeTestimonialRoute from "./routes/home-testimonial.routes";
import video from "./routes/video.routes";
import gearRoutes from "./routes/gears.routes";
import importantNotice from "./routes/importantNotice.route";
import insurance from "./routes/insurance.route";
import WhyLoveThisTrek from "./routes/whyLoveThisTrek.route";
import { addonsRoutes } from "./modules/addons";
import { packageAddonsRoutes } from "./modules/package-addons";
import basedSeason from "./routes/seasonInfo.routes";
import captchaRoute from "./routes/captcha.route";
import privateTripRoute from "./routes/privateTrip.route";
import { paymentRoutes as paymentRoute, startPaymentReconcileCron } from "./modules/payment";
import pricingSettingsRoute from "./routes/pricingSettings.routes";
import {
  notificationsRoutes,
  notificationContextMiddleware,
  NotificationWorker,
  seedNotificationConfig,
  emitNotification,
  MESSAGE_TYPES,
} from "./modules/notifications";
import { sendTestInvoiceForPaidBookings } from "./utils/sendTestBookingInvoice";

const app = express();
const server = http.createServer(app);

// Security headers — apply first so every response is covered
app.use(
  helmet({
    // Clickjacking protection
    frameguard: { action: "deny" },
    // Block MIME sniffing
    noSniff: true,
    // Remove X-Powered-By
    hidePoweredBy: true,
    // Do not leak referrer URLs
    referrerPolicy: { policy: "no-referrer" },
    // Restrict Adobe Flash / PDF cross-domain policy
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    // Isolate browsing context (popup-safe)
    crossOriginOpenerPolicy: { policy: "same-origin" },
    // Allow credentialed cross-origin API/static responses (CORS + frontend)
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // COEP breaks Socket.IO, Cloudinary, and typical SPA cross-origin loads
    crossOriginEmbedderPolicy: false,
    // HSTS only in production (avoid locking browsers onto HTTPS for localhost)
    hsts: IS_PROD
      ? {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        }
      : false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "https:", "'unsafe-inline'"],
        upgradeInsecureRequests: IS_PROD ? [] : null,
      },
    },
  })
);

// Capture raw text body for payment gateway webhooks (application/jose)
// This must be registered before express.json() so the raw string is preserved.
app.use(
  "/api/v1/payment/webhook",
  express.text({ type: ["application/jose", "text/plain", "*/*"], limit: "1mb" })
);

app.use(express.json({ limit: "20mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.static("public"));

if (IS_DEV) {
  app.use(
    morgan("dev", {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    })
  );
}

app.use(sanitizeHtmlMiddleware);
app.use(notificationContextMiddleware);

// Get allowed origins from environment variable
logger.info("Allowed Origins:", ALLOWED_ORIGINS);

// Add localhost origins for development
const developmentOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5000",
];

const allAllowedOrigins = [...ALLOWED_ORIGINS, ...developmentOrigins];

// CORS configuration
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Check if the origin is in the allowed list
    if (allAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // For production, log blocked origins
    if (IS_PROD) {
      logger.warn(`CORS blocked for origin: ${origin}`);
    }

    // Deny without throwing — avoids 500 / SYSTEM_ERROR notifications from scanners
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "X-Requested-With",
    "Origin",
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Origin",
  ],
  exposedHeaders: ["Content-Length", "Content-Type"],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 204,
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options("*", cors(corsOptions));

// Custom middleware to ensure CORS headers are set
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;

  if (origin && allAllowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, X-Requested-With, Origin, Access-Control-Allow-Headers, Access-Control-Allow-Origin"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS"
    );
    res.header("Access-Control-Expose-Headers", "Content-Length, Content-Type");
  }

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.use(rateLimiter);
app.use(revalidateSitesMiddleware);
FixedDateExpiryCron.start();
EmailWorker.start();
NotificationWorker.start();

// Socket.IO configuration with simpler CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (IS_PROD) {
        logger.warn(`Socket.IO CORS blocked for origin: ${origin}`);
      }

      callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  },
});

const socketController = new SocketController(io);

// Your routes
app.use(
  insurance,
  importantNotice,
  basedSeason,
  WhyLoveThisTrek,
  homeFaqRoute,
  homeGalleryRoute,
  homeTestimonialRoute,
  searchRoute,
  packageInfoRoute,
  imageRoute,
  galleryRoute,
  travelerRecordsRoutes,
  externalTravelerRecordsRoutes,
  guidesRoutes,
  popularRoute,
  statsRoute,
  trackVisitRouter,
  userRouter,
  categoryRoute,
  subCategoryRoute,
  packageRoute,
  detailedItineraryRoute,
  inquiryRoute,
  inquiryReplyRoute,
  blogRoute,
  teamMemberRoute,
  testimonialRoute,
  bookingRoute,
  customBookingRoute,
  deleteImageRoute,
  pageRoute,
  certificateRoute,
  usefulInfoRoute,
  itineraryRoute,
  shortItineraryRoute,
  attractionRoute,
  inclusionRoute,
  exclusionRoute,
  fixedDateRoute,
  paxRoute,
  requirementRoute,
  contactRouter,
  contactReplyRoute,
  faqRoute,
  tripHighlightRoute,
  visitPlaceRoute,
  bookingReplyRoutes,
  NotifiRoute,
  customBookingReplyRoutes,
  gearRoutes,
  captchaRoute,
  video,
  packageAddonsRoutes,
  addonsRoutes,
  privateTripRoute,
  paymentRoute,
  notificationsRoutes,
  pricingSettingsRoute
);

app.get("/api/active-users", (req: Request, res: Response) => {
  try {
    res.json({
      status: "success",
      data: {
        activeUsers: socketController.getActiveUsers(),
        statistics: socketController.getStatistics(),
      },
    });
  } catch (error) {
    logger.error("Failed to fetch active users:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch active users data",
    });
  }
});

const healthResponse = {
  status: "success",
  message: "Welcome to Fly East Server.",
};

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json(healthResponse);
});

app.get("/healthChecker", (_req: Request, res: Response) => {
  res.status(200).json(healthResponse);
});

// Browsers/dev tools probe this to detect Chrome remote-debug endpoints
app.get("/json/version", (_req: Request, res: Response) => {
  res.status(404).end();
});

app.delete("/api/v1/cache/clear", async (_req: Request, res: Response) => {
  try {
    await clearCacheByPrefix("");
    return res.status(200).json({
      status: "success",
      message: "Cache cleared",
    });
  } catch (error: any) {
    logger.error("Cache clear failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to clear cache",
    });
  }
});

app.all("*", (req: Request, res: Response, next: NextFunction) => {
  const err = new Error(`Route ${req.originalUrl} not found`) as any;
  err.statusCode = 404;
  next(err);
});

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || 500;

  if (statusCode === 404) {
    logger.warn(`404 ${req.method} ${req.originalUrl}`);
  } else {
    logger.error(err);
  }

  if (statusCode >= 500) {
    emitNotification(MESSAGE_TYPES.SYSTEM_ERROR, {
      source: "http",
      statusCode,
      method: req.method,
      path: req.originalUrl,
      message: err.message || "Internal Server Error",
      stack: err.stack,
      userId: (req as any).user?._id?.toString?.(),
    });
  }

  res.status(statusCode).json({
    status: err.status || "error",
    message: err.message || "Internal Server Error",
    ...(err.errors ? { errors: err.errors } : {}),
  });
});

async function createAdminIfNotPresent() {
  try {
    const email = ADMIN_BOOTSTRAP_EMAIL;
    const password = ADMIN_BOOTSTRAP_PASSWORD;

    if (!email || !password) {
      logger.warn(
        "Skipping bootstrap admin: set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD"
      );
      return;
    }

    const adminExist = await UserModel.findOne({
      role: "admin",
    });
    if (!adminExist) {
      await UserModel.create({
        email,
        password,
        role: "admin",
        isVerified: true,
        verifyToken: "",
      });
      logger.info("✅ Admin user created successfully.");
    }
  } catch (error: any) {
    logger.error(`Error creating admin user: ${error.message}`);
  }
}

connectRedis()
  .then((connected) => {
    if (connected) logger.info("Redis cache is enabled");
    else logger.warn("Running without Redis cache");
  })
  .catch((error) => {
    logger.warn(`Redis initialization warning: ${error.message}`);
  });

server.listen(PORT, async () => {
  logger.info(`🚀 Server running on port http://localhost:${PORT}`);

  try {
    await connectDB();
    await createAdminIfNotPresent();
    await ensureContactIndexes();
    startPaymentReconcileCron();
    await seedNotificationConfig();

    process.on("unhandledRejection", (reason) => {
      emitNotification(MESSAGE_TYPES.SYSTEM_ERROR, {
        source: "unhandledRejection",
        message: String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });

    process.on("uncaughtException", (error) => {
      emitNotification(MESSAGE_TYPES.SYSTEM_ERROR, {
        source: "uncaughtException",
        message: error.message,
        stack: error.stack,
      });
    });

    // await sendTestInvoiceForPaidBookings("lamap0000@gmail.com");
  } catch (error) {
    logger.error("❌ Failed to initialize app:", error);
    process.exit(1);
  }
});
