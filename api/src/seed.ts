import fs from "fs";
import path from "path";
import { pool, query } from "./db";

async function seed() {
  const scenariosDir = path.resolve(__dirname, "../../scenarios");
  const files = fs
    .readdirSync(scenariosDir)
    .filter((f) => f.endsWith(".json"));

  console.log(`Seeding ${files.length} scenarios...`);

  for (const file of files) {
    const raw = fs.readFileSync(path.join(scenariosDir, file), "utf-8");
    const scenario = JSON.parse(raw);

    await query(
      `INSERT INTO scenarios (id, name, description, steps, seeded_bugs)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         steps = EXCLUDED.steps,
         seeded_bugs = EXCLUDED.seeded_bugs`,
      [
        scenario.id,
        scenario.name,
        scenario.description,
        JSON.stringify(scenario.steps),
        JSON.stringify(scenario.seeded_bugs || []),
      ]
    );

    console.log(`  ✓ ${scenario.id}`);
  }

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
