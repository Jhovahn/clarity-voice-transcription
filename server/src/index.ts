import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { transcribeAudio } from "./transcribe.js";
import { cleanTranscript } from "./clean.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
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

app.post("/api/clean", async (req, res) => {
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
