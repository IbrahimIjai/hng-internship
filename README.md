# Queryable Intelligence Engine

NestJS + SQLite API for demographic profile storage and queryable retrieval. The API supports advanced filtering, combined conditions, sorting, pagination, and rule-based natural language search.

## Base Routes

`GET /api/profiles`

`GET /api/profiles/search?q=...`

`POST /api/profiles`

`GET /api/profiles/:id`

`DELETE /api/profiles/:id`

## Profiles Schema

The `profiles` table is stored with this shape:

- `id` - UUID v7 primary key
- `name` - unique full name
- `gender` - `male` or `female`
- `gender_probability` - float
- `age` - integer
- `age_group` - `child`, `teenager`, `adult`, `senior`
- `country_id` - ISO 3166-1 alpha-2 code
- `country_name` - full country name
- `country_probability` - float
- `created_at` - UTC ISO 8601 timestamp

## Setup

```bash
pnpm install
pnpm start:dev
```

The SQLite database lives at `.data/profiles.sqlite` by default. For tests or alternate environments, set `PROFILES_DB_PATH`.

## Seeding

The project includes an idempotent seed command. Re-running it updates existing rows by unique `name` and does not create duplicates.

Supported file formats:

- `.json` array of profile objects
- `.csv` with matching column headers

Run:

```bash
SEED_FILE=path/to/profiles.json pnpm seed:profiles
```

PowerShell:

```powershell
$env:SEED_FILE="path\to\profiles.json"
pnpm seed:profiles
```

If the source file omits `id`, `age_group`, `country_name`, or `created_at`, the seed script derives them.

## Query Parameters

### `GET /api/profiles`

Supported filters:

- `gender`
- `age_group`
- `country_id`
- `min_age`
- `max_age`
- `min_gender_probability`
- `min_country_probability`

Sorting:

- `sort_by=age|created_at|gender_probability`
- `order=asc|desc`

Pagination:

- `page` default `1`
- `limit` default `10`, max `50`

Example:

```text
/api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10
```

Response shape:

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": []
}
```

### `GET /api/profiles/search`

Rule-based parser only. No AI/LLM is used.

Examples:

- `young males from nigeria`
- `females above 30`
- `people from angola`
- `adult males from kenya`
- `male and female teenagers above 17`

Parser rules implemented:

- `young` => ages `16` to `24`
- gender keywords => `male` / `female`
- age group keywords => `child`, `teenager`, `adult`, `senior`
- `above`, `over`, `below`, `under`, `between`
- country name matching for African ISO country codes

If a query cannot be interpreted, the API returns:

```json
{
  "status": "error",
  "message": "Unable to interpret query"
}
```

## Validation and Errors

All errors follow:

```json
{
  "status": "error",
  "message": "<error message>"
}
```

Status codes:

- `400` missing or empty parameter
- `422` invalid parameter type or invalid query parameters
- `404` profile not found
- `500` / `502` server or downstream API failure

## Performance Notes

- Parameterized SQL queries avoid loading the full table into memory for filtering
- Indexed columns cover the main filter/sort fields
- Pagination uses `LIMIT` and `OFFSET`
- Natural language search reuses the same filtered SQL path as direct query parameters

## Test Commands

```bash
pnpm build
pnpm test:e2e
```
