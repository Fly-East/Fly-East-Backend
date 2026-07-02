# FlyEast Backend API Guide

Express + TypeScript + MongoDB (Mongoose), Redis caching, Cloudinary media, Multer for uploads, Zod validation, JWT auth/role guard.

Base path: `/api/v1/*` unless noted.

Common behaviors
- Auth: Bearer JWT; admin routes use `isAdmin` + `checkPermissions(["create"|"edit"|"delete"])`.
- Validation: Zod; errors shape `{ status:"fail", errors:[{ field, message }] }`.
- File uploads: multipart/form-data via `multer`; files merged into `req.body` by `mergeFilesIntoBody`. Images stored on Cloudinary; HTTPS URLs saved in DB.
- IDs: Mongo ObjectIds. Slugs accepted where supported (e.g., package GET).

Key domain models (selected)
- Category/SubCategory: hierarchical grouping.
- Package: name, slug, categoryId, subCategoryId, season[], overview, location, duration, elevation, distance, flags (`isPopular`, `addToHome`), media (`coverImage`, `routeMap`, gallery), sortOrder, extras (`activity`, `groupSize`, `vehicle`, `difficulty`, `accommodation`, `meal`, `note`).
- Booking/CustomBooking/PrivateTrip: capture traveler info and selections.
- Content: Blog, Gallery, Video, Page, Testimonials, FAQs, Inclusions/Exclusions, Trip highlights, Visit places, Why-love-this-trek, Gear, Important notices, Insurance, Season info, Home FAQ/Testimonial/Gallery.

Auth & Users
- `POST /api/v1/user/login` — body `{ email, password }` → JWT + user.
- `POST /api/v1/user` — create user (admin).
- `GET /api/v1/user/me` — current user profile (auth).

Categories
- `GET /api/v1/category` — list.
- `POST /api/v1/category` — create; body `{ name, description?, image? }` (admin).
- `GET /api/v1/subcategory` — list.
- `POST /api/v1/subcategory` — create; body `{ name, categoryId, description?, image? }` (admin).

Packages
- `GET /api/v1/package` — list with pagination & filters `?page&limit&season&category`.
- `GET /api/v1/package/:id` — by id or slug.
- `GET /api/v1/package/season/:season` — season(s) comma-separated.
- `GET /api/v1/package/category/:categoryId`
- `GET /api/v1/package/subcategory/:subCategoryId`
- `POST /api/v1/package` (admin, create permission) — multipart:
  - fields: name (req), subCategoryId (req), season (array or comma string), overview (req), location (req), duration (req), slug?, sortOrder?, elevation?, distance?, isPopular?, addToHome?, activity?, groupSize?, vehicle?/vechile?, difficulty?, accommodation?, meal?, note?
  - files: `coverImage` (1), `routeMap` or `roadMap` (1), `gallery` (up to 6)
- `PUT /api/v1/package/:id` — same fields/files; optional.
- `DELETE /api/v1/package/:id` (admin, delete permission).

Search
- `GET /api/v1/search` — query params: `query, location, activity, difficulty, groupSize, minDuration, maxDuration, minPrice, maxPrice, isPopular, page, limit, sortBy, sortOrder`.

Bookings
- `POST /api/v1/booking` — create package booking; includes traveler/contact info, package refs.
- `POST /api/v1/custom-booking` — custom trip request (optional `startTripDate`).
- `POST /api/v1/private-trip` — private trip inquiry.
- Replies: `POST /api/v1/booking-reply`, `POST /api/v1/custom-booking-reply`.

Content & Media (selected)
- Galleries: `GET /api/v1/gallery`, `POST /api/v1/gallery` (upload), similar for `homeGallery`.
- Video: `GET /api/v1/video`, `POST /api/v1/video`.
- Blog: `GET /api/v1/blog`, `POST /api/v1/blog`.
- Testimonials/FAQ/Inclusion/Exclusion/Requirement/AddOn/Pax/Itinerary/Attraction/PackageInfo/TripHighlight/VisitPlace/WhyLoveThisTrek: standard CRUD under `/api/v1/<resource>`.
- Image utility: `/api/v1/image` upload; `/api/v1/deleteImage` to remove by publicId.

Contact & Misc
- `POST /api/v1/contact` — contact form.
- `POST /api/v1/inquiry` — general inquiries.
- `POST /api/v1/inquiry/:inquiryId/reply` — admin reply to an inquiry.
- `GET /api/v1/inquiry/:inquiryId/reply` — list replies for an inquiry.
- `GET /api/v1/stats` — dashboard stats (admin).
- `GET /api/v1/track-visit` — visit tracker.
- `GET /api/v1/important-notice`, `GET /api/v1/useful-info`, `GET /api/v1/insurance`, `GET /api/v1/season-info`, `GET /api/v1/certificate`.

Typical responses
- Success list: `{ status: "success", results, total?, page?, pages?, data }`
- Success single: `{ status: "success", data }`
- Validation: `{ status: "fail", errors: [{ field, message }] }`
- Server: `{ status: "error", message }`

Multipart upload example (package create)
```
POST /api/v1/package
Headers: Authorization: Bearer <token>
Form-data:
  name=Annapurna Circuit Trek
  subCategoryId=<subCatId>
  season[]=spring
  season[]=autumn
  location=Besisahar to Jomsom, Nepal
  duration=15 days / 14 nights
  overview=A classic circuit over Thorong La.
  isPopular=true
  coverImage=@/path/cover.jpg
  routeMap=@/path/route.png
  gallery=@/path/gal1.jpg
  gallery=@/path/gal2.jpg
```

Architecture (overview)
- API Layer: Express routers under `src/routes/*`; validation (Zod), auth (JWT), permissions, Multer upload, mergeFilesIntoBody, caching (Redis).
- Services/Controllers: business logic in `src/controller/*`.
- Data: MongoDB via Mongoose models in `src/models/*`; media references stored as Cloudinary URLs.
- Caching: Redis for package lists/search; keys prefixed (`packages:*`, `search:*`).
- Storage: Cloudinary for images; HTTPS URLs persisted.

Notes
- Some admin routes may be hidden behind middleware; ensure JWT with appropriate roles/permissions.
- For booleans/arrays in form-data: booleans accept string values (`true/false/1/0`), arrays accept repeated keys or comma/bracket strings (e.g., `season[]=spring` or `[spring,autumn]`).
- Slugs must be lowercase hyphenated; unique per package.
