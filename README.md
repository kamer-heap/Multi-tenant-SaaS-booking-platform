# Multi-Tenant SaaS Booking Platform

A multi-tenant B2B SaaS booking platform built for the Parallax Labs Full-Stack Developer Internship (Track B). Each organization (tenant) gets its own isolated data, enforced at the database level with PostgreSQL Row-Level Security.       

## Week 1 Status: Architecture & Multi-Tenant Schema  

- [x] Next.js (TypeScript, App Router) + Tailwind CSS project
- [x] `.env` validation with Zod
- [x] Docker Compose for PostgreSQL (plus Mailpit for local emails)
- [x] Multi-tenant schema (tenants, users, roles, bookings), migration runner and seed data
- [x] Tenant-isolated booking APIs with validation, idempotency, overlap protection and standard errors
- [x] Tenant data isolation with PostgreSQL RLS, plus an automated isolation test
- [ ] Auth UI: Organization Onboarding, Login, Register, Password Reset (in progress)

## Tech Stack

Next.js, TypeScript, Tailwind CSS, Zod, PostgreSQL 16, Docker Compose, node-postgres (`pg`), bcryptjs, Mailpit

## Database Schema (ERD)

```mermaid
erDiagram
    TENANTS ||--o{ USERS : "has"
    TENANTS ||--o{ BOOKINGS : "owns"
    ROLES ||--o{ USERS : "assigned to"
    USERS ||--o{ BOOKINGS : "creates"

    TENANTS {
        uuid id PK
        text name
        text slug UK
        timestamptz created_at
    }
    ROLES {
        smallint id PK
        text name UK
    }
    USERS {
        uuid id PK
        uuid tenant_id FK
        text email
        text password_hash
        text full_name
        smallint role_id FK
        timestamptz created_at
    }
    BOOKINGS {
        uuid id PK
        uuid tenant_id FK
        uuid created_by FK
        text title
        text client_name
        text client_email
        timestamptz starts_at
        timestamptz ends_at
        text status
        text notes
        timestamptz created_at
    }
```

## Tenant Isolation

Isolation is enforced by the database, not by application code, so a bug in an API route cannot leak data between tenants.

- `tenants`, `users` and `bookings` all have Row-Level Security **enabled and forced**.
- Every policy compares the row's tenant to `current_tenant_id()`, which reads the `app.current_tenant` setting.
- The app connects as `app_user`, a limited role (not a superuser, no `BYPASSRLS`). Superusers and table owners bypass RLS, so this separation is essential.
- For each request, the app starts a transaction and runs `set_config('app.current_tenant', <tenant id>, true)`, which applies only to that transaction.
- If no tenant is set, the function returns NULL and **zero rows** are visible (safe by default).
- `resolve_tenant(slug)` is a small `SECURITY DEFINER` function that lets login find a tenant by its slug before a tenant is selected.

### Isolation proof

`npm run test:rls` connects as `app_user` and checks that each tenant sees only its own bookings, that no tenant means no rows, and that cross-tenant deletes and inserts are blocked.

## Booking API

Booking routes are available at `/api/bookings` and `/api/bookings/:id`. They resolve the tenant
from the signed `session` cookie or the tenant subdomain (an `x-tenant-slug` header is useful
for local development), and set the RLS tenant context inside every database transaction.
`POST /api/bookings` requires an `Idempotency-Key` header. Date filters use ISO-8601 `from` and
`to` query parameters. Errors use `{ error: { code, message, details?, requestId } }`.

![RLS isolation test output](docs/rls-test.png)

## Getting Started

**Requirements:** Node.js 20+, Docker Desktop

```bash
git clone https://github.com/kamer-heap/Multi-tenant-SaaS-booking-platform.git
cd Multi-tenant-SaaS-booking-platform
npm install
```

Create the env file (`copy .env.example .env` on Windows, `cp .env.example .env` on macOS/Linux), then:

```bash
docker compose up -d      # PostgreSQL + Mailpit
npm run db:migrate        # create tables, roles and RLS policies
npm run db:seed           # 3 sample organizations
npm run test:rls          # verify tenant isolation
npm run dev               # http://localhost:3000
```

Mailpit (password-reset emails in development) runs at http://localhost:8025.

### Seed accounts

Password for all seed users: `Password123!`

| Organization | Slug | Example login |
|---|---|---|
| Glow Salon | `glow-salon` | `owner@glow-salon.test` |
| Bright Dental Clinic | `bright-dental` | `owner@bright-dental.test` |
| Peak Fitness Studio | `peak-fitness` | `owner@peak-fitness.test` |

Each organization also has `admin@` and `member@` users.

## Project Structure

```
db/migrations/   SQL migrations (001 schema, 002 RLS, 003 booking API constraints)
scripts/         migrate, seed and RLS test scripts
src/             Next.js app and Zod env validation
docker-compose.yml
```

## Approach

I used plain SQL migrations so the RLS policies are explicit and reviewable. The database enforces isolation, and an automated test proves it using the same limited role the application uses.

## Week 2: Booking Workflows & Dashboard

### What was built

- Booking CRUD API routes under `/api/bookings`.
- Shared Zod schemas for create and partial update validation.
- Tenant-aware transaction handling: every booking query sets `app.current_tenant` before reading or writing.
- Idempotent booking creation with a tenant-scoped `idempotency_keys` table.
- Race-safe overlap prevention with a PostgreSQL `tstzrange` exclusion constraint.
- Standard API errors with request IDs and stable error codes.
- Responsive `/dashboard/bookings` UI built with Tailwind CSS.
- List view (the default on mobile) and calendar view using React Big Calendar.
- Create/edit booking drawer using React Hook Form and the shared Zod schema.
- Booking detail drawer, delete confirmation, loading skeletons, search, and empty states.
- React Query data fetching and cache invalidation after mutations.
- Postman v2.1 collection at [`docs/postman_collection.json`](docs/postman_collection.json).

### Implementation approach

#### Zod validation

The API and frontend use the same schemas from `src/lib/schemas/booking.ts`. Required
fields are `title`, `clientName`, `clientEmail`, `startsAt`, and `endsAt`; `notes` is
optional. ISO-8601 datetimes are validated and both create and update requests enforce
`endsAt > startsAt`. API validation failures return field-level details that the
frontend maps back into React Hook Form.

#### Idempotency-key flow

`POST /api/bookings` requires an `Idempotency-Key` header. The request body is hashed
with SHA-256 and the tenant/key pair is protected by a unique constraint. The key
lookup, booking insert, and response storage run in one transaction:

1. Lock and look up the key within the current tenant.
2. If the key exists with the same request hash, return the stored response.
3. If the key exists with a different hash, return `422 IDEMPOTENCY_MISMATCH`.
4. Otherwise insert the booking and persist its response under the key.

The frontend generates `crypto.randomUUID()` once when the create form opens. Network
retries reuse that same key, so a retry cannot create a second booking.

```mermaid
sequenceDiagram
    participant UI as Booking form
    participant API as POST /api/bookings
    participant DB as PostgreSQL

    UI->>UI: Generate crypto.randomUUID()
    UI->>API: POST body + Idempotency-Key
    API->>DB: BEGIN
    API->>DB: Set app.current_tenant
    API->>DB: Lock and read tenant/key
    alt Key already exists, same request hash
        DB-->>API: Stored status and response body
        API->>DB: COMMIT
        API-->>UI: Stored response
    else New key
        API->>DB: Insert booking
        DB-->>API: Booking row
        API->>DB: Insert idempotency key and response
        API->>DB: COMMIT
        API-->>UI: 201 Created
    else Key exists with different hash
        DB-->>API: Existing request hash
        API->>DB: ROLLBACK
        API-->>UI: 422 IDEMPOTENCY_MISMATCH
    end
```

#### Overlap prevention

PostgreSQL enforces non-overlapping bookings per tenant using an exclusion constraint
on `tstzrange(starts_at, ends_at, '[)')`. Half-open ranges allow a booking ending at
10:00 to be followed by another booking starting at 10:00. Constraint violations are
translated into a `409 CONFLICT` response.

#### Error schema

Every API error follows this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid booking data.",
    "details": [],
    "requestId": "6a7f6b65-c1f5-4de2-8a47-04e3ad0fd9cc"
  }
}
```

| Code | HTTP status | Usage |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Invalid JSON, query parameters, IDs, or booking fields |
| `UNAUTHORIZED` | 401 | Missing or invalid tenant session/context |
| `NOT_FOUND` | 404 | Booking does not exist in the current tenant |
| `CONFLICT` | 409 | Booking overlaps an existing booking |
| `IDEMPOTENCY_MISMATCH` | 422 | Existing idempotency key was reused with another body |
| `INTERNAL` | 500 | Unexpected server error |

#### Frontend retry strategy

The API client retries network failures and server errors up to three total attempts,
using exponential backoff (`250ms`, `500ms`, then `1s`). Client errors (`4xx`) are
never retried. Create requests pass the same idempotency key on every attempt. All API
errors also produce a Sonner toast, while `VALIDATION_ERROR` details are shown inline
beside the affected form fields.

### Week 2 API endpoints

| Method | Endpoint | Description | Request details |
|---|---|---|---|
| `GET` | `/api/bookings` | List tenant bookings | Optional ISO-8601 `from` and `to` filters |
| `POST` | `/api/bookings` | Create a booking | JSON body plus required `Idempotency-Key` |
| `GET` | `/api/bookings/:id` | Get one booking | UUID path parameter |
| `PATCH` | `/api/bookings/:id` | Partially update a booking | JSON body with one or more booking fields |
| `DELETE` | `/api/bookings/:id` | Delete a booking | UUID path parameter |

### Run Week 2 locally

1. Start PostgreSQL and Mailpit:

   ```bash
   docker compose up -d
   ```

2. Create `.env` from `.env.example` and set the required values:

   ```dotenv
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/saas
   APP_DATABASE_URL=postgres://app_user:app_password@localhost:5432/saas
   AUTH_SECRET=replace-with-at-least-32-random-characters
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   SMTP_HOST=localhost
   SMTP_PORT=1025
   ```

3. Install dependencies, apply migrations, and seed the sample tenants:

   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. Start the application:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000/dashboard/bookings](http://localhost:3000/dashboard/bookings).

### Import the Postman collection

1. Open Postman and select **Import**.
2. Choose [`docs/postman_collection.json`](docs/postman_collection.json).
3. Select the imported **Parallax Booking API** collection.
4. Set the `baseUrl` variable to `http://localhost:3000`.
5. Set `token` if your authentication flow requires a bearer token.
6. Run **Create booking** first; its `Idempotency-Key` uses Postman's `{{$guid}}`
   dynamic variable.
7. Copy the returned booking ID into the collection's `bookingId` variable before
   running the detail, update, or delete requests.

### Week 2 screenshots

> Replace these placeholders with captured project screenshots.

![Bookings list view](docs/screenshots/week-2-bookings-list.png)

![Bookings calendar view](docs/screenshots/week-2-bookings-calendar.png)

![Create booking drawer](docs/screenshots/week-2-create-booking.png)

![Postman booking API collection](docs/screenshots/week-2-postman.png)
