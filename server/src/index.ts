import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { transcribeAudio } from "./transcribe.js";
import { cleanTranscript } from "./clean.js";

const app = express();
app.set("trust proxy", 1); // deploy targets (Render/Fly/etc.) sit behind a proxy; needed for correct per-IP limiting
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

// Cost-safety: this demo has no auth, and the two routes below spend real
// money on the OpenAI/Anthropic keys held server-side. A per-IP limit stops
// one visitor from running up the bill; a process-lifetime global cap bounds
// total exposure even from a legitimately viral link. Both are intentionally
// crude (in-memory, resets on restart) — fine for a portfolio demo, not for
// a real product, where this would move to a proper metering/auth layer.
const perIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this device. Try again in a few minutes." },
});

const GLOBAL_DAILY_CAP = Number(process.env.GLOBAL_DAILY_REQUEST_CAP ?? 200);
let globalCount = 0;
let globalCountResetAt = Date.now() + 24 * 60 * 60 * 1000;
function globalCapLimiter(_req: express.Request, res: express.Response, next: express.NextFunction) {
  if (Date.now() > globalCountResetAt) {
    globalCount = 0;
    globalCountResetAt = Date.now() + 24 * 60 * 60 * 1000;
  }
  if (globalCount >= GLOBAL_DAILY_CAP) {
    res.status(429).json({ error: "This demo has hit its daily usage cap. Please try again later." });
    return;
  }
  globalCount += 1;
  next();
}

app.post("/api/transcribe", perIpLimiter, globalCapLimiter, upload.single("audio"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Missing audio file (field name 'audio')." });
    return;
  }
  try {
    const verbatim = await transcribeAudio(req.file.buffer, req.file.originalname || "audio.webm");
    res.json({ verbatim });
  } catch (err) {
    console.error("transcribe failed:", err);
    res.status(502).json({ error: "Transcription failed." });
  }
});

app.post("/api/clean", perIpLimiter, globalCapLimiter, async (req, res) => {
  const { verbatim } = req.body ?? {};
  if (typeof verbatim !== "string" || verbatim.trim().length === 0) {
    res.status(400).json({ error: "Missing 'verbatim' string in body." });
    return;
  }
  try {
    const result = await cleanTranscript(verbatim);
    res.json(result);
  } catch (err) {
    console.error("clean failed:", err);
    res.status(502).json({ error: "Cleanup failed." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(port, () => {
  console.log(`Clarity server listening on http://localhost:${port}`);
});
