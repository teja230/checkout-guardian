# Checkout Guardian

AI-powered checkout failure detection and triage. Built for the Amazon Nova AI Hackathon.

**Checkout Guardian** runs e-commerce checkout flows in a real browser using **Amazon Nova Act**, detects failures, captures evidence (screenshots, console errors, network failures), and generates developer-ready triage reports using **Amazon Nova 2 Lite**.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Next.js   │────▶│  Express API│────▶│ Python Worker│
│   Frontend  │◀────│  (Node.js)  │     │  (Nova Act)  │
└─────────────┘     └──────┬──────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │  Postgres   │  Redis (pub/sub)
                    │  (runs, etc)│
                    └─────────────┘
```

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **API**: Express + TypeScript
- **Worker**: Python + Nova Act SDK (optional)
- **Database**: PostgreSQL 16
- **Queue/Cache**: Redis 7
- **AI**: Amazon Nova Act (browser automation) + Nova 2 Lite (failure analysis via AWS Bedrock)

## Prerequisites

- **Node.js 18+** and **npm**
- **Docker & Docker Compose** (for PostgreSQL and Redis)
- **Python 3.10+** (only if using Nova Act live browser automation)
- **AWS credentials** (only if using Nova 2 Lite for AI triage — falls back to template-based triage without them)

## Quick Start

### 1. Clone and configure environment

```bash
git clone <repo-url> && cd checkout-guardian
cp .env.example .env
```

The defaults in `.env.example` match the Docker Compose config, so no edits are needed for local development.

### 2. Start PostgreSQL and Redis

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on port `5432` (database: `checkout_guardian`, user: `guardian`, password: `guardian_dev`)
- **Redis 7** on port `6379`

The database schema (`db/migrations/001_init.sql`) is auto-applied on first boot via Docker's `initdb.d` mechanism.

> **Note:** If you need to reset the database (e.g., schema changes), run:
> ```bash
> docker compose down -v && docker compose up -d
> ```
> The `-v` flag removes the persistent volume, so the schema is re-applied on next start.

### 3. Install dependencies and seed the database

```bash
# API
cd api
npm install
npm run seed        # loads scenario definitions from scenarios/*.json into Postgres

# Frontend
cd ../frontend
npm install
```

### 4. (Optional) Seed demo runs

To populate the app with pre-built sample runs for each bug scenario (so the landing page links to real results):

```bash
cd api
npm run seed:demos
```

This creates a completed run for each seeded bug, generating screenshots and triage reports. Requires PostgreSQL and Redis to be running.

### 5. Start the API

```bash
cd api
npm run dev    # starts Express API on http://localhost:3001
```

### 6. Start the frontend

In a separate terminal:

```bash
cd frontend
npm run dev    # starts Next.js on http://localhost:3000
```

### 7. Open the app

Visit [http://localhost:3000](http://localhost:3000)

## Demo Flow

1. Click **"Run Demo Scenario"** on the landing page
2. Select a scenario (e.g., "Promo Code Disappears at Payment")
3. Toggle the seeded bug ON
4. Click **"Run Scenario"**
5. Watch the live step timeline and browser screenshots
6. When the run fails, click **"View Triage Report"**
7. See root cause, confidence score, repro steps, and a Jira-ready bug report
8. Click **"Copy Jira Payload"** to get structured JSON for ticket creation

If you ran `npm run seed:demos`, the landing page bug catalog cards link directly to pre-existing sample runs.

## Scenarios

| Scenario | Bug | Category | Severity |
|----------|-----|----------|----------|
| Standard Checkout | None (happy path) | — | — |
| Promo Code Disappears | State key mismatch | promotion_state_bug | High |
| ZIP Code Validation | Leading-zero rejection | address_validation_bug | Critical |
| Pickup Shipping Fee | Condition mismatch | pricing_mismatch | High |
| Inventory Mismatch | Stale cache | inventory_reservation_failure | High |
| Payment Timeout | Gateway 504 | payment_gateway_timeout | Critical |

## Seeded Bugs

Each bug is a realistic checkout failure that can be toggled on/off per run:

1. **Promo code state mismatch** — Cart stores discount as `promoCode`, payment reads `couponCode`
2. **ZIP leading-zero rejection** — `parseInt('01103')` → `1103` → fails 5-digit check
3. **Pickup still charges shipping** — Fee removal only checks `free_shipping`, not `pickup`
4. **Stale inventory cache** — 5-min Redis cache shows stock, but real inventory is 0
5. **Payment gateway 504** — Gateway timeout at 30s matches client timeout exactly

## AWS / Nova 2 Lite Triage

When a run fails, the API calls **Amazon Nova 2 Lite** (`us.amazon.nova-2-lite-v1:0`) via AWS Bedrock Converse API to generate a structured triage report. The model receives:

- Scenario metadata and step definitions
- Full step trace (passed/failed/skipped)
- Console errors and network errors from the failing step
- Active seeded bug metadata

It returns structured JSON with root cause, confidence, repro steps, suggested fix, and a Jira-ready bug report.

**Requirements:**
- AWS credentials configured with Bedrock access (`aws configure` or env vars `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)
- The `us.amazon.nova-2-lite-v1:0` model enabled in your Bedrock console (us-east-1)
- Set `AWS_REGION` and optionally `NOVA_MODEL_ID` in your `.env`

If the Bedrock call fails (e.g., no credentials), it falls back to a template-based triage built from the available failure artifacts. The app is fully functional without AWS credentials.

## Nova Act Integration (Optional)

For live browser automation instead of simulated runs, set up the Python worker:

```bash
cd worker
pip install -r requirements.txt
export USE_NOVA_ACT=true
export AWS_REGION=us-east-1
python nova_act_runner.py
```

Without Nova Act, the API runs in simulated mode with realistic timing and generated SVG screenshots.

## Screenshots

![Home Page](Home%20Page.png)
![Sample Run](Sample%20Run.png)

## Project Structure

```
checkout-guardian/
├── frontend/          # Next.js app (pages, components, API client)
├── api/               # Express API (routes, services, models)
│   └── src/
│       ├── routes/    # scenarios, runs, artifacts
│       ├── services/  # runner, triage, screenshots
│       ├── db.ts      # Postgres connection pool
│       ├── redis.ts   # Redis client + pub/sub
│       ├── seed.ts    # Scenario seeder
│       └── seed-demos.ts  # Demo run seeder
├── worker/            # Python Nova Act worker (optional)
├── scenarios/         # JSON scenario definitions
├── artifacts/         # Screenshot storage (gitignored)
├── db/migrations/     # SQL schema (auto-applied by Docker)
├── docker-compose.yml # PostgreSQL 16 + Redis 7
└── .env.example       # Environment variable template
```

## API Endpoints

| Method | Path                               | Description                 |
|--------|------------------------------------|-----------------------------|
| GET    | `/api/health`                      | Health check                |
| GET    | `/api/scenarios`                   | List all scenarios          |
| GET    | `/api/scenarios/:id`               | Get scenario with steps     |
| POST   | `/api/runs`                        | Start a new run             |
| GET    | `/api/runs`                        | List recent runs            |
| GET    | `/api/runs/:id`                    | Get run with steps + triage |
| GET    | `/api/runs/:id/stream`             | SSE live updates            |
| GET    | `/api/artifacts/screenshots/:file` | Serve screenshot            |
| GET    | `/api/artifacts/runs/:runId`       | List artifacts for a run    |

## Troubleshooting

| Problem                                      | Solution                                                                              |
|----------------------------------------------|---------------------------------------------------------------------------------------|
| `ECONNREFUSED` on port 5432/6379             | Run `docker compose up -d` to start Postgres and Redis                                |
| "No scenarios found" when seeding demos      | Run `npm run seed` before `npm run seed:demos`                                        |
| Schema not applied after changes             | Run `docker compose down -v && docker compose up -d` to reset the database            |
| Triage shows template instead of AI analysis | Configure AWS credentials and enable Nova 2 Lite in Bedrock console                   |
| Frontend can't reach API                     | Ensure `NEXT_PUBLIC_API_URL=http://localhost:3001` is set (default in `.env.example`) |
