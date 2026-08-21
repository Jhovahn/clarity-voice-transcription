import OpenAI from "openai";
import { toFile } from "openai/uploads";

let openai: OpenAI | undefined;

function getClient(): OpenAI {
  if (!openai) openai = new OpenAI();
  return openai;
}

// No real ASR can run without audio content understanding, so the mock
// rotates through a few canned verbatim samples that exercise the filler
// taxonomy from PRD Epic B (filled pauses, discourse fillers, repetitions).
const MOCK_SAMPLES = [
  "So, um, I think the the best approach here is, like, we just ship the walking skeleton first, you know, and then, uh, iterate from there.",
  "Okay so basically what happened is, uh, the build failed, and I I spent like an hour, you know, debugging it before I actually, um, found the issue.",
  "I I wanted to, um, follow up on the the meeting notes from yesterday, and, like, make sure everyone's, uh, aligned on the deadline.",
];

export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[transcribe] OPENAI_API_KEY not set — returning a mock verbatim transcript.");
    return MOCK_SAMPLES[Math.floor(Math.random() * MOCK_SAMPLES.length)];
  }
  const file = await toFile(buffer, filename);
  const result = await getClient().audio.transcriptions.create({
    file,
    model: "whisper-1",
    // Whisper's training data rarely included transcribed disfluencies, so
    // by default it silently drops "um"/"uh" even when they're clearly
    // spoken — this in-context example biases it toward keeping them, since
    // there's no explicit "verbatim mode" flag on this API.
    prompt: "Um, so, like, this is, uh, a verbatim transcript that keeps every filler word exactly as spoken, you know.",
  });
  return result.text;
}
