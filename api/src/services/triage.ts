import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConversationRole,
} from "@aws-sdk/client-bedrock-runtime";
import { query } from "../db";

const NOVA_MODEL_ID = process.env.NOVA_MODEL_ID || "us.amazon.nova-2-lite-v1:0";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const bedrock = new BedrockRuntimeClient({ region: AWS_REGION });

const SYSTEM_PROMPT = `You are a checkout failure triage agent.

Your job is to analyze a failed e-commerce checkout run and produce a concise, developer-useful diagnosis.

You will receive:
- scenario metadata (name, description, steps)
- the ordered step trace showing which steps passed and which failed
- details about the failing step including console errors and network errors
- information about which seeded bug was active

Return ONLY valid JSON (no markdown, no code fences) with exactly these keys:
- failure_category: one of promotion_state_bug, payment_gateway_timeout, address_validation_bug, pricing_mismatch, inventory_reservation_failure, frontend_state_regression, or a descriptive slug
- root_cause: specific technical explanation of what went wrong (2-4 sentences)
- confidence: float 0.0–1.0 for how confident you are
- repro_steps: array of ordered, actionable strings a developer can follow
- suggested_fix: concise developer-friendly fix (1-3 sentences, reference file names and line numbers if possible)
- jira_title: under 90 characters
- jira_description: under 1200 characters, markdown formatted with Summary, Root Cause, Impact, Steps to Reproduce, Expected, Actual, Suggested Fix, Severity sections
- severity: one of critical, high, medium, low

Rules:
- Be specific, not generic
- Prefer the simplest explanation supported by the evidence
- Repro steps must be ordered and actionable
- Keep jira_title under 90 characters
- Keep jira_description under 1200 characters`;

function buildTriagePrompt(
  scenario: any,
  stepsTrace: any[],
  failedStep: any,
  activeBugs: string[],
  seededBugs: any[]
): string {
  const activeBugDetails = seededBugs.filter((b: any) =>
    activeBugs.includes(b.id)
  );

  return `Analyze this failed checkout scenario run:

## Scenario
- Name: ${scenario.name}
- Description: ${scenario.description}

## Step Trace
${stepsTrace
  .map(
    (s: any) =>
      `Step ${s.step_index}: "${s.name}" → ${s.status}${s.detail ? ` (${s.detail})` : ""}`
  )
  .join("\n")}

## Failing Step Details
- Step Index: ${failedStep.step_index}
- Step Name: ${failedStep.name}
- Detail: ${failedStep.detail || "none"}
- Console Errors: ${JSON.stringify(failedStep.console_errors || [])}
- Network Errors: ${JSON.stringify(failedStep.network_errors || [])}

## Active Seeded Bug(s)
${
  activeBugDetails.length > 0
    ? activeBugDetails
        .map(
          (b: any) =>
            `- ID: ${b.id}\n  Name: ${b.name}\n  Description: ${b.description}\n  Failure Type: ${b.failure_type}\n  Trigger Step: ${b.trigger_step}`
        )
        .join("\n")
    : "None"
}

Return your triage as valid JSON.`;
}

function parseTriageResponse(text: string): any {
  // Strip markdown code fences if the model wraps the response
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

export async function generateTriage(
  runId: string,
  scenario: any,
  activeBugs: string[],
  failedStepIndex: number
): Promise<any> {
  const steps = await query(
    "SELECT * FROM run_steps WHERE run_id = $1 ORDER BY step_index",
    [runId]
  );

  const failedStep = steps.rows.find(
    (s: any) => s.step_index === failedStepIndex
  );

  const seededBugs = (scenario.seeded_bugs || []) as any[];

  const userPrompt = buildTriagePrompt(
    scenario,
    steps.rows,
    failedStep,
    activeBugs,
    seededBugs
  );

  let triage: any;

  try {
    console.log(`[Triage] Calling Nova 2 Lite (${NOVA_MODEL_ID}) for run ${runId}...`);

    const response = await bedrock.send(
      new ConverseCommand({
        modelId: NOVA_MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [
          {
            role: ConversationRole.USER,
            content: [{ text: userPrompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 1500,
          temperature: 0.2,
        },
      })
    );

    const outputText =
      response.output?.message?.content?.[0]?.text || "";

    console.log(`[Triage] Nova 2 Lite response received (${outputText.length} chars)`);

    triage = parseTriageResponse(outputText);

    // Validate required fields exist
    const requiredKeys = [
      "failure_category", "root_cause", "confidence",
      "repro_steps", "suggested_fix", "jira_title",
      "jira_description", "severity",
    ];
    for (const key of requiredKeys) {
      if (!(key in triage)) {
        throw new Error(`Missing required key in triage response: ${key}`);
      }
    }

    // Normalize confidence to float
    if (typeof triage.confidence === "string") {
      triage.confidence = parseFloat(triage.confidence);
    }

    // Ensure repro_steps is an array
    if (!Array.isArray(triage.repro_steps)) {
      triage.repro_steps = [triage.repro_steps];
    }

    console.log(`[Triage] Parsed successfully: ${triage.failure_category} (confidence: ${triage.confidence})`);
  } catch (err: any) {
    console.error(`[Triage] Nova 2 Lite call failed:`, err.message);
    console.error(`[Triage] Falling back to generic triage for run ${runId}`);

    // Fallback: produce a useful triage from the artifacts we have
    const triggeringBug = seededBugs.find(
      (b: any) => activeBugs.includes(b.id) && b.trigger_step === failedStepIndex
    );

    triage = {
      failure_category: triggeringBug?.failure_type || "unknown_failure",
      root_cause: triggeringBug
        ? `Seeded bug "${triggeringBug.name}" triggered at step ${failedStepIndex}: ${triggeringBug.description}`
        : `Step "${failedStep?.name}" failed unexpectedly. Console errors: ${JSON.stringify(failedStep?.console_errors || [])}`,
      confidence: triggeringBug ? 0.85 : 0.5,
      repro_steps: scenario.steps
        .slice(0, failedStepIndex + 1)
        .map((s: any) => `Step ${s.index}: ${s.name} — ${s.expected}`),
      suggested_fix: triggeringBug
        ? `Investigate the seeded bug condition: ${triggeringBug.description}`
        : "Review console errors and network logs for the failing step.",
      jira_title: triggeringBug
        ? `[Checkout] ${triggeringBug.name}`
        : `Checkout failure at step: ${failedStep?.name}`,
      jira_description: triggeringBug
        ? `**Summary:** ${scenario.name} failed at step ${failedStepIndex} (${failedStep?.name}).\n\n**Root Cause:** ${triggeringBug.description}\n\n**Console Errors:**\n${(failedStep?.console_errors || []).map((e: string) => `- ${e}`).join("\n")}\n\n**Network Errors:**\n${(failedStep?.network_errors || []).map((e: any) => `- ${e.method} ${e.url} → ${e.status}`).join("\n")}`
        : `Checkout scenario "${scenario.name}" failed at step ${failedStepIndex} (${failedStep?.name}). Further investigation required.\n\nConsole errors: ${JSON.stringify(failedStep?.console_errors || [])}`,
      severity: triggeringBug?.failure_type?.includes("payment") || triggeringBug?.failure_type?.includes("validation")
        ? "critical"
        : "high",
    };
  }

  // Persist triage report
  await query(
    `INSERT INTO triage_reports (run_id, failure_category, root_cause, confidence, repro_steps, suggested_fix, jira_title, jira_description, severity, raw_response)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      runId,
      triage.failure_category,
      triage.root_cause,
      triage.confidence,
      JSON.stringify(triage.repro_steps),
      triage.suggested_fix,
      triage.jira_title,
      triage.jira_description,
      triage.severity,
      JSON.stringify(triage),
    ]
  );

  return triage;
}
