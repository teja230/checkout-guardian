# Checkout Guardian

AI-powered checkout failure detection and triage. Built for the Amazon Nova AI Hackathon.

**Checkout Guardian** runs e-commerce checkout flows in a real browser using **Amazon Nova Act**, detects failures, captures evidence (screenshots, console errors, network failures), and generates developer-ready triage reports using **Amazon Nova 2 Lite**.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Next.js    │────▶│  Express API │────▶│ Python Worker│
│   Frontend   │◀────│  (Node.js)  │     │  (Nova Act)  │
└─────────────┘     └──────┬──────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │  Postgres   │  Redis (pub/sub)
                    │  (runs, etc)│
                    └─────────────┘
```

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **API**: Express + TypeScript
- **Worker**: Python + Nova Act SDK
- **Database**: PostgreSQL 16
- **Queue/Cache**: Redis 7
- **AI**: Amazon Nova Act (browser automation) + Nova 2 Lite (failure analysis)

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Python 3.10+ (for Nova Act worker, optional for demo)

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL and Redis. The database schema is auto-applied on first boot.

### 2. Install and seed the API

```bash
cd api
npm install
npm run seed   # loads scenario definitions into Postgres
npm run dev    # starts API on port 3001
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev    # starts Next.js on port 3000
```

### 4. Open the app

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

## Nova Act Integration (Optional)

For live browser automation, set up the Python worker:

```bash
cd worker
pip install -r requirements.txt
export USE_NOVA_ACT=true
export AWS_REGION=us-east-1
python nova_act_runner.py
```

Without Nova Act, the API runs in simulated mode with realistic timing and generated screenshots.

## Nova 2 Lite Triage

When a run fails, the API calls **Amazon Nova 2 Lite** (`us.amazon.nova-2-lite-v1:0`) via AWS Bedrock Converse API to generate a structured triage report. The model receives:

- Scenario metadata and step definitions
- Full step trace (passed/failed/skipped)
- Console errors and network errors from the failing step
- Active seeded bug metadata

It returns structured JSON with root cause, confidence, repro steps, suggested fix, and a Jira-ready bug report.

**Requirements:**
- AWS credentials configured with Bedrock access (`aws configure` or env vars)
- The `us.amazon.nova-2-lite-v1:0` model enabled in your Bedrock console (us-east-1)
- Set `AWS_REGION` and optionally `NOVA_MODEL_ID` in your environment

If the Bedrock call fails (e.g., no credentials), it falls back to a basic triage built from the available failure artifacts.

## Project Structure

```
checkout-guardian/
├── frontend/          # Next.js app (pages, components, lib)
├── api/               # Express API (routes, services, models)
│   └── src/
│       ├── routes/    # scenarios, runs, artifacts
│       ├── services/  # runner, triage, screenshots
│       ├── db.ts      # Postgres client
│       └── redis.ts   # Redis client + pub/sub
├── worker/            # Python Nova Act worker
├── scenarios/         # JSON scenario definitions
├── artifacts/         # Screenshot storage (gitignored)
├── db/migrations/     # SQL schema
└── docker-compose.yml # Postgres + Redis
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scenarios` | List all scenarios |
| GET | `/api/scenarios/:id` | Get scenario with steps |
| POST | `/api/runs` | Start a new run |
| GET | `/api/runs` | List recent runs |
| GET | `/api/runs/:id` | Get run with steps + triage |
| GET | `/api/runs/:id/stream` | SSE live updates |
| GET | `/api/artifacts/screenshots/:file` | Serve screenshot |
