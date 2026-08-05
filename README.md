# FlyEast Backend Documentation

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Environment Configuration](#environment-configuration)
5. [Installation & Setup](#installation--setup)
6. [Core Features](#core-features)
7. [API Architecture](#api-architecture)
8. [Database Models](#database-models)
9. [Authentication & Authorization](#authentication--authorization)
10. [Email System](#email-system)
11. [File Upload & Media Management](#file-upload--media-management)
12. [Booking System](#booking-system)
13. [Deployment](#deployment)
14. [Comprehensive API Reference](#comprehensive-api-reference)
15. [Endpoint Details by Domain](#endpoint-details-by-domain)

---

## Overview

FlyEast is a comprehensive travel booking backend system built with Node.js, Express, and TypeScript. The application manages travel packages, bookings, inquiries, testimonials, and various travel-related content for a tourism company.

**Key Capabilities:**

- Travel package management with detailed itineraries
- Booking system with pricing calculations and discounts
- User authentication and role-based access control
- Email notification system with queue management
- Media management via Cloudinary
- Real-time updates via Socket.IO
- Payment processing with Stripe
- Admin dashboard with analytics

---

## Technology Stack

### Core Technologies

- **Runtime:** Node.js (v16+)
- **Language:** TypeScript 4.9.5
- **Framework:** Express.js 4.19.2
- **Database:** MongoDB (via Mongoose 6.0.11)
- **Cache/Queue:** Redis (ioredis 5.8.0) + BullMQ 5.58.7

### Key Dependencies

- **Authentication:** jsonwebtoken 9.0.2, bcrypt 6.0.0
- **Validation:** Zod 3.9.8
- **File Upload:** Multer 1.4.5, Cloudinary 2.0.1
- **Email:** Nodemailer 6.10.1
- **Payment:** Stripe 18.2.1
- **Real-time:** Socket.IO 4.8.1
- **Logging:** Pino 7.0.2
- **Scheduling:** node-schedule 2.1.1

---

## Project Structure

```
flyeast-backend/
├── src/
│   ├── app.ts                 # Application entry point
│   ├── config/                # Configuration files
│   │   ├── cloudinaryConfig.ts
│   │   ├── config.ts
│   │   └── redis.config.ts
│   ├── constant/              # Constants and interfaces
│   │   └── interface.constant.ts
│   ├── controller/            # Request handlers (40+ controllers)
│   │   ├── user.controller.ts
│   │   ├── booking.controller.ts
│   │   ├── package.controller.ts
│   │   └── ...
│   ├── cron/                  # Scheduled jobs
│   │   └── fixedDateExpiryCron.ts
│   ├── email/                 # Email queue system
│   │   ├── email.queue.ts
│   │   └── email.worker.ts
│   ├── middleware/            # Express middleware
│   │   ├── isAdmin.ts
│   │   ├── multer.middleware.ts
│   │   ├── rateLimiter.ts
│   │   └── validate.ts
│   ├── models/                # Mongoose schemas (30+ models)
│   │   ├── user.model.ts
│   │   ├── booking.model.ts
│   │   ├── package.model.ts
│   │   └── ...
│   ├── routes/                # API route definitions
│   ├── schema/                # Zod validation schemas
│   ├── service/               # Business logic layer
│   ├── socket/                # WebSocket handlers
│   ├── types/                 # TypeScript type definitions
│   └── utils/                 # Utility functions
├── dist/                      # Compiled JavaScript output
├── .env                       # Environment variables
├── package.json
└── tsconfig.json
```

---

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database
DB_CONNECTION=mongodb://localhost:27017/flyeast

# Server
PORT=3000
NODE_ENV=development

# Redis
REDIS_PREFIX=flyeast
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS
ALLOWED_ORIGINS=https://flyeast.webxnepal.com

# Cloudinary (Media Storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=flyeast

# Email (SMTP)
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@outlook.com
SMTP_PASSWORD=your_password
MAIL_USER=your_email@outlook.com
MAIL_PASS=your_password

# Payment
STRIPE_SECRET_KEY=sk_test_...

# Client
CLIENT_URL=https://flyeast.webxnepal.com
```

---

## Installation & Setup

### Prerequisites

- Node.js v16 or higher
- MongoDB instance
- Redis server
- pnpm (recommended) or npm

### Installation Steps

```bash
# Clone the repository
git clone <repository-url>
cd flyeast-backend

# Install dependencies
pnpm install
# or
npm install --legacy-peer-deps

# Configure environment
cp .env-example .env
# Edit .env with your configuration

# Development mode
pnpm dev
# or
npm run dev

# Build for production
pnpm build
# or
npm run build

# Start production server
pnpm start
# or
npm start
```

---

## Core Features

### 1. Package Management

- Create, update, delete travel packages
- Multiple categories and subcategories
- Fixed departure dates with seat availability
- Pricing tiers based on group size (Pax system)
- Detailed itineraries with day-by-day breakdown
- Inclusions, exclusions, and requirements
- Trip highlights and FAQs

### 2. Booking System

- Standard package bookings
- Custom trip requests
- Private trip inquiries
- Dynamic pricing with group discounts
- Add-on services
- Booking status management
- Admin reply system

### 3. Content Management

- Blog posts with rich content
- Testimonials with ratings
- Photo galleries
- Team member profiles
- Certificates and awards
- Useful travel information
- Attraction listings

### 4. User Management

- User registration and authentication
- Role-based permissions (Admin/User)
- Login activity tracking
- Dashboard analytics
- Permission system (create, edit, delete, view)

### 5. Communication

- Contact form submissions
- Package inquiries
- Email notifications
- Admin reply system
- Detailed itinerary requests

---

## API Architecture

### Request Flow

```
Client Request
    ↓
Rate Limiter Middleware
    ↓
Authentication Middleware (if required)
    ↓
Validation Middleware (Zod schemas)
    ↓
Controller (Request Handler)
    ↓
Service Layer (Business Logic)
    ↓
Model Layer (Database Operations)
    ↓
Response
```

### Error Handling

The application uses a centralized error handling system with `AppError` class:

```typescript
// utils/appError.ts
export default class AppError extends Error {
  status: string;
  isOperational: boolean;

  constructor(
    public message: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
  }
}
```

### Response Format

Standard API responses follow this structure:

```json
{
  "status": "success" | "error" | "fail",
  "msg": "Human-readable message",
  "data": { /* response data */ }
}
```

---

## Database Models

### Key Models

#### User Model

```typescript
{
  name: string;
  email: string;
  password: string;
  verifyToken?: string;
  isVerified: boolean;
  permissions: string[]; // ["create", "edit", "delete", "view"]
  createdAt: Date;
  updatedAt: Date;
}
```

#### Package Model

- Package details (name, slug, description)
- Category and subcategory references
- Pricing information
- Media (images, videos)
- SEO metadata

#### Booking Model

```typescript
{
  package: ObjectId;
  createdBy?: ObjectId;
  personalInfo: Traveler[];
  tripDetails: {
    parentType: string;
    arrivalDate: Date;
    departureDate: Date;
    message?: string;
  };
  status: string;
  createdAt: Date;
}
```

#### Fixed Date Model

- Package reference
- Departure date
- Price per person
- Seats available
- Number of persons
- Status (active/expired)

#### Pax Model (Group Pricing)

```typescript
{
  package: ObjectId;
  min: number; // Minimum group size
  max: number; // Maximum group size
  discount: number; // Discount amount
}
```

#### Detailed Itinerary Model

```typescript
{
  packageId: ObjectId;
  url: string;  // PDF URL
  requests: [{
    requestedBy: string;  // Email
    requestedAt: Date;
  }];
}
```

---

## Authentication & Authorization

### Authentication Flow

1. User registers with email and password
2. Password is hashed using bcrypt
3. Verification token generated
4. JWT token issued upon login
5. Token validated on protected routes

### Permission System

The application uses a granular permission system:

```typescript
// Middleware: isAdmin.ts
export const checkPermissions = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userPermissions = req.user?.permissions || [];
    const hasPermission = requiredPermissions.some((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasPermission) {
      return res.status(403).json({
        status: "error",
        msg: "Insufficient permissions",
      });
    }
    next();
  };
};
```

### Protected Route Example

```typescript
router.post(
  "/api/v1/package",
  isAdmin,
  checkPermissions(["create"]),
  validate(createPackageSchema),
  createPackageHandler,
);
```

---

## Email System

### Queue-Based Architecture

The application enqueues all HTML emails via BullMQ so the background worker (see below) can deliver them reliably.

```typescript
import { Queue } from "bullmq";
import { EmailJob } from "../types/emailJob.type";
import { buildQueueName, getBullmqQueueOptions } from "../queues/bull.config";

const queue = new Queue<EmailJob>(
  buildQueueName("email-queue"),
  getBullmqQueueOptions(),
);

export class EmailQueue {
  private static queue = queue;

  static async addEmail(
    to: string,
    subject: string,
    html: string,
    options?: Pick<EmailJob, "text" | "attachments">,
  ): Promise<void> {
    await this.queue.add("send-email", {
      to,
      subject,
      html,
      ...(options?.text ? { text: options.text } : {}),
      ...(options?.attachments ? { attachments: options.attachments } : {}),
    });
  }

  static async addBulkEmails(
    recipients: string[],
    subject: string,
    html: string,
    options?: Pick<EmailJob, "text" | "attachments">,
  ): Promise<void> {
    const jobs = recipients.map((to) => ({
      name: "send-email",
      data: {
        to,
        subject,
        html,
        ...(options?.text ? { text: options.text } : {}),
        ...(options?.attachments ? { attachments: options.attachments } : {}),
      },
    }));
    await this.queue.addBulk(jobs);
  }
}
```

### Email Worker

```typescript
const createTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE === "true" || !process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const worker = new Worker<EmailJob>(
  buildQueueName("email-queue"),
  async (job) => {
    await createTransport.sendMail({
      from: process.env.FROM,
      to: job.data.to,
      subject: job.data.subject,
      html: job.data.html,
      text: job.data.text,
      attachments: job.data.attachments,
    });
  },
  getBullmqQueueOptions(),
);
```

### Email Configuration

```typescript
// utils/sendMail.ts
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});
```

---

## File Upload & Media Management

### Multer Configuration

```typescript
// middleware/multer.middleware.ts
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept all files for flexibility
  cb(null, true);
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});
```

### Cloudinary Integration

- Images uploaded to Cloudinary
- Automatic optimization
- Folder organization
- Public ID tracking for deletion
- URL generation

### Usage Example

```typescript
router.post("/api/v1/testimonial", upload.single("image"), createTestimonial);
```

---

## Booking System

### Pricing Calculation

The system calculates total price with group discounts:

```typescript
// utils/calculateDiscount.ts
export async function calculateTotalWithDiscount(
  packageId: string,
  fixedDateId: string,
  adults: number,
  children: number,
  totalAddOnPrice: number,
): Promise<{
  basePricePerPerson: number;
  totalPeople: number;
  originalTotal: number;
  discountPercentage: number;
  discountAmount: number;
  finalTotal: number;
  noOfPerson: number;
}> {
  const totalPeople = Number(adults) + Number(children ?? 0);

  // Get base price from FixedDate
  const fixedDate = await FixedDate.findById(fixedDateId);

  // Check seat availability
  if (totalPeople > fixedDate.seatsAvailable) {
    throw new Error("Total people exceeds available seats");
  }

  // Get discount tier based on group size
  const paxTier = await Pax.findOne({
    package: packageId,
    min: { $lte: totalPeople },
    max: { $gte: totalPeople },
  });

  const basePrice = fixedDate.pricePerPerson;
  const discount = paxTier?.discount || 0;

  const originalTotal = basePrice * totalPeople;
  const discountAmount = discount;
  const finalTotal = originalTotal - discountAmount + totalAddOnPrice;

  return {
    basePricePerPerson: basePrice,
    totalPeople,
    originalTotal,
    discountPercentage: discount,
    discountAmount,
    finalTotal,
    noOfPerson: fixedDate.numberOfPerson,
  };
}
```

### Booking Flow

1. User selects package and fixed date
2. Provides traveler information
3. Selects add-ons (optional)
4. System calculates pricing with discounts
5. Booking created with "pending" status
6. Email notification sent
7. Admin can reply and update status

### Booking Reply System

```typescript
// controller/packageInquiry.controller.ts
async function replyToPackageInquiryHandler(req, res, next) {
  const { inquiryId } = req.params;
  const { replyMessage, status } = req.body;
  const adminEmail = req.user?.email || "admin@flyeast.com";

  const result = await replyToPackageInquiry(
    inquiryId,
    replyMessage,
    adminEmail,
  );

  // Update status if provided
  if (status) {
    await findAndUpdatePackageInquiry(
      { _id: inquiryId },
      { status },
      { new: true },
    );
  }

  return res.json({
    status: "success",
    msg: "Reply sent successfully",
    data: result,
  });
}
```

---

## Deployment

### GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy Fyeast backend

on:
  push:
    branches: [main, production]

jobs:
  deploy:
    runs-on: self-hosted

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.DEPLOY_KEY }}" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa
          ssh-keyscan -H ${{ secrets.VPS_HOST }} >> ~/.ssh/known_hosts

      - name: Deploy to VPS
        run: |
          ssh ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'EOF'
            cd /var/www/flyeast-backend
            git pull origin production
            npm install --legacy-peer-deps
            npm run build
            sudo pm2 restart flyeast-backend
          EOF
```

### PM2 Configuration

The application runs under PM2 process manager:

```bash
# Start application
pm2 start dist/app.js --name flyeast-backend

# Monitor
pm2 monit

# Logs
pm2 logs flyeast-backend

# Restart
pm2 restart flyeast-backend
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure production database
- [ ] Set up Redis instance
- [ ] Configure SMTP credentials
- [ ] Set Cloudinary production keys
- [ ] Configure Stripe production keys
- [ ] Set secure CORS origins
- [ ] Enable rate limiting
- [ ] Set up SSL/TLS
- [ ] Configure backup strategy
- [ ] Set up monitoring and logging

## Comprehensive API Reference

Base URL: `/api/v1/*` unless noted. Auth uses `Authorization: Bearer <token>` or the `accessToken` cookie. Admin-only routes add `isAdmin` + `checkPermissions(["create" | "edit" | "delete" | "all"])`.

**Success (list)** `{ status: "success", data: [...], pagination? }`  
**Success (single)** `{ status: "success", data: {...} }`  
**Validation** `{ status: "fail", errors? | missingFields? }`  
**Server** `{ status: "error", message | msg | error }`

Uploads are `multipart/form-data` via Multer. Images are sent to Cloudinary and saved as HTTPS URLs. Booleans accept truthy strings; arrays accept comma strings or repeated keys.

## Endpoint Details by Domain

### Authentication & User Management

| Method & Path                                           | Auth          | Required fields                                                                               | Success response (shape)                                              |
| ------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| POST `/api/v1/users/register`                           | Public        | `email`, `password` (>=8 with uppercase + number), optional `firstName`, `lastName`           | `{ status, msg: "Register success", data: user }`                     |
| POST `/api/v1/users/login`                              | Public        | `email`, `password`                                                                           | `{ status, msg, accessToken, user }` (also sets `accessToken` cookie) |
| GET `/api/v1/users/logout`                              | Auth          | —                                                                                             | `{ status: "success", msg }`                                          |
| GET `/api/v1/users/current`                             | Auth          | —                                                                                             | `{ status: "success", data: user }`                                   |
| POST `/api/v1/users/forgot-password`                    | Public        | `email`                                                                                       | `{ status: "success", msg: "Reset link sent to email" }`              |
| POST `/api/v1/users/reset-password`                     | Public (link) | Query: `token`, `email`; Body: `newPassword`                                                  | `{ status: "success", msg: "Password reset successful" }`             |
| POST `/api/v1/users/admin/forgot-password`              | Public        | `email`                                                                                       | `{ status: "success", msg: "If an account exists..." }` (generic)      |
| POST `/api/v1/users/admin/reset-password`               | Public (link) | Query: `token`, `email`; Body: `newPassword`                                                  | `{ status: "success", msg: "Password reset successful" }`             |
| POST `/api/v1/users/admin/emergency-reset-password`     | Public (key)  | `email`, `newPassword`, `emergencyKey`                                                        | `{ status: "success", msg: "Password reset successful" }`             |
| POST `/api/v1/users/admin/change-password`              | Auth          | `currentPassword`, `newPassword`, `confirmPassword`                                           | `{ status: "success", msg: "Password changed successfully" }`         |
| GET `/api/v1/users/admin/get-all-users`                 | Admin         | —                                                                                             | `{ status, data: users }`                                             |
| POST `/api/v1/users/admin/create-user`                  | Admin + `all` | `email`, `password`, optional names/permissions                                               | `{ status, data: user }`                                              |
| PATCH `/api/v1/users/admin/update-user/:id/permissions` | Admin + `all` | Body any of `firstName`, `lastName`, `email`, `currentPassword`, `newPassword`, `permissions` | `{ status, data: user }`                                              |
| DELETE `/api/v1/users/admin/delete-user/:id`            | Admin + `all` | —                                                                                             | `{ status: "success", msg }`                                          |

### Catalog & Discovery

| Method & Path                                    | Auth             | Required fields                                                                                                                                                                                                                                                                                                                                                                                         | Success response (shape)                                |
| ------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| GET `/api/v1/category`                           | Public           | Query: `page?`, `limit?`                                                                                                                                                                                                                                                                                                                                                                                | `{ status, data: categories, pagination }`              |
| GET `/api/v1/category/:idOrSlug`                 | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: category, pagination(subCategories) }` |
| POST `/api/v1/category`                          | Admin + `create` | `name`, `description`, optional `slug`, `addToHome`, `sortOrder`, `image` (file)                                                                                                                                                                                                                                                                                                                        | `{ status, data: category }`                            |
| PUT `/api/v1/category/:id`                       | Admin + `edit`   | Any updatable fields above                                                                                                                                                                                                                                                                                                                                                                              | `{ status, data: category }`                            |
| DELETE `/api/v1/category/:id`                    | Admin + `delete` | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, message }`                                   |
| GET `/api/v1/subcategory`                        | Public           | Query: `page?`, `limit?`, `category?`                                                                                                                                                                                                                                                                                                                                                                   | `{ status, data: subCategories, pagination }`           |
| GET `/api/v1/subcategory/:id`                    | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: subCategory }`                         |
| POST `/api/v1/subcategory`                       | Admin + `create` | `name`, `description`, `category` (ObjectId), optional `image`                                                                                                                                                                                                                                                                                                                                          | `{ status, data }`                                      |
| PUT `/api/v1/subcategory/:id`                    | Admin + `edit`   | Any of `name`, `description`, `category`, `image`                                                                                                                                                                                                                                                                                                                                                       | `{ status, data }`                                      |
| DELETE `/api/v1/subcategory/:id`                 | Admin + `delete` | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, message }`                                   |
| GET `/api/v1/package`                            | Public           | Query: `page?`, `limit?`, `search?`, `season?`, `category?`, `subCategory?`, `sort?`                                                                                                                                                                                                                                                                                                                    | `{ status, data: packages, pagination }`                |
| GET `/api/v1/package/:idOrSlug`                  | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: package }`                             |
| GET `/api/v1/package/category/:categoryId`       | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: packages }`                            |
| GET `/api/v1/package/subcategory/:subCategoryId` | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: packages }`                            |
| GET `/api/v1/packages/search`                    | Public           | Query: `query`, `location`, `activity`, `difficulty`, `groupSize`, `minDuration`, `maxDuration`, `minPrice`, `maxPrice`, `isPopular`, `page`, `limit`, `sortBy`, `sortOrder`                                                                                                                                                                                                                            | `{ status, data: packages, pagination }`                |
| POST `/api/v1/package`                           | Admin + `create` | Multipart: `name`, `subCategoryId`, `season[]`, `overview`, `location`, `duration`; optional `slug`, `sortOrder`, `elevation`, `distance`, `addToHome`, `isPopular`, `activity`, `groupSize`, `vehicle`, `difficulty`, `accommodation`, `meal`, `note`, `essentialInformation`, `startPoint`, `endPoint`, `transportation`, `mealsIncluded`, `region`; files `coverImage`, `routeMap`, optional gallery | `{ status, data: package }`                             |
| PUT `/api/v1/package/:id`                        | Admin + `edit`   | Same fields as create (all optional)                                                                                                                                                                                                                                                                                                                                                                    | `{ status, data: package }`                             |
| DELETE `/api/v1/package/:id`                     | Admin + `delete` | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, message }`                                   |
| GET `/category/:idOrSlug/top-sellers`            | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: packages }`                            |
| GET `/category/:idOrSlug/top-ten-treks`          | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: packages }`                            |
| PUT `/api/v1/make-best-seller/:packageId`        | Admin + `edit`   | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, message }`                                   |
| GET `/api/v1/get-best-seller`                    | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: packages }`                            |
| PUT `/api/v1/packages/:id/category`              | Admin + `edit`   | Body: `categoryId`, optional `subCategoryId`                                                                                                                                                                                                                                                                                                                                                            | `{ status, data: package }`                             |
| GET `/api/v1/popular/categories/:category`       | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: packages }`                            |
| GET `/api/v1/popular/add-to-home`                | Public           | —                                                                                                                                                                                                                                                                                                                                                                                                       | `{ status, data: packages }`                            |

### Availability & Pricing (Fixed Dates, Pax, Add-ons)

| Method & Path                               | Auth             | Required fields                                                                                                    | Success response (shape)                   |
| ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------- |
| POST `/api/v1/fixed-date/:packageId`        | Admin + `create` | Body: `startDate`, `endDate`, `status`, `numberOfPerson`, `pricePerPerson`, optional `availableSeats`, `sortOrder` | `{ status, message, data: fixedDate }`     |
| GET `/api/v1/fixed-date/package/:packageId` | Public           | Query: `page?`, `limit?`                                                                                           | `{ status, data: fixedDates, pagination }` |
| GET `/api/v1/fixed-date/:id`                | Public           | —                                                                                                                  | `{ status, data: fixedDate }`              |
| PUT `/api/v1/fixed-date/:id`                | Admin + `edit`   | Any fixed-date fields above                                                                                        | `{ status, message, data }`                |
| DELETE `/api/v1/fixed-date/:id`             | Admin + `delete` | —                                                                                                                  | `{ status, message }`                      |
| GET `/api/v1/lowest-price`                  | Public           | —                                                                                                                  | `{ status, data: fixedDate                 | null }` |
| POST `/api/v1/pax/:packageId`               | Admin + `create` | `min`, `max`, `discount`, optional `sortOrder`                                                                     | `{ status, data: pax }`                    |
| GET `/api/v1/pax/package/:packageId`        | Admin            | —                                                                                                                  | `{ status, data: pax[] }`                  |
| GET `/api/v1/pax/:id`                       | Admin            | —                                                                                                                  | `{ status, data: pax }`                    |
| PUT `/api/v1/pax/:id`                       | Admin + `edit`   | Any of `min`, `max`, `discount`, `sortOrder`                                                                       | `{ status, data }`                         |
| DELETE `/api/v1/pax/:id`                    | Admin + `delete` | —                                                                                                                  | `{ status, message }`                      |
| POST `/api/v1/addons/:packageId`            | Admin + `create` | Multipart: `name`, `description`, `price`, `image` file                                                            | `{ success: true, data: addon }`           |
| GET `/api/v1/addons/package/:packageId`     | Public           | —                                                                                                                  | `{ success: true, count, data }`           |
| GET `/api/v1/addons/:addonId`               | Public           | —                                                                                                                  | `{ success: true, data }`                  |
| PUT `/api/v1/addons/:addonId`               | Admin + `edit`   | Any of `name`, `description`, `price`, `packageId`, `sortOrder`, optional new `image`                              | `{ success: true, data }`                  |
| DELETE `/api/v1/addons/:addonId`            | Admin + `delete` | —                                                                                                                  | `{ success: true, message }`               |

### Bookings & Trip Requests

| Method & Path                                | Auth             | Required fields                                                                                                                                                                                                            | Success response (shape)                                             |
| -------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| POST `/api/v1/booking`                       | Public           | `personalInfo[]` (`fullName`, `email`, `country`, `phoneNumber`), `arrivalDate`, `departureDate`, `totalPeople`, `package`, `fixedDateId`, `totalAmount`; optional `message`, `addons[]`, `createdBy`, `customizedBooking` | `{ status, message, data: booking }` (validates seats and discounts) |
| GET `/api/v1/booking`                        | Admin            | Query: `page?`, `limit?`, `status?`, `search?`                                                                                                                                                                             | `{ status, data: bookings, pagination }`                             |
| GET `/api/v1/booking/:id`                    | Public           | —                                                                                                                                                                                                                          | `{ status, data: { booking } }`                                      |
| PATCH `/api/v1/booking/:id/status`           | Admin + `edit`   | Any of `status`, `paymentStatus`                                                                                                                                                                                           | `{ message, booking }`                                               |
| PATCH `/api/v1/booking/:id/cancel`           | Admin + `edit`   | Optional `reason`                                                                                                                                                                                                          | `{ status, data: { booking } }`                                      |
| DELETE `/api/v1/booking/:id`                 | Admin + `delete` | —                                                                                                                                                                                                                          | `{ message }`                                                        |
| POST `/api/v1/custom-booking`                | Public           | `personalInfo[]`, `arrivalDate`, `departureDate`, `totalPeople`, `package`, optional `startTripDate`, `message`, `createdBy`                                                                                                | `{ status, message, data: booking }`                                 |
| GET `/api/v1/custom-booking`                 | Admin            | Query: `page?`, `limit?`, `status?`, `search?`                                                                                                                                                                             | `{ status, data, pagination }`                                       |
| GET `/api/v1/custom-booking/:id`             | Public           | —                                                                                                                                                                                                                          | `{ status, data }`                                                   |
| PATCH `/api/v1/custom-booking/:id/status`    | Admin + `edit`   | Body: `status`, `paymentStatus?`                                                                                                                                                                                           | `{ status, data }`                                                   |
| PATCH `/api/v1/custom-booking/:id/cancel`    | Admin + `edit`   | Optional `reason`                                                                                                                                                                                                          | `{ status, data }`                                                   |
| DELETE `/api/v1/custom-booking/:id`          | Admin + `delete` | —                                                                                                                                                                                                                          | `{ status, message }`                                                |
| POST `/api/v1/private-trip`                  | Public           | `leadTravellerName`, `email`, `phone`, `numberOfTraveller`, `message`, `packageId`, `captchaToken`, `captchaAnswer`; optional `date`, `country`, `howDidYouReachUs`, `termsAndAgreement`                                   | `{ status, data: privateTrip }`                                      |
| PATCH `/api/v1/private-trip/:privateTripId`  | Admin            | Any private trip fields above                                                                                                                                                                                              | `{ status, data }`                                                   |
| GET `/api/v1/private-trip/:privateTripId`    | Public           | —                                                                                                                                                                                                                          | `{ status, data }`                                                   |
| GET `/api/v1/private-trip/`                  | Admin            | Query: `page?`, `limit?`, `sort?`, `search?`                                                                                                                                                                               | `{ status, data, pagination }`                                       |
| DELETE `/api/v1/private-trip/:privateTripId` | Admin            | —                                                                                                                                                                                                                          | `{ status, message }`                                                |
| POST `/api/v1/private-trip/delete-many`      | Admin            | Body: `ids[]`                                                                                                                                                                                                              | `{ status, message }`                                                |
| POST `/api/v1/reply`                         | Admin + `create` | `bookingId`, `message`, `subject`, optional `status`, `bookingStatus`                                                                                                                                                      | `{ message, data: reply }` (emails all travelers)                    |
| POST `/api/v1/custom-booking-reply`          | Admin + `create` | `bookingId`, `message`, `subject`, optional `status`                                                                                                                                                                       | `{ message, data: reply }`                                           |

### Content & Marketing Assets

| Method & Path                                     | Auth             | Required fields                                                             | Success response (shape)              |
| ------------------------------------------------- | ---------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| POST `/api/v1/blog`                               | Admin + `create` | `title`, `slug`, `banner`, `description`                                    | `{ status, data: blog }`              |
| POST `/api/v1/blog/upload`                        | Admin + `create` | Multipart image (field `file`)                                              | `{ status, data: { url } }`           |
| PATCH `/api/v1/blog/:blogId`                      | Admin + `edit`   | Any blog fields                                                             | `{ status, data }`                    |
| GET `/api/v1/blog/:blogId`                        | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/blog`                                | Public           | Query: `page?`, `limit?`                                                    | `{ status, data, pagination }`        |
| GET `/api/v1/blog/get-all-blogs/for-card`         | Public           | —                                                                           | `{ status, data }`                    |
| DELETE `/api/v1/blog/:blogId`                     | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/pages`                               | Public           | Query: `page?`, `limit?`                                                    | `{ status, data, pagination }`        |
| GET `/api/v1/pages/slug/:slug`                    | Public           | —                                                                           | `{ status, data: page }`              |
| GET `/api/v1/pages/:id`                           | Public           | —                                                                           | `{ status, data: page }`              |
| POST `/api/v1/pages`                              | Admin + `create` | `title`, `slug`, `content`, optional `meta*`, `sortOrder`                   | `{ status, data }`                    |
| PUT `/api/v1/pages/:id`                           | Admin + `edit`   | Any page fields                                                             | `{ status, data }`                    |
| DELETE `/api/v1/pages/:id`                        | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/gallery`                             | Public           | Query: `page?`, `limit?`                                                    | `{ status, data, pagination }`        |
| GET `/api/v1/gallery/package/:packageId`          | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/gallery/:packageId`                 | Admin + `create` | Multipart `image` files, optional `caption`, `sortOrder`                    | `{ status, data }`                    |
| PUT `/api/v1/gallery/:id`                         | Admin + `edit`   | Optional new `image`, `caption`, `packageId`, `sortOrder`                   | `{ status, data }`                    |
| DELETE `/api/v1/gallery/:id`                      | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/homegallery`                         | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/homegallery`                        | Admin + `create` | Multipart `image`, `title?`, `description?`, `sortOrder?`                   | `{ status, data }`                    |
| PUT `/api/v1/homegallery/:id`                     | Admin + `edit`   | Optional `image`, `title`, `description`, `sortOrder`                       | `{ status, data }`                    |
| DELETE `/api/v1/homegallery/:id`                  | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/images`                              | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/images/upload`                      | Admin + `create` | Multipart `image`                                                           | `{ status, data: { url, publicId } }` |
| DELETE `/api/v1/images/:id`                       | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| POST `/api/v1/delete-image`                       | Admin + `delete` | Body: `publicId`                                                            | `{ status, message }`                 |
| POST `/api/v1/video`                              | Admin + `create` | Multipart `file`, optional `title`, `description`, `packageId`, `sortOrder` | `{ status, data }`                    |
| GET `/api/v1/video`                               | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/video/package/:packageId`            | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/video/:id`                           | Public           | —                                                                           | `{ status, data }`                    |
| PUT `/api/v1/video/:id`                           | Admin + `edit`   | Optional new `file`, `title`, `description`, `packageId`, `sortOrder`       | `{ status, data }`                    |
| DELETE `/api/v1/video/:id`                        | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/testimonial`                         | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/testimonial/:id`                     | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/testimonial`                        | Admin + `create` | `packageId`, `fullName`, `rating (1-5)`, `comment`, optional `image`        | `{ status, data }`                    |
| PATCH `/api/v1/testimonial/:id`                   | Admin + `edit`   | Any testimonial fields                                                      | `{ status, data }`                    |
| DELETE `/api/v1/testimonial/:id`                  | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/home-testimonial`                    | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/home-testimonial/:id`                | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/home-testimonial`                   | Admin + `create` | `name`, `comment`, optional `image`, `sortOrder`                            | `{ status, data }`                    |
| PATCH `/api/v1/home-testimonial/:id`              | Admin + `edit`   | Updatable fields above                                                      | `{ status, data }`                    |
| DELETE `/api/v1/home-testimonial/:id`             | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/faq`                                 | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/faq/package/:packageId`              | Admin            | —                                                                           | `{ status, data, pagination }`        |
| GET `/api/v1/faq/:id`                             | Admin            | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/faq/:packageId`                     | Admin + `create` | `question`, `answer`, optional `sortOrder`                                  | `{ status, data }`                    |
| PUT `/api/v1/faq/:id`                             | Admin + `edit`   | Any FAQ fields                                                              | `{ status, data }`                    |
| DELETE `/api/v1/faq/:id`                          | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/homefaq`                             | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/homefaq`                            | Admin + `create` | `question`, `answer`, optional `sortOrder`                                  | `{ status, data }`                    |
| PUT `/api/v1/homefaq/:id`                         | Admin + `edit`   | Updatable FAQ fields                                                        | `{ status, data }`                    |
| DELETE `/api/v1/homefaq/:id`                      | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/trip-highlights/:id`                 | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/packages/:packageId/trip-highlights` | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/trip-highlights/:packageId`         | Admin + `create` | `title`, `description`, optional `sortOrder`                                | `{ status, data }`                    |
| PUT `/api/v1/trip-highlights/:id`                 | Admin + `edit`   | Any highlight fields                                                        | `{ status, data }`                    |
| PUT `/api/v1/trip-highlights/:id/reorder`         | Admin + `edit`   | `sortOrder`                                                                 | `{ status, data }`                    |
| DELETE `/api/v1/trip-highlights/:id`              | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/visit-places/:id`                    | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/packages/:packageId/visit-places`    | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/visit-places/:packageId`            | Admin + `create` | `title`, `description`, optional `sortOrder`                                | `{ status, data }`                    |
| PATCH `/api/v1/visit-places/:id`                  | Admin + `edit`   | Any visit-place fields                                                      | `{ status, data }`                    |
| PATCH `/api/v1/visit-places/:id/reorder`          | Admin + `edit`   | `sortOrder`                                                                 | `{ status, data }`                    |
| DELETE `/api/v1/visit-places/:id`                 | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/why-love`                            | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/why-love/package/:packageId`         | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/why-love/:id`                        | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/why-love`                           | Admin + `create` | `title`, `description`, optional `image`, `sortOrder`, `packageId`          | `{ status, data }`                    |
| PUT `/api/v1/why-love/:id`                        | Admin + `edit`   | Any fields above                                                            | `{ status, data }`                    |
| DELETE `/api/v1/why-love/:id`                     | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/attraction/package/:packageId`       | Admin            | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/attraction/:id`                      | Admin            | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/attraction/:packageId`              | Admin + `create` | `title`, `description`, optional `image`, `sortOrder`                       | `{ status, data }`                    |
| PUT `/api/v1/attraction/:id`                      | Admin + `edit`   | Updatable attraction fields                                                 | `{ status, data }`                    |
| DELETE `/api/v1/attraction/:id`                   | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/packageinfo/package/:packageId`      | Admin            | —                                                                           | `{ status, data, pagination }`        |
| GET `/api/v1/packageinfo/:id`                     | Admin            | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/packageinfo/:packageId`             | Admin + `create` | `description`, optional `sortOrder`                                         | `{ status, data }`                    |
| PUT `/api/v1/packageinfo/:id`                     | Admin + `edit`   | `description?`, `sortOrder?`                                                | `{ status, data }`                    |
| DELETE `/api/v1/packageinfo/:id`                  | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/inclusion/package/:packageId`        | Admin            | —                                                                           | `{ status, data, pagination }`        |
| GET `/api/v1/inclusion/:id`                       | Admin            | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/inclusion/:packageId`               | Admin + `create` | `description`, optional `sortOrder`                                         | `{ status, data }`                    |
| PUT `/api/v1/inclusion/:id`                       | Admin + `edit`   | Updatable inclusion fields                                                  | `{ status, data }`                    |
| DELETE `/api/v1/inclusion/:id`                    | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/exclusion/package/:packageId`        | Admin            | —                                                                           | `{ status, data, pagination }`        |
| GET `/api/v1/exclusion/:id`                       | Admin            | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/exclusion/:packageId`               | Admin + `create` | `description`, optional `sortOrder`                                         | `{ status, data }`                    |
| PUT `/api/v1/exclusion/:id`                       | Admin + `edit`   | Updatable exclusion fields                                                  | `{ status, data }`                    |
| DELETE `/api/v1/exclusion/:id`                    | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/requirement/package/:packageId`      | Admin            | —                                                                           | `{ status, data, pagination }`        |
| GET `/api/v1/requirement/:id`                     | Admin            | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/requirement/:packageId`             | Admin + `create` | `description`, optional `sortOrder`                                         | `{ status, data }`                    |
| PUT `/api/v1/requirement/:id`                     | Admin + `edit`   | Updatable requirement fields                                                | `{ status, data }`                    |
| DELETE `/api/v1/requirement/:id`                  | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/itinerary/package/:packageId`        | Admin            | —                                                                           | `{ status, data, pagination }`        |
| GET `/api/v1/itinerary/:id`                       | Admin            | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/itinerary/:packageId`               | Admin + `create` | `title`, `description`, `day`, optional `sortOrder`                         | `{ status, data }`                    |
| PUT `/api/v1/itinerary/:id`                       | Admin + `edit`   | Itinerary fields                                                            | `{ status, data }`                    |
| PATCH `/api/v1/itinerary/:id/reorder`             | Admin + `edit`   | `sortOrder`                                                                 | `{ status, data }`                    |
| DELETE `/api/v1/itinerary/:id`                    | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| POST `/api/v1/gear/:packageId`                    | Admin + `create` | `title`, optional `description`, `isActive`, `sortOrder`                    | `{ status, data }`                    |
| GET `/api/v1/gear/package/:packageId`             | Public           | Query: `page?`, `limit?`                                                    | `{ status, data, pagination }`        |
| GET `/api/v1/gear/:id`                            | Public           | —                                                                           | `{ status, data }`                    |
| PUT `/api/v1/gear/:id`                            | Admin + `edit`   | Any gear fields                                                             | `{ status, data }`                    |
| DELETE `/api/v1/gear/:id`                         | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| POST `/api/v1/important-notice`                   | Admin + `create` | `title`, `description`, `packageId`, optional `sortOrder`                   | `{ status, data }`                    |
| GET `/api/v1/important-notice/package/:packageId` | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/important-notice/:id`                | Public           | —                                                                           | `{ status, data }`                    |
| PUT `/api/v1/important-notice/:id`                | Admin + `edit`   | Notice fields                                                               | `{ status, data }`                    |
| DELETE `/api/v1/important-notice/:id`             | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| POST `/api/v1/useful-Info`                        | Admin + `create` | `title`, `description`, optional `sortOrder`                                | `{ status, data }`                    |
| PUT `/api/v1/useful-Info/:id`                     | Admin + `edit`   | Useful info fields                                                          | `{ status, data }`                    |
| DELETE `/api/v1/useful-Info/:id`                  | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/useful-Info`                         | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/insurance`                          | Admin + `create` | `title`, `description`, `packageId`, optional `sortOrder`                   | `{ status, data }`                    |
| GET `/api/v1/insurance`                           | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/insurance/package/:packageId`        | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/insurance/:id`                       | Public           | —                                                                           | `{ status, data }`                    |
| PUT `/api/v1/insurance/:id`                       | Admin + `edit`   | Insurance fields                                                            | `{ status, data }`                    |
| DELETE `/api/v1/insurance/:id`                    | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| POST `/api/v1/certificate`                        | Admin + `create` | `title`, `image` file, `sortOrder?`                                         | `{ status, data }`                    |
| PUT `/api/v1/certificate/:id`                     | Admin + `edit`   | Optional `title`, `image`, `sortOrder`                                      | `{ status, data }`                    |
| DELETE `/api/v1/certificate/:id`                  | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| GET `/api/v1/certificate`                         | Public           | —                                                                           | `{ status, data }`                    |
| POST `/api/v1/season-info`                        | Admin + `create` | `title`, `description`, `season`, optional `image`, `sortOrder`             | `{ status, data }`                    |
| GET `/api/v1/season-info`                         | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/season-info/:id`                     | Public           | —                                                                           | `{ status, data }`                    |
| PUT `/api/v1/season-info/:id`                     | Admin + `edit`   | Season info fields                                                          | `{ status, data }`                    |
| DELETE `/api/v1/season-info/:id`                  | Admin + `delete` | —                                                                           | `{ status, message }`                 |
| POST `/api/v1/teamMember`                         | Admin + `create` | `name`, `position`, optional `image`, `description`, `sortOrder`            | `{ status, data }`                    |
| GET `/api/v1/teamMember`                          | Public           | Query: `page?`, `limit?`                                                    | `{ status, data }`                    |
| GET `/api/v1/teamMember/home`                     | Public           | —                                                                           | `{ status, data }`                    |
| GET `/api/v1/teamMember/:id`                      | Public           | —                                                                           | `{ status, data }`                    |
| PUT `/api/v1/teamMember/:id`                      | Admin + `edit`   | Team member fields                                                          | `{ status, data }`                    |
| PUT `/api/v1/teamMember/:id/reorder`              | Admin + `edit`   | `sortOrder`                                                                 | `{ status, data }`                    |
| DELETE `/api/v1/teamMember/:id`                   | Admin + `delete` | —                                                                           | `{ status, message }`                 |

### Contact, Inquiry & Utility

| Method & Path                                   | Auth             | Required fields                                                             | Success response (shape)                                |
| ----------------------------------------------- | ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| POST `/api/v1/contact`                          | Public           | `name`, `email`, `phone?`, `message?`                                       | `{ status, data }`                                      |
| GET `/api/v1/contact`                           | Admin            | —                                                                           | `{ status, data, pagination }`                          |
| GET `/api/v1/contact/:id`                       | Admin            | —                                                                           | `{ status, data }`                                      |
| PUT `/api/v1/contact/:id`                       | Admin            | Updatable contact fields                                                    | `{ status, data }`                                      |
| DELETE `/api/v1/contact/:id`                    | Admin + `delete` | —                                                                           | `{ status, message }`                                   |
| POST `/api/v1/inquiry`                          | Public           | `name`, `email`, optional `phone`, `message`, `package`, `status`, `source` | `{ status, data }`                                      |
| GET `/api/v1/inquiry/`                          | Admin            | Query: `page?`, `limit?`, `status?`, `search?`                              | `{ status, data, pagination }`                          |
| GET `/api/v1/inquiry/:inquiryId`                | Admin            | —                                                                           | `{ status, data }`                                      |
| PATCH `/api/v1/inquiry/:inquiryId`              | Admin            | Any inquiry fields                                                          | `{ status, data }`                                      |
| DELETE `/api/v1/inquiry/:inquiryId`             | Admin + `delete` | —                                                                           | `{ status, message }`                                   |
| POST `/api/v1/inquiry/multiple-delete`          | Admin + `delete` | Body: `ids[]`                                                               | `{ status, message }`                                   |
| POST `/api/v1/inquiry/:inquiryId/reply`         | Admin + `create` | `subject`, `message`, optional `status`                                     | `{ success, message, data }`                            |
| GET `/api/v1/inquiry/:inquiryId/reply`          | Admin            | —                                                                           | `{ success, data }`                                     |
| GET `/api/v1/captcha`                           | Public           | —                                                                           | `{ status, data: { captchaQuestion, captchaToken } }`   |
| GET `/api/v1/stats`                             | Admin            | —                                                                           | `{ status, data: dashboardStats }`                      |
| GET `/api/v1/all-stats`                         | Admin            | —                                                                           | `{ status, data }`                                      |
| GET `/api/v1/stats/logins`                      | Public           | —                                                                           | `{ status, data }`                                      |
| GET `/api/v1/notifi/unseen-counts`              | Admin            | —                                                                           | `{ status, data: { bookings, customBookings, inbox } }` |
| PATCH `/api/v1/notifi/bookings/:id/seen`        | Admin            | —                                                                           | `{ status, message }`                                   |
| PATCH `/api/v1/notifi/custom-bookings/:id/seen` | Admin            | —                                                                           | `{ status, message }`                                   |
| PATCH `/api/v1/notifi/inbox/:id/seen`           | Admin            | —                                                                           | `{ status, message }`                                   |
| POST `/api/v1/track-visit`                      | Public           | `path`, `referrer?`, `userAgent?`                                           | `{ status, data }`                                      |
| GET `/api/v1/visits`                            | Admin            | Query: pagination                                                           | `{ status, data, pagination }`                          |
| GET `/api/v1/visits/stats`                      | Admin            | —                                                                           | `{ status, data }`                                      |
| GET `/api/v1/insurance`                         | Public           | —                                                                           | `{ status, data }`                                      |

---

## Additional Notes

### Cron Jobs

The application runs scheduled tasks:

- **Fixed Date Expiry:** Automatically marks past fixed dates as expired

### Real-time Features

Socket.IO integration enables:

- Real-time booking notifications
- Admin dashboard updates
- Live inquiry notifications

### Security Features

- Password hashing with bcrypt
- JWT token authentication
- Rate limiting on API endpoints
- CORS configuration
- Input validation with Zod
- SQL injection prevention (MongoDB)
- XSS protection

### Performance Optimizations

- Redis caching
- Database indexing
- Image optimization via Cloudinary
- Compression middleware
- Response time tracking

---

## Support & Maintenance

### Logging

The application uses Pino for structured logging:

- Request/response logging
- Error tracking
- Performance metrics

### Monitoring

- PM2 process monitoring
- Redis queue monitoring
- Database connection health checks

### Backup Strategy

- Regular MongoDB backups
- Redis persistence configuration
- Media backup via Cloudinary

---

**Documentation Version:** 1.0  
**Last Updated:** November 2025  
**Author:** WebX Nepal  
**Contact:** flyeast2025@outlook.com
