import { Router } from "express";
import path from "path";
import fs from "fs";

const router = Router();
const ARTIFACTS_DIR = path.resolve(__dirname, "../../../artifacts");

// Serve screenshot files
router.get("/screenshots/:filename", (req, res) => {
  const filePath = path.join(ARTIFACTS_DIR, "screenshots", req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Screenshot not found" });
  }
  res.sendFile(filePath);
});

// List artifacts for a run
router.get("/runs/:runId", async (req, res) => {
  const runDir = path.join(ARTIFACTS_DIR, "screenshots");
  if (!fs.existsSync(runDir)) {
    return res.json([]);
  }

  const files = fs
    .readdirSync(runDir)
    .filter((f) => f.startsWith(req.params.runId))
    .map((f) => ({
      filename: f,
      url: `/api/artifacts/screenshots/${f}`,
    }));

  res.json(files);
});

export default router;
