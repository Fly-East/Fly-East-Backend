# Traveller records read API

Read-only access for an external service. These routes do not accept writes. Admin JWT routes are separate and use a different error shape. Use this document for these routes.

Base path: `/api/v1/external/traveler-records`

## Authentication

Send the key on every request:

```
X-Api-Key: <TRAVELER_RECORDS_READ_API_KEY>
```

`Authorization` is ignored. A JWT does not open these routes.

Only `GET` is registered. `POST`, `PUT`, and `DELETE` are not part of this API. They fall through to the app 404:

```json
{ "status": "error", "message": "Route /api/v1/external/traveler-records not found" }
```

The API key is checked before query validation. A bad key with a bad query is `401`, not `400`.

The server allows 1000 requests per minute per IP. Over that:

```json
{ "error": "Too many requests. Please try again later." }
```

HTTP status `429`.

## Errors

| Status | When | Body |
| --- | --- | --- |
| 400 | Query or `:id` failed validation | `{ "success": false, "message": "Validation failed", "errors": [{ "field", "message" }] }` |
| 401 | Missing or wrong `X-Api-Key` | `{ "success": false, "message": "Invalid API key" }` |
| 404 | Record id not found | `{ "success": false, "message": "Not found" }` |
| 500 | Server failed to read records | `{ "success": false, "message": "Failed to load traveller records" }` |
| 503 | `TRAVELER_RECORDS_READ_API_KEY` is unset | `{ "success": false, "message": "Traveller read API is not configured" }` |

`errors[].field` is the query or path name you sent (`departureFrom`, `id`). It is not prefixed with `query` or `params`.

Two fields failing at once:

```http
GET /api/v1/external/traveler-records/groups?departureFrom=yesterday
X-Api-Key: <key>
```

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "departureFrom", "message": "Invalid date" },
    { "field": "groupBy", "message": "Required" }
  ]
}
```

`groupBy` is required only on `/groups`. On the list it is optional.

Other validation messages:

- Unknown query key, including a typo such as `departueFrom`: `{ "field": "departueFrom", "message": "Unrecognized key: departueFrom" }`.
- `page=abc` or `limit=1.5`: `page must be an integer` or `limit must be an integer`.
- `page=0`: `page must be at least 1`. `limit=101`: `limit must be at most 100`.
- Repeated key (`?page=1&page=2`): `page must be a single value`.
- `:id` that is not 24 hex characters: `{ "field": "id", "message": "Invalid id" }`.
- `sortBy`, `sortOrder`, `hasDocuments`, or `groupBy` outside the lists below: `Invalid value. Expected ...`.

## Shared filters

List, groups, and stats accept these query parameters. All are optional.

| Param | Rule |
| --- | --- |
| `q` | Fuzzy search. Scope a token with a field name, for example `passport:AB12` or `email:ada@example.com`. |
| `nationality` | Case-insensitive exact match. |
| `trekkingRegion` | Case-insensitive exact match. |
| `trekkingRoute` | Case-insensitive exact match. |
| `gender` | Case-insensitive exact match. |
| `insuranceCompany` | Case-insensitive exact match. |
| `createdFrom`, `createdTo` | `createdAt` range. `YYYY-MM-DD` is a Kathmandu calendar day. Other strings must parse as a date. |
| `departureFrom`, `departureTo` | Same rules, on `departureDate`. |
| `hasDocuments` | `true` or `false`. |

`page` and `limit` are accepted on groups and stats and ignored there. They change the list only.

When `q` matches, the server scores at most 5000 newest candidates. If that cap is hit, `searchTruncated` is `true` and totals are incomplete.

## 1. List records

`GET /api/v1/external/traveler-records`

Extra query params, all optional:

| Param | Rule |
| --- | --- |
| `page` | Integer, minimum 1. Default 1. |
| `limit` | Integer from 1 to 100. Default 20. |
| `sortBy` | `fullName`, `email`, `departureDate`, `bookingDate`, `createdAt`, `passportNumber`. |
| `sortOrder` | `asc` or `desc`. Default `desc` when `sortBy` is set. Empty values sort last. |
| `groupBy` | Same values as the groups endpoint. Used only together with `groupKey`. |
| `groupKey` | One group key from `/groups`, or `__none` for records with no value. Ignored unless `groupBy` is also set. |

```bash
curl -sS \
  -H "X-Api-Key: $TRAVELER_RECORDS_READ_API_KEY" \
  "https://<host>/api/v1/external/traveler-records?page=1&limit=20&trekkingRegion=Everest&departureFrom=2026-03-01&departureTo=2026-03-31"
```

```json
{
  "success": true,
  "data": [
    {
      "_id": "664f1c2a9b8e4c0012ab34cd",
      "fullName": "Ada Lovelace",
      "firstName": "Ada",
      "lastName": "Lovelace",
      "nationality": "British",
      "passportNumber": "123456789",
      "email": "ada@example.com",
      "whatsappNumber": "+9779800000000",
      "trekkingRegion": "Everest",
      "trekkingRoute": "EBC",
      "departureDate": "2026-03-10T00:00:00.000Z",
      "documents": [
        {
          "_id": "664f1c2a9b8e4c0012ab34ce",
          "kind": "passport_bio",
          "imageUrl": "https://res.cloudinary.com/example/image/upload/passport.jpg",
          "publicId": "traveler-records/passport",
          "source": "upload"
        }
      ],
      "createdAt": "2026-03-01T04:15:00.000Z",
      "updatedAt": "2026-03-01T04:15:00.000Z"
    }
  ],
  "pagination": {
    "count": 1,
    "total": 1,
    "page": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

When `q` is set, each row may also include `searchScore` (number) and `matchedFields` (string array), and the body includes `searchTruncated` (boolean).

Page until `pagination.hasNextPage` is false. Keep the same filters and increase `page` by 1. `limit` cannot be above 100.

Request `page=1` and `limit=100`. If `pagination.hasNextPage` is true, request the next integer `page` with the same filters. Stop when `hasNextPage` is false or `success` is false.

## 2. One record

`GET /api/v1/external/traveler-records/:id`

`id` is the 24-character hex `_id`. No query parameters. Any query key is `400`.

```bash
curl -sS \
  -H "X-Api-Key: $TRAVELER_RECORDS_READ_API_KEY" \
  "https://<host>/api/v1/external/traveler-records/664f1c2a9b8e4c0012ab34cd"
```

```json
{ "success": true, "data": { "_id": "664f1c2a9b8e4c0012ab34cd", "fullName": "Ada Lovelace" } }
```

`data` is the same record object as one list row, without `searchScore`.

## 3. Groups

`GET /api/v1/external/traveler-records/groups`

`groupBy` is required. One of:

`createdAt`, `trekkingRegion`, `trekkingRoute`, `departureDate`, `bookingDate`, `insuranceCompany`, `passportNumber`.

Also accepts the shared filters, plus `page` and `limit` (both ignored). Does not accept `sortBy`, `sortOrder`, or `groupKey`.

Date groups use Kathmandu calendar days (`YYYY-MM-DD`). Records with no value use key `__none`.

Pills inside a group: traveller names when grouped by passport, routes when grouped by region, regions otherwise.

```bash
curl -sS \
  -H "X-Api-Key: $TRAVELER_RECORDS_READ_API_KEY" \
  "https://<host>/api/v1/external/traveler-records/groups?groupBy=trekkingRegion&departureFrom=2026-03-01"
```

```json
{
  "success": true,
  "data": [
    {
      "key": "Everest",
      "count": 12,
      "pills": [{ "name": "EBC", "count": 9 }, { "name": "Three Passes", "count": 3 }]
    },
    { "key": "__none", "count": 2, "pills": [] }
  ],
  "total": 14,
  "searchTruncated": false
}
```

To list the rows in one group, call the list endpoint with the same filters plus `groupBy` and `groupKey` (the group's `key`).

## 4. Stats

`GET /api/v1/external/traveler-records/stats`

Accepts the shared filters, plus `page` and `limit` (both ignored). Does not accept `groupBy`, `groupKey`, `sortBy`, or `sortOrder`.

```bash
curl -sS \
  -H "X-Api-Key: $TRAVELER_RECORDS_READ_API_KEY" \
  "https://<host>/api/v1/external/traveler-records/stats?trekkingRegion=Annapurna"
```

```json
{
  "success": true,
  "searchTruncated": false,
  "data": {
    "total": 40,
    "onTrekNow": 3,
    "upcoming": 5,
    "upcomingDays": 30,
    "withInsurance": 28,
    "withGuide": 10,
    "withDocuments": 36,
    "byRegion": [{ "name": "Annapurna", "count": 40 }],
    "byRoute": [{ "name": "ABC", "region": "Annapurna", "count": 18 }],
    "byNationality": [{ "name": "British", "count": 6 }],
    "nationalityCount": 11,
    "byGender": [{ "name": "Female", "count": 22 }],
    "byInsurance": [{ "name": "AIG", "count": 9 }],
    "trend": [{ "month": "2026-03", "created": 4, "departures": 7 }]
  }
}
```

`onTrekNow` counts records whose departure is on or before now and whose end date is on or after now. `upcoming` counts departures in the next `upcomingDays` (30). `byRoute` and `byNationality` are the top 10. `trend` is the last 24 months, `YYYY-MM` in Asia/Kathmandu. `byRegion` is every region that has rows.

## 5. Options

`GET /api/v1/external/traveler-records/options`

No query parameters. Any query key is `400`.

```bash
curl -sS \
  -H "X-Api-Key: $TRAVELER_RECORDS_READ_API_KEY" \
  "https://<host>/api/v1/external/traveler-records/options"
```

```json
{
  "success": true,
  "data": {
    "regions": [
      { "name": "Annapurna", "routes": ["Annapurna Circuit", "Poonhill", "ABC", "Mardi Himal", "Upper Mustang", "Narphu Valley","Lower Mustang"] },
      { "name": "Everest", "routes": ["Three Passes", "EBC", "EBC with Gokyo", "Pikey Peak"] },
      { "name": "Langtang", "routes": ["Langtang Valley", "Gosainkunda", "Tamang Heritage", "Langtang Valley & Gosainkunda"] },
      { "name": "Kanchenjunga", "routes": ["Kanchenjunga Base Camp"] },
      { "name": "Manaslu", "routes": ["Manaslu Circuit", "Manaslu with Tsum Valley", "Tsum Valley"] },
      { "name": "Rolwaling", "routes": [] }
    ],
    "insuranceCompanies": ["Clal", "Passport Card", "Harel", "Migdal", "Menora", "AIG", "Pheonix", "Yashir", "Other"],
    "genders": ["Male", "Female", "LGBTQIA+"]
  }
}
```

Send `regions[].name` as `trekkingRegion` and a string from `regions[].routes` as `trekkingRoute`. Rolwaling has no routes. Stored records may contain older values that are not in this list. Filters still match those values.

## Record fields

Responses include passport numbers, email, WhatsApp, the raw MRZ line, notes, and document image URLs.

| Field | Meaning |
| --- | --- |
| `_id` | 24-character hex id. |
| `fullName` | Display name. |
| `firstName`, `lastName` | Name parts. |
| `surname`, `givenNames`, `sex` | Older fields. Prefer `lastName`, `firstName`, and `gender`. |
| `nationality` | Free text. |
| `dateOfBirth`, `passportExpiry`, `bookingDate`, `departureDate`, `endDate` | ISO dates, or absent. |
| `gender` | Often `Male`, `Female`, or `LGBTQIA+`. |
| `passportNumber`, `idNumber`, `issuingCountry`, `documentType` | Identity document fields. |
| `trekkingArea` | Older combined area string. Prefer `trekkingRegion` and `trekkingRoute`. |
| `trekkingRegion`, `trekkingRoute` | Trek. |
| `endDateSource` | `calculated` or `manual`. |
| `package` | `{ _id, name, duration, durationDays }` or null. |
| `guideAssignment` | `{ _id, member, startDate, endDate, status, travelerRecords, shareKey }` or null. `member` is `{ _id, name, image, isDeleted }`. |
| `insurancePolicyNumber`, `insuranceCompany`, `insuranceCompanyOther` | Insurance. |
| `whatsappNumber`, `email`, `porterGuideName` | Contact. |
| `mrzRaw` | Machine-readable zone text from a passport scan. |
| `notes` | Free text. |
| `scannedBy` | User id, or absent. |
| `documents` | Array. See below. |
| `jotform` | `{ status, submissionId, syncedAt, error }`. `status` is `imported`, `synced`, or `failed`. Absent when the record is not in JotForm. |
| `createdAt`, `updatedAt` | ISO timestamps. |

Each document:

| Field | Meaning |
| --- | --- |
| `_id` | Document id. |
| `kind` | `passport_bio`, `id_front`, `id_back`, `visa`, or `other`. |
| `imageUrl` | Cloudinary URL of the scan. |
| `publicId` | Cloudinary id. |
| `source` | `webfxscan` or `upload`. |
| `deviceModel`, `capturedAt`, `mimeType`, `fileSize` | Optional capture details. |
