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

| Scenario              | Bug                    | Category                      | Severity |
|-----------------------|------------------------|-------------------------------|----------|
| Standard Checkout     | None (happy path)      | —                             | —        |
| Promo Code Disappears | State key mismatch     | promotion_state_bug           | High     |
| ZIP Code Validation   | Leading-zero rejection | address_validation_bug        | Critical |
| Pickup Shipping Fee   | Condition mismatch     | pricing_mismatch              | High     |
| Inventory Mismatch    | Stale cache            | inventory_reservation_failure | High     |
| Payment Timeout       | Gateway 504            | payment_gateway_timeout       | Critical |

## Seeded Bugs

Each bug is a realistic checkout failure that can be toggled on/off per run:

1. **Promo code state mismatch** — Cart stores discount as `promoCode`, payment reads `couponCode`
2. **ZIP leading-zero rejection** — `parseInt('01103')` → `1103` → fails 5-digit check
3. **Pickup still charges shipping** — Fee removal only checks `free_shipping`, not `pickup`
4. **Stale inventory cache** — 5-min Redis cache shows stock, but real inventory is 0
5. **Payment gateway 504** — Gateway timeout at 30s matches client timeout exactly

## Setting Up Amazon Nova

The app uses two Amazon Nova models. Both are optional — the app runs fully without them using simulation and fallback triage.

### Nova 2 Lite (AI Triage Reports)

Nova 2 Lite analyzes failed checkout runs and generates structured triage reports with root cause, confidence scores, repro steps, and Jira-ready bug reports.

#### Step 1: Configure AWS credentials

If you already have the AWS CLI configured, you're set. Otherwise:

```bash
# Option A: Use AWS CLI (recommended)
aws configure
# Enter your Access Key ID, Secret Access Key, and set region to us-east-1

# Option B: Set environment variables directly
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_REGION=us-east-1
```

Your IAM user/role needs the `bedrock:InvokeModel` permission. Minimal IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/us.amazon.nova-2-lite-v1:0"
    }
  ]
}
```

#### Step 2: Enable the model in Bedrock

1. Open the [AWS Bedrock console](https://console.aws.amazon.com/bedrock/) in **us-east-1**
2. Go to **Model access** in the left sidebar
3. Click **Manage model access**
4. Find **Amazon Nova 2 Lite** (`us.amazon.nova-2-lite-v1:0`) and enable it
5. Wait for the status to show **Access granted** (usually instant)

#### Step 3: Set environment variables

Add to your `.env` file (or export in your shell):

```bash
AWS_REGION=us-east-1
NOVA_MODEL_ID=us.amazon.nova-2-lite-v1:0   # this is the default, only change if using a different model
```

#### Verify it works

Start a run with a bug enabled. When it fails, check the API logs for:
```
[Triage] Calling Nova 2 Lite (us.amazon.nova-2-lite-v1:0) for run ...
[Triage] Nova 2 Lite response received (... chars)
[Triage] Parsed successfully: promotion_state_bug (confidence: 0.92)
```

If you see `[Triage] Nova 2 Lite call failed: ...` followed by `Falling back to generic triage`, check your credentials and model access.

**Without Nova 2 Lite:** The app falls back to template-based triage built from the seeded bug metadata and failure artifacts. The triage report will still show root cause, repro steps, and a Jira payload — just without AI-generated analysis.

### Nova Act (Live Browser Automation)

Nova Act drives a real browser through the checkout steps instead of using simulated screenshots. This requires three components: the test storefront, the Python worker, and the API in live mode.

#### Step 1: Start the test storefront

The storefront is a standalone Express app that serves a real e-commerce checkout flow. Bugs are toggled via query parameters — when the worker opens the storefront with `?bugs=zip_leading_zero`, the pages exhibit that bug's behavior (validation errors, console errors, failed API calls).

```bash
cd storefront
npm install
npm start    # starts on http://localhost:3002
```

You can test it manually: visit `http://localhost:3002?bugs=zip_leading_zero` and try entering ZIP code `01103` on the shipping page — it will fail validation due to the `parseInt` leading-zero bug.

#### Step 2: Install the Python worker

```bash
cd worker
python3 -m venv venv
source venv/bin/activate    # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

#### Step 3: Configure environment

```bash
# In the worker shell:
export USE_NOVA_ACT=true
export AWS_REGION=us-east-1
export STOREFRONT_URL=http://localhost:3002   # default

# In the API shell (or .env):
export USE_LIVE_WORKER=true   # routes runs to the Python worker instead of simulating
```

Follow the [Nova Act SDK documentation](https://docs.aws.amazon.com/nova-act/) for API key setup.

#### Step 4: Run the worker

```bash
cd worker
source venv/bin/activate
python nova_act_runner.py
```

The worker polls a Redis queue for run jobs. When you start a run via the UI, the Express API pushes the job to Redis, and the worker:
1. Opens the storefront with the active bugs as query params
2. Executes each scenario step using Nova Act's natural-language instructions (e.g., "Type 'SAVE20' into the promo code field and click 'Apply'")
3. Captures real PNG screenshots after each step
4. Collects console errors and network failures from the browser
5. Publishes live progress updates via Redis pub/sub (the dashboard updates in real-time)
6. On failure, calls Nova 2 Lite for AI triage

#### How the bugs work in the storefront

| Bug ID                  | Page     | What happens                                                                                                          |
|-------------------------|----------|-----------------------------------------------------------------------------------------------------------------------|
| `promo_key_mismatch`    | Review   | Cart stores discount as `promoCode`, review page reads `couponCode` — discount silently drops, console logs TypeError |
| `zip_leading_zero`      | Shipping | Server-side `parseInt('01103')` strips leading zero, fails 5-digit validation                                         |
| `pickup_shipping_fee`   | Review   | Shipping fee check only matches `free_shipping`, not `pickup` — $5.99 fee stays                                       |
| `inventory_stale_cache` | Review   | `/api/inventory/reserve` returns 409 Conflict, shows out-of-stock error                                               |
| `payment_504`           | Review   | `/api/payments/charge` delays 5s then returns 504 gateway timeout                                                     |

**Without Nova Act:** The API handles execution in simulated mode with realistic timing (1.5–3.5s per step) and generates SVG mockup screenshots that look like real checkout pages. This is the default behavior and is fully functional for demos.

## Screenshots

![Home Page](Home%20Page.png)
![Sample Run](Sample%20Run.png)

## Project Structure

```
checkout-guardian/
├── frontend/          # Next.js dashboard (runs, triage, scenarios)
├── api/               # Express API (routes, services, models)
│   └── src/
│       ├── routes/    # scenarios, runs, artifacts
│       ├── services/  # runner, triage, screenshots
│       ├── db.ts      # Postgres connection pool
│       ├── redis.ts   # Redis client + pub/sub + job queue
│       ├── seed.ts    # Scenario seeder
│       └── seed-demos.ts  # Demo run seeder
├── storefront/        # Test e-commerce site (Nova Act target)
│   ├── server.js      # Express app on port 3002
│   └── views/         # EJS templates (product, cart, shipping, payment, review)
├── worker/            # Python Nova Act worker
│   └── nova_act_runner.py  # Drives browser, captures evidence
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
