import { Router } from "express";
import { query } from "../db";
import { publishRunUpdate } from "../redis";
import { runScenario } from "../services/runner";

const router = Router();

// Start a new run
router.post("/", async (req, res) => {
  const { scenarioId, activeBugs = [] } = req.body;

  // Verify scenario exists
  const scenario = await query("SELECT * FROM scenarios WHERE id = $1", [
    scenarioId,
  ]);
  if (scenario.rows.length === 0) {
    return res.status(404).json({ error: "Scenario not found" });
  }

  // Create run record
  const run = await query(
    `INSERT INTO runs (scenario_id, status, active_bugs)
     VALUES ($1, 'pending', $2)
     RETURNING *`,
    [scenarioId, JSON.stringify(activeBugs)]
  );

  const runId = run.rows[0].id;

  // Create step records
  const steps = scenario.rows[0].steps as any[];
  for (const step of steps) {
    await query(
      `INSERT INTO run_steps (run_id, step_index, name, status)
       VALUES ($1, $2, $3, 'pending')`,
      [runId, step.index, step.name]
    );
  }

  // Start execution asynchronously
  runScenario(runId, scenario.rows[0], activeBugs).catch((err) =>
    console.error(`Run ${runId} failed:`, err)
  );

  res.status(201).json(run.rows[0]);
});

// Get run status with steps
router.get("/:id", async (req, res) => {
  const run = await query("SELECT * FROM runs WHERE id = $1", [req.params.id]);
  if (run.rows.length === 0) {
    return res.status(404).json({ error: "Run not found" });
  }

  const steps = await query(
    "SELECT * FROM run_steps WHERE run_id = $1 ORDER BY step_index",
    [req.params.id]
  );

  const triage = await query(
    "SELECT * FROM triage_reports WHERE run_id = $1",
    [req.params.id]
  );

  res.json({
    ...run.rows[0],
    steps: steps.rows,
    triage: triage.rows[0] || null,
  });
});

// List runs (most recent first)
router.get("/", async (_req, res) => {
  const result = await query(
    `SELECT r.*, s.name as scenario_name
     FROM runs r
     JOIN scenarios s ON r.scenario_id = s.id
     ORDER BY r.created_at DESC
     LIMIT 50`
  );
  res.json(result.rows);
});

// SSE endpoint for live run updates
router.get("/:id/stream", async (req, res) => {
  const runId = req.params.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send current state immediately
  const run = await query("SELECT * FROM runs WHERE id = $1", [runId]);
  const steps = await query(
    "SELECT * FROM run_steps WHERE run_id = $1 ORDER BY step_index",
    [runId]
  );
  res.write(
    `data: ${JSON.stringify({ type: "init", run: run.rows[0], steps: steps.rows })}\n\n`
  );

  // Subscribe to Redis pub/sub for live updates
  const Redis = await import("ioredis");
  const sub = new Redis.default({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  });

  await sub.subscribe("run:updates");

  sub.on("message", (_channel: string, message: string) => {
    const data = JSON.parse(message);
    if (data.runId === runId) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  });

  req.on("close", () => {
    sub.unsubscribe();
    sub.disconnect();
  });
});

export default router;
