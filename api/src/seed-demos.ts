import { pool, query } from "./db";
import { runScenario } from "./services/runner";

/**
 * Seeds a demo run for each bug scenario so the landing page
 * can link to pre-existing sample runs.
 */
async function seedDemos() {
  // Clear any previous demo data (runs cascade-delete steps + triage)
  await query("DELETE FROM triage_reports");
  await query("DELETE FROM run_steps");
  await query("DELETE FROM runs");

  const result = await query("SELECT * FROM scenarios");
  const scenarios = result.rows;

  if (scenarios.length === 0) {
    console.error("No scenarios found. Run `npm run seed` first.");
    process.exit(1);
  }

  for (const scenario of scenarios) {
    const bugs = (scenario.seeded_bugs || []) as any[];
    // Skip happy-path scenario (no bugs to demo)
    if (bugs.length === 0) continue;

    const activeBugs = bugs.map((b: any) => b.id);
    console.log(`Creating demo run for "${scenario.name}" with bugs: ${activeBugs.join(", ")}`);

    // Create run
    const run = await query(
      `INSERT INTO runs (scenario_id, status, active_bugs)
       VALUES ($1, 'pending', $2)
       RETURNING *`,
      [scenario.id, JSON.stringify(activeBugs)]
    );
    const runId = run.rows[0].id;

    // Create steps
    const steps = scenario.steps as any[];
    for (const step of steps) {
      await query(
        `INSERT INTO run_steps (run_id, step_index, name, status)
         VALUES ($1, $2, $3, 'pending')`,
        [runId, step.index, step.name]
      );
    }

    // Execute the scenario (generates screenshots + triage)
    await runScenario(runId, scenario, activeBugs);
    console.log(`  Done: ${runId}`);
  }

  console.log("\nDemo runs seeded successfully.");
  await pool.end();
  process.exit(0);
}

seedDemos().catch((err) => {
  console.error("Seed demos failed:", err);
  process.exit(1);
});
