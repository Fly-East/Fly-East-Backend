# FlyEast Backend – Full API Documentation

This document describes every major API interaction, the payload that you must send, and which fields are required vs optional. The backend is served at `BASE_URL = /api/v1`. Unless otherwise noted, content-type is `application/json` and responses follow:

```json
{
  "status": "success" | "fail" | "error",
  "msg"?: "human readable message",
  "message"?: "human readable message",
  "data"?: {},
  "errors"?: [...]
}
```

## Common conventions

- **Authentication:** send `Authorization: Bearer <jwt>` header. Public routes need only optional `accessToken` cookies.
- **Admin routes** are protected by `isAdmin` + `checkPermissions(["create" | "edit" | "delete" | "all"])`.
- **Pagination:** use `page` and `limit` on list endpoints. Responses include a `pagination` object with `total`, `totalPages`, `currentPage`, `itemsPerPage`, `hasNextPage`, `hasPrev`, `nextPage`, `previousPage`.
- **Uploads:** any route marked `multipart/form-data` (e.g., package, gallery) must include files as `coverImage`, `routeMap`, `image`, or `gallery`. Arrays accept repeated keys (`season[]=spring`, `gallery=@file.jpg`).
- **Booleans/Numbers:** send as JSON native types or strings (`"true"`, `"1"`, `"3"`), the server normalizes using Zod or manual parsing.
- **ObjectIDs & Slugs:** provide MongoDB ObjectIds for references (`package`, `subCategoryId`, `fixedDateId`) unless a slug is accepted (some GETs/DELETE support slug).
- **Cache keys:** `packages:*`, `itineraries:*`, `shortItinerary:*`, `images:*` are cleared after writes – no action needed from clients.

## 1. Authentication & User Management

### `POST /api/v1/users/register`
- **Auth:** Public
- **Description:** Register a new traveller.
- **Body (JSON):**
  - `email` _(required)_ – valid email.
  - `password` _(required)_ – minimum 8 characters, mix of letters + numbers.
  - `firstName`, `lastName` _(optional)_ – friendly names.
  - `phone`, `country`, `role`, `permissions` _(optional)_ – admin fills these later.
  - `source`, `referrer` _(optional)_ – tracking metadata.
- **Response:** newly created user (no tokens until login).

### `POST /api/v1/users/login`
- **Auth:** Public
- **Body:**
  - `email` _(required)_
  - `password` _(required)_
- **Response:** `{ status, msg, accessToken, user }` and sets `accessToken` cookie.

### `GET /api/v1/users/logout`
- **Auth:** Authenticated
- **Description:** Clears refresh cookie.

### `GET /api/v1/users/current`
- **Auth:** Authenticated
- **Description:** Returns current user profile and permissions.

### Password recovery
- `POST /api/v1/users/forgot-password` – send `{ email }`.
- `POST /api/v1/users/reset-password` – query `token`, `email`; body `{ newPassword }`.

### Admin user controls
- `GET /api/v1/users/admin/get-all-users` – internal list; no body.
- `POST /api/v1/users/admin/create-user` – requires `{ email, password }`, optional `{ firstName, lastName, permissions: string[] }`.
- `PATCH /api/v1/users/admin/update-user/:id/permissions` – send any of `{ firstName?, lastName?, email?, permissions? }`.
- `DELETE /api/v1/users/admin/delete-user/:id` – no body; admin-only.

## 2. Catalog & Packages

### Categories
- `GET /api/v1/category` – optional `page`, `limit`.
- `GET /api/v1/category/:idOrSlug` – path param required.
- `POST /api/v1/category` _(admin/create)_: body `{ name (required), description (required), slug?, image (file), addToHome?, sortOrder?, banner? }`.
- `PUT /api/v1/category/:id` – same fields optional.
- `DELETE /api/v1/category/:id`

### Subcategories
- `GET /api/v1/subcategory` – optional `category`, `page`, `limit`.
- `GET /api/v1/subcategory/:id`
- `POST /api/v1/subcategory` _(admin/create)_: `{ name, description, category (ObjectId) }`, optional image upload.
- `PUT /api/v1/subcategory/:id` – update fields.
- `DELETE /api/v1/subcategory/:id`

### Packages
- `GET /api/v1/package` – query filters `page`, `limit`, `search`, `season`, `category`, `subCategory`, `sort`.
- `GET /api/v1/package/:idOrSlug` – path param.
- `GET /api/v1/package/category/:categoryId`, `/package/subcategory/:subCategoryId` – path param `ObjectId`.
- `GET /api/v1/packages/search` – query params: `query`, `location`, `activity`, `difficulty`, `groupSize`, `minDuration`, `maxDuration`, `minPrice`, `maxPrice`, `isPopular`, `page`, `limit`, `sortBy`, `sortOrder`.
- `POST /api/v1/package` _(admin/create)_: multipart/form-data.
  - Required fields: `name`, `subCategoryId` (ObjectId), `season[]` (array), `overview`, `location`, `duration`.
  - Required files: `coverImage` (exactly one), `routeMap` (named `routeMap` or `roadMap`), optional `gallery[]`.
  - Optional fields: `slug`, `sortOrder`, `elevation`, `distance`, `addToHome` (boolean), `isPopular` (boolean), `activity`, `groupSize`, `vehicle`, `difficulty`, `accommodation`, `meal`, `note`, `essentialInformation`, `startPoint`, `endPoint`, `transportation`, `mealsIncluded`, `region`, `faq`, `highlights`, `itinerary`, `inclusions`.
  - Additional uploads: `coverImage`, `routeMap`, `gallery`.
- `PUT /api/v1/package/:id` – same payload but every field optional; send only what changes.
- `DELETE /api/v1/package/:id` – admin delete.

### Supporting catalog endpoints
- `GET /api/v1/lowest-price` – no body, returns cheapest active fixed date.
- `POST /api/v1/pax/:packageId` _(admin)_ – create group discount tier. Body: `{ min (required), max (required), discount (required), sortOrder?, price?, pricePerperson? }`.
- `GET /api/v1/pax/package/:packageId` – list.
- `PUT /api/v1/pax/:id`, `DELETE /api/v1/pax/:id` – update/delete specific tier.
- `POST /api/v1/addons/:packageId` _(admin)_ – multipart: `name` (required), `description` (required), `price` (required number), optional `image` file, `sortOrder`.
- `GET /api/v1/addons/package/:packageId`, `GET /api/v1/addons/:addonId`, `PUT /api/v1/addons/:addonId`, `DELETE /api/v1/addons/:addonId`.

## 3. Pricing & Availability

### Fixed Dates
- `POST /api/v1/fixed-date/:packageId` _(admin/create)_: body JSON.
  - Required: `startDate`, `endDate` (endDate > startDate), `numberOfPerson`, `pricePerPerson`, `status` (`Open` by default if omitted).
  - Optional: `availableSeats` (defaults to `numberOfPerson`), `sortOrder`.
  - Package path param is required and validated.
- `GET /api/v1/fixed-date/package/:packageId` – pagination via `page`, `limit`.
- `GET /api/v1/fixed-date/:id` – fetch single date.
- `PUT /api/v1/fixed-date/:id` – update the same fields.
- `DELETE /api/v1/fixed-date/:id`

### Lowest Price Shortcut
- `GET /api/v1/lowest-price` – returns the cheapest `FixedDate` row or `null`.

## 4. Booking & Trip Requests

### Package Booking (`POST /api/v1/booking`)
- **Auth:** Public (optional login).
- **Body (JSON):**
  - `package` _(required)_: package ObjectId.
  - `fixedDateId` _(required)_: FixedDate ObjectId.
  - `totalAmount` _(required)_: number (total to charge).
  - `currency` _(required)_: 3-letter code (e.g., `USD`).
  - `totalPeople` _(required)_: integer (>=1).
  - `arrivalDate`, `departureDate` _(optional but recommended if travel dates differ)_.
  - `message` _(optional)_ – freeform traveler notes.
  - `addons[]` _(optional)_: array of Addons ObjectIds.
  - `personalInfo[]` _(required array)_: each traveler object must include:
    - `fullName` (required), `email` (required, valid email), `country` (required), `phoneNumber` (required).
  - `createdBy` (optional) – admin user Id.
  - `customizedBooking` (optional) – flag if this deviates from standard package.
- **Response:** Booking document with generated `bookingReference`, `status`, `paymentStatus`.

### Booking Management
- `GET /api/v1/booking` _(admin)_ – query `page`, `limit`, optionally `status`, `search`.
- `GET /api/v1/booking/:id` – fetch single booking.
- `PATCH /api/v1/booking/:id/status` _(admin)_: body `{ status?, paymentStatus? }`.
- `PATCH /api/v1/booking/:id/cancel` _(admin)_: optional `{ reason }`.
- `DELETE /api/v1/booking/:id`
- `POST /api/v1/reply` _(admin)_ – send email reply to booking travellers. Body `{ bookingId, subject, message, status?, bookingStatus? }`.

### Custom Booking
- `POST /api/v1/custom-booking` – body mirrors booking but enforces `arrivalDate`, `departureDate` (optional `startTripDate`).
- `GET /api/v1/custom-booking` – admin paginated list.
- `GET /api/v1/custom-booking/:id` – public (shareable link) returns booking details.
- `PATCH /api/v1/custom-booking/:id/status` – update `status` and optional `paymentStatus`.
- `PATCH /api/v1/custom-booking/:id/cancel` – optional `{ reason }`.
- `DELETE /api/v1/custom-booking/:id`
- `POST /api/v1/custom-booking-reply` – same payload as `/reply` but for custom bookings.

### Private Trip Inquiry
- `POST /api/v1/private-trip`
  - Required body fields: `packageId` (ObjectId), `leadTravellerName`, `email`, `phone`, `numberOfTraveller` (positive integer), `message`, `captchaToken`, `captchaAnswer`.
  - Optional: `date` (ISO, defaults to now), `country`, `termsAndAgreement`, `howDidYouReachUs`.
- `GET /api/v1/private-trip/:privateTripId` – fetch single.
- `GET /api/v1/private-trip` _(admin)_ – `page`, `limit`, `sort`, `search`.
- `PATCH /api/v1/private-trip/:privateTripId` – send any subset of above fields (all optional).
- `DELETE /api/v1/private-trip/:privateTripId`
- `POST /api/v1/private-trip/delete-many` – body `{ ids: string[] }`.

## 5. Content & Media

### Blog & Pages
- `POST /api/v1/blog` _(admin/import)_: `{ title (required), slug (required), banner (required image URL), description (required), metaTitle?, metaDescription?, tags? }`.
- `PATCH/DELETE` share the same params.
- `GET /api/v1/blog/:blogId`, `/blog`, `/blog/get-all-blogs/for-card` – no body.
- `POST /api/v1/pages` _(admin)_: `{ title, slug, content, status?, image?, metaTitle?, metaDescription?, keywords? }`.
- `PUT /api/v1/pages/:id` – optional updates, `DELETE` removes.

### Galleries & Videos
- `POST /api/v1/gallery/:packageId` _(admin)_:
  - Multipart: `image` (required file), optional `caption`, `sortOrder`, `visibility`.
  - `packageId` path param required.
- `GET /api/v1/gallery` – accessible list; include `page`/`limit`.
- `PUT /api/v1/gallery/:id`, `DELETE /api/v1/gallery/:id` – update caption/image or drop.
- `POST /api/v1/homegallery` _(admin)_ – same structure but for home page.
- `GET /api/v1/homegallery` – list.
- `POST /api/v1/video` _(admin)_: multipart `file` (required), optional `title`, `description`, `packageId`, `sortOrder`.
- `GET /api/v1/video`, `/api/v1/video/:id`, `/api/v1/video/package/:packageId`.
- `PUT /api/v1/video/:id`, `DELETE /api/v1/video/:id`.

### Testimonials & FAQs
- `POST /api/v1/testimonial` _(admin)_:
  - `packageId` (ObjectId, optional), `fullName` (required), `rating` (1-5, required), `comment` (optional), `image` (optional URL), `sortOrder?`.
- `PATCH /api/v1/testimonial/:id`, `DELETE /api/v1/testimonial/:id`.
- `POST /api/v1/home-testimonial` – simplified hero testimonial: `{ name, quote, image?, sortOrder? }`.
- `POST /api/v1/faq/:packageId` _(admin)_: `{ question (required), answer (required), sortOrder? }`.
- `GET /api/v1/faq`, `/api/v1/faq/:id`, `/api/v1/faq/package/:packageId`.
- `POST/PUT/DELETE` analogously exist for `homefaq`, `trip-highlights`, `visit-places`, `why-love`, `attraction`, `packageinfo`, `inclusion`, `exclusion`, `requirement`, `important-notice`, `useful-Info`, `insurance`, `certificate`, `season-info`, `teamMember`. Each expects:
  - `title`/`question`/`description` etc depending on resource.
  - `sortOrder` optional number.
  - `image` optional URL or file when marked.

### Image Management
- `POST /api/v1/images/upload` _(admin)_: single `image` file + optional `{ altText, tags (comma separated) }`. Response includes `url`, `publicId`, `width`, `height`, `format`.
- `GET /api/v1/images` – lists active images with pagination.
- `DELETE /api/v1/images/:id` _(admin)_ – marks `isActive` false and removes Cloudinary file.
- `POST /api/v1/delete-image` _(admin)_:
  - Body `{ image (full URL), id (package ObjectId) }`.
  - Removes entry from `package.gallery`.

## 6. Itineraries

### Detailed Itineraries
- `POST /api/v1/itinerary/:packageId` _(admin/create)_: multipart upload.
  - Required: `title`, `packageId` path param (ObjectId).
  - Optional body: `description`, `days`, `duration`, `maxAltitude`, `activity`, `meals`, `accommodation`, `sortOrder`.
  - File field: `image` (single). The controller also accepts extra files through `req.files` and stores them as `images` array for future use.
- `GET /api/v1/itinerary/package/:packageId` – admin list; returns sorted data.
- `GET /api/v1/itinerary/:id` – fetch one itinerary entry.
- `PUT /api/v1/itinerary/:id` – same body as create; `image` file optional to replace.
- `DELETE /api/v1/itinerary/:id`.
- `PATCH /api/v1/itinerary/sort-order/:packageId`:
  - Body: `{ itineraries: [{ _id: <ObjectId>, sortOrder: <positive number> }, ...] }`.
  - `sortOrder` must be ≥1; server reorders and updates `days` labels.

### Short Itineraries
- `POST /api/v1/short-itinerary/:packageId` _(admin/create)_:
  - Required: `title` (min 3 characters), `packageId` path param.
  - Optional: `days` string (e.g., `"Day 1: Kathmandu → Lukla"`).
- `GET /api/v1/short-itinerary/package/:packageId` – list per package.
- `PUT /api/v1/short-itinerary/:id` – update `{ title?, days?, sortOrder? }` (sortOrder accepts number or numeric string; must be ≥1).
- `DELETE /api/v1/short-itinerary/:id`.
 - `GET /api/v1/short-itinerary` _(admin)_ – fetch every short itinerary across packages, with populated `package.name` and `package.slug`.
 - `GET /api/v1/short-itinerary/:id` _(admin)_ – returns the short itinerary plus a populated package summary (`name`, `slug`, `duration`, `location`).

## 7. Utilities & Support

### Contact & Inquiry
- `POST /api/v1/contact` – public contact form.
  - Required: `name`, `email`, `message`.
  - Optional: `company`, `budget`, `goal`, `number`, `travelDate`, `source`.
- `GET /api/v1/contact` _(admin)_ – list.
- `GET /api/v1/contact/:id`, `PUT /api/v1/contact/:id`, `DELETE /api/v1/contact/:id`.
- `POST /api/v1/inquiry` – required `{ name, email }`, optional `{ phone, message, package, status, source }`.
- `GET /api/v1/inquiry` – admin list with filters; patch/delete share same paths.
- `POST /api/v1/inquiry/multiple-delete` – body `{ ids: string[] }`.
- `POST /api/v1/inquiry/:inquiryId/reply` – admin reply; body `{ subject, message, status? }`.
- `GET /api/v1/inquiry/:inquiryId/reply` – admin list replies for an inquiry.

### Analytics & Notifications
- `GET /api/v1/stats`, `/api/v1/all-stats` – admin dashboard counters.
- `GET /api/v1/stats/logins` – login counts.
- `GET /api/v1/notifi/unseen-counts` – admin notifications counts.
- `PATCH /api/v1/notifi/bookings/:id/seen`, `/custom-bookings/:id/seen`, `/inbox/:id/seen` – mark entries as seen.

### Visits & Captcha
- `POST /api/v1/track-visit` – body `{ path (required), referrer?, userAgent? }`.
- `GET /api/v1/visits` – admin list of tracked visits.
- `GET /api/v1/visits/stats`.
- `GET /api/v1/captcha` – returns `{ captchaQuestion, captchaToken }` for private trip submissions.

## 8. Best Practices

- **Always validate IDs:** Use `mongoose.Types.ObjectId.isValid` before hitting endpoints that expect `_id`.
- **Respect sortOrder sequencing:** When you insert a new itinerary/short itinerary/fixed date without `sortOrder`, the server auto-increments. When manually reordering, send the full updated array so the server can prevent collisions.
- **Use UTC dates:** send ISO strings (e.g., `2026-01-23T00:00:00.000Z`) when calling `arrivalDate`, `departureDate`, `startDate`, `endDate`.
- **Traveller arrays:** `personalInfo` expects at least one traveler and will reject empty arrays.
- **Uploads:** For `gallery`, send the same field name multiple times. For `coverImage`/`routeMap`, send exactly one file each; missing files result in validation errors.
- **Captcha:** Always refresh captcha tokens before submitting the private trip form; tokens expire soon after creation.

## 9. Sample Booking Payload

```json
{
  "package": "64cabb79b6b1c3a0d4f4f1a1",
  "fixedDateId": "64cabc00bfbfbcedd9bbac09",
  "totalAmount": 4199,
  "currency": "USD",
  "totalPeople": 3,
  "arrivalDate": "2026-04-12",
  "departureDate": "2026-04-23",
  "message": "We want private transfers on arrival.",
  "addons": ["64cabcf023bfea36c4a5bbdd"],
  "personalInfo": [
    {
      "fullName": "Alice Mercer",
      "email": "alice@example.com",
      "country": "US",
      "phoneNumber": "+1-555-1234"
    },
    {
      "fullName": "Bob Mercer",
      "email": "bob@example.com",
      "country": "US",
      "phoneNumber": "+1-555-5678"
    },
    {
      "fullName": "Charlie Mercer",
      "email": "charlie@example.com",
      "country": "US",
      "phoneNumber": "+1-555-9012"
    }
  ]
}
```

## 10. Where to look for more

- `src/routes/*.ts` – route definitions and middleware order.
- `src/schema/*.ts` – Zod validators that declare required fields.
- `src/models/*.ts` – Mongoose field definitions, enums, defaults.
- `docs/gear.md` – example of detailed feature docs.
