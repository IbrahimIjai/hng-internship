# Name Gender Classifier API

Classifies names by predicted gender using the [Genderize.io](https://genderize.io) API. Built with NestJS.

## Endpoint

```
GET /api/classify?name={name}
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "name": "john",
    "gender": "male",
    "probability": 0.99,
    "sample_size": 1234,
    "is_confident": true,
    "processed_at": "2026-04-15T12:00:00.000Z"
  }
}
```

## Setup

```bash
pnpm install
pnpm start:dev
```