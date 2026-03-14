import express from "express";
import cors from "cors";
import scenariosRouter from "./routes/scenarios";
import runsRouter from "./routes/runs";
import artifactsRouter from "./routes/artifacts";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "checkout-guardian-api" });
});

app.use("/api/scenarios", scenariosRouter);
app.use("/api/runs", runsRouter);
app.use("/api/artifacts", artifactsRouter);

app.listen(PORT, () => {
  console.log(`Checkout Guardian API running on port ${PORT}`);
});
