import { Router } from "express";
import { query } from "../db";

const router = Router();

// List all scenarios
router.get("/", async (_req, res) => {
  const result = await query(
    "SELECT id, name, description, seeded_bugs, created_at FROM scenarios ORDER BY name"
  );
  res.json(result.rows);
});

// Get single scenario with full steps
router.get("/:id", async (req, res) => {
  const result = await query("SELECT * FROM scenarios WHERE id = $1", [
    req.params.id,
  ]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Scenario not found" });
  }
  res.json(result.rows[0]);
});

export default router;
