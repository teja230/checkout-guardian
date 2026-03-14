import { query } from "../db";
import { publishRunUpdate } from "../redis";
import { generateTriage } from "./triage";
import { captureScreenshot, ScreenshotContext } from "./screenshots";

// Simulated step execution delays (ms) for demo realism
const STEP_DELAY_MIN = 1500;
const STEP_DELAY_MAX = 3500;

function randomDelay() {
  return (
    Math.floor(Math.random() * (STEP_DELAY_MAX - STEP_DELAY_MIN)) +
    STEP_DELAY_MIN
  );
}

// Simulated console errors per bug type
const BUG_CONSOLE_ERRORS: Record<string, string[]> = {
  promo_key_mismatch: [
    "TypeError: Cannot read properties of undefined (reading 'discountAmount')",
    "Warning: couponCode is undefined in PaymentContext",
  ],
  zip_leading_zero: [
    "ValidationError: ZIP code must be 5 digits, got 4",
    "Error: Address validation failed for field 'postalCode'",
  ],
  pickup_shipping_fee: [
    "Warning: ShippingCalculator received deliveryMethod='pickup' but no handler matched",
  ],
  inventory_stale_cache: [
    "Error: POST /api/inventory/reserve returned 409 Conflict",
    '{"error":"insufficient_stock","requested":1,"available":0}',
  ],
  payment_504: [
    "Error: POST /api/payments/charge failed with status 504",
    "TimeoutError: Payment gateway did not respond within 30000ms",
  ],
};

// Simulated network errors per bug type
const BUG_NETWORK_ERRORS: Record<string, any[]> = {
  promo_key_mismatch: [],
  zip_leading_zero: [
    {
      url: "/api/address/validate",
      method: "POST",
      status: 422,
      body: { error: "invalid_zip", message: "ZIP must be 5 digits" },
    },
  ],
  pickup_shipping_fee: [],
  inventory_stale_cache: [
    {
      url: "/api/inventory/reserve",
      method: "POST",
      status: 409,
      body: {
        error: "insufficient_stock",
        requested: 1,
        available: 0,
        sku: "MECH-KB-001",
      },
    },
  ],
  payment_504: [
    {
      url: "/api/payments/charge",
      method: "POST",
      status: 504,
      body: { error: "gateway_timeout" },
      duration_ms: 30000,
    },
  ],
};

export async function runScenario(
  runId: string,
  scenario: any,
  activeBugs: string[]
) {
  // Mark run as started
  await query("UPDATE runs SET status = 'running', started_at = NOW() WHERE id = $1", [runId]);
  await publishRunUpdate(runId, { type: "run_status", status: "running" });

  const steps = scenario.steps as any[];
  const seededBugs = (scenario.seeded_bugs || []) as any[];
  let failed = false;
  let failedStepIndex = -1;

  for (const step of steps) {
    if (failed) {
      // Skip remaining steps after failure
      await query(
        "UPDATE run_steps SET status = 'skipped' WHERE run_id = $1 AND step_index = $2",
        [runId, step.index]
      );
      await publishRunUpdate(runId, {
        type: "step_update",
        stepIndex: step.index,
        status: "skipped",
      });
      continue;
    }

    // Mark step as running
    await query(
      "UPDATE run_steps SET status = 'running', started_at = NOW() WHERE run_id = $1 AND step_index = $2",
      [runId, step.index]
    );
    await publishRunUpdate(runId, {
      type: "step_update",
      stepIndex: step.index,
      status: "running",
      name: step.name,
    });

    // Simulate execution time
    await new Promise((r) => setTimeout(r, randomDelay()));

    // Check if any active bug triggers on this step
    const triggeringBug = seededBugs.find(
      (bug: any) =>
        activeBugs.includes(bug.id) && bug.trigger_step === step.index
    );

    // Build screenshot context with step's final status so the render is accurate
    const stepStatus = triggeringBug ? "failed" : "passed";
    const screenshotCtx: ScreenshotContext = {
      runId,
      stepIndex: step.index,
      stepName: step.name,
      action: step.action || "unknown",
      status: stepStatus,
      scenarioId: scenario.id,
      failureDetail: triggeringBug?.description,
    };
    const screenshotPath = await captureScreenshot(screenshotCtx);

    if (triggeringBug) {
      // This step fails due to the seeded bug
      const consoleErrors = BUG_CONSOLE_ERRORS[triggeringBug.id] || [];
      const networkErrors = BUG_NETWORK_ERRORS[triggeringBug.id] || [];

      await query(
        `UPDATE run_steps SET
          status = 'failed',
          screenshot_path = $3,
          console_errors = $4,
          network_errors = $5,
          detail = $6,
          finished_at = NOW()
         WHERE run_id = $1 AND step_index = $2`,
        [
          runId,
          step.index,
          screenshotPath,
          JSON.stringify(consoleErrors),
          JSON.stringify(networkErrors),
          `Failed: ${triggeringBug.description}`,
        ]
      );

      await publishRunUpdate(runId, {
        type: "step_update",
        stepIndex: step.index,
        status: "failed",
        name: step.name,
        detail: triggeringBug.description,
        consoleErrors,
        networkErrors,
        screenshotPath,
      });

      failed = true;
      failedStepIndex = step.index;
    } else {
      // Step passes
      await query(
        `UPDATE run_steps SET
          status = 'passed',
          screenshot_path = $3,
          finished_at = NOW()
         WHERE run_id = $1 AND step_index = $2`,
        [runId, step.index, screenshotPath]
      );

      await publishRunUpdate(runId, {
        type: "step_update",
        stepIndex: step.index,
        status: "passed",
        name: step.name,
        screenshotPath,
      });
    }
  }

  if (failed) {
    await query(
      "UPDATE runs SET status = 'failed', finished_at = NOW() WHERE id = $1",
      [runId]
    );
    await publishRunUpdate(runId, { type: "run_status", status: "failed" });

    // Generate triage report
    const triage = await generateTriage(runId, scenario, activeBugs, failedStepIndex);
    await publishRunUpdate(runId, { type: "triage_ready", triage });
  } else {
    await query(
      "UPDATE runs SET status = 'passed', finished_at = NOW() WHERE id = $1",
      [runId]
    );
    await publishRunUpdate(runId, { type: "run_status", status: "passed" });
  }
}
