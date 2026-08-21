import { useRef, useState, type ReactElement } from "react";
import "./App.css";

type Status = "idle" | "recording" | "transcribing" | "cleaning" | "done" | "error";
type View = "clean" | "verbatim";

interface RemovedSpan {
  text: string;
  start: number;
  end: number;
}

function VerbatimView({ verbatim, removedSpans }: { verbatim: string; removedSpans: RemovedSpan[] }) {
  const sorted = [...removedSpans].sort((a, b) => a.start - b.start);
  const parts: ReactElement[] = [];
  let cursor = 0;
  sorted.forEach((span, i) => {
    if (span.start > cursor) {
      parts.push(<span key={`t${i}`}>{verbatim.slice(cursor, span.start)}</span>);
    }
    parts.push(
      <s key={`r${i}`} className="removed-span" title="Removed by clean pass">
        {verbatim.slice(span.start, span.end)}
      </s>
    );
    cursor = span.end;
  });
  if (cursor < verbatim.length) {
    parts.push(<span key="tail">{verbatim.slice(cursor)}</span>);
  }
  return <p className="transcript verbatim">{parts}</p>;
}

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [verbatim, setVerbatim] = useState("");
  const [clean, setClean] = useState("");
  const [removedSpans, setRemovedSpans] = useState<RemovedSpan[]>([]);
  const [view, setView] = useState<View>("clean");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    setError(null);
    setVerbatim("");
    setClean("");
    setRemovedSpans([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void processRecording();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch {
      setError("Microphone access was denied or unavailable.");
      setStatus("error");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function processRecording() {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    try {
      setStatus("transcribing");
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const transcribeRes = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!transcribeRes.ok) throw new Error("Transcription failed.");
      const { verbatim: verbatimText } = await transcribeRes.json();
      setVerbatim(verbatimText);

      setStatus("cleaning");
      const cleanRes = await fetch("/api/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verbatim: verbatimText }),
      });
      if (!cleanRes.ok) throw new Error("Cleanup failed.");
      const { clean: cleanText, removedSpans: spans } = await cleanRes.json();
      setClean(cleanText);
      setRemovedSpans(spans);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  const isBusy = status === "recording" || status === "transcribing" || status === "cleaning";

  return (
    <div className="app">
      <header>
        <h1>Clarity</h1>
        <p className="tagline">Speak naturally. Read cleanly. Nothing is ever silently lost.</p>
      </header>

      <div className="controls">
        {status !== "recording" ? (
          <button className="record-btn" onClick={startRecording} disabled={isBusy}>
            ● Record
          </button>
        ) : (
          <button className="record-btn recording" onClick={stopRecording}>
            ■ Stop
          </button>
        )}
        {status === "transcribing" && <span className="status-note">Transcribing…</span>}
        {status === "cleaning" && <span className="status-note">Cleaning up filler…</span>}
      </div>

      {error && <p className="error">{error}</p>}

      {(verbatim || clean) && (
        <div className="result">
          <div className="view-toggle">
            <button className={view === "clean" ? "active" : ""} onClick={() => setView("clean")}>
              Clean
            </button>
            <button className={view === "verbatim" ? "active" : ""} onClick={() => setView("verbatim")}>
              Verbatim
            </button>
          </div>

          {view === "clean" ? (
            <p className="transcript clean">{clean || verbatim}</p>
          ) : (
            <VerbatimView verbatim={verbatim} removedSpans={removedSpans} />
          )}

          <p className="disclaimer">
            {view === "clean"
              ? "This is a derived, edited version. Switch to Verbatim to see exactly what was removed."
              : "Struck-through text was removed by the clean pass. Nothing is deleted from the record."}
          </p>
        </div>
      )}
    </div>
  );
}
