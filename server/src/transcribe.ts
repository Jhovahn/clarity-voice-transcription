import OpenAI from "openai";
import { toFile } from "openai/uploads";

let openai: OpenAI | undefined;

function getClient(): OpenAI {
  if (!openai) openai = new OpenAI();
  return openai;
}

export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string> {
  const file = await toFile(buffer, filename);
  const result = await getClient().audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return result.text;
}
