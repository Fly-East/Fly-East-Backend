# Gear API

Manage required gear for a package. Gears are stored in the `Gear` collection and linked from packages through the `gearInfo` array; package responses populated via `populatePackage` include sorted gear items automatically.

## Data model
- `title` (string, required)
- `description` (string, optional)
- `package` (ObjectId, required)
- `isActive` (boolean, default `true`)
- `sortOrder` (number, default `0`)
- Timestamps: `createdAt`, `updatedAt`

## Endpoints
- `POST /api/v1/gears/:packageId` (admin + `create`)
  - Body: `title` (required), `description` (optional), `sortOrder` (optional; auto-increments within package when missing or `0`)
  - Creates gear, links it to the package, invalidates cached gear lists.
- `GET /api/v1/gears/package/:packageId` (admin)
  - Query: `page` (default `1`), `limit` (default `100`)
  - Returns paginated gear list for a package (cached for 1 hour).
- `GET /api/v1/gears/:id` (admin)
  - Returns a single gear by ID.
- `PUT /api/v1/gears/:id` (admin + `edit`)
  - Body: any updatable fields (`title`, `description`, `isActive`, `sortOrder`).
  - Updates gear and clears cached gear lists for its package.
- `DELETE /api/v1/gears/:id` (admin + `delete`)
  - Removes gear, unlinks it from the parent package, clears cached gear lists.

## Notes
- Package schema now holds `gearInfo: ObjectId[]`; gear IDs are pushed on create and pruned on delete.
- `populatePackage` includes `gearInfo` (sorted by `sortOrder`) so package fetches mirror itinerary behaviour.
- All write operations run in Mongo sessions/transactions and clear Redis cache entries under `gears:<packageId>:*`.
