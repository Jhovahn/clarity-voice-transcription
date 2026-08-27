import { useEffect, useRef, useState, type ReactElement } from "react";
import "./App.css";

// Empty string in dev relies on Vite's /api proxy (vite.config.ts) to
// localhost:8787. In production there's no dev proxy, so the deployed
// frontend needs the backend's real URL injected at build time.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type Status = "idle" | "recording" | "transcribing" | "cleaning" | "done" | "error";
type View = "clean" | "verbatim";
type CopyState = "idle" | "copied" | "failed";

const COPY_FEEDBACK_MS = 2000;

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

// Inline SVGs rather than an icon dependency — matches the existing
// ● Record / ■ Stop glyph approach and keeps deps to react/react-dom.
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [verbatim, setVerbatim] = useState("");
  const [clean, setClean] = useState("");
  const [removedSpans, setRemovedSpans] = useState<RemovedSpan[]>([]);
  const [view, setView] = useState<View>("clean");
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending "copied" reset so an unmount (or a rapid re-click,
  // which resets the timer below) can't fire a stale state update.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

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
      const transcribeRes = await fetch(`${API_BASE}/api/transcribe`, { method: "POST", body: form });
      if (!transcribeRes.ok) throw new Error("Transcription failed.");
      const { verbatim: verbatimText } = await transcribeRes.json();
      setVerbatim(verbatimText);

      setStatus("cleaning");
      const cleanRes = await fetch(`${API_BASE}/api/clean`, {
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

  // Copy whatever the user is currently looking at, so the button can never
  // contradict the view. Verbatim copies as plain text — the struck-through
  // removed spans are included, since that's the full record on screen.
  const displayedText = view === "clean" ? clean || verbatim : verbatim;

  async function copyTranscript() {
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    try {
      // navigator.clipboard is undefined on non-secure origins, and
      // writeText can reject if permission is denied.
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(displayedText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopyState("idle");
    }, COPY_FEEDBACK_MS);
  }

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
          <div className="result-actions">
            <div className="view-toggle">
              <button className={view === "clean" ? "active" : ""} onClick={() => setView("clean")}>
                Clean
              </button>
              <button className={view === "verbatim" ? "active" : ""} onClick={() => setView("verbatim")}>
                Verbatim
              </button>
            </div>

            <button
              className={`copy-btn${copyState !== "idle" ? ` ${copyState}` : ""}`}
              onClick={() => void copyTranscript()}
              disabled={!displayedText}
              aria-label="Copy transcript"
            >
              {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
              <span>{copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}</span>
            </button>
          </div>

          <p className="copy-status" role="status" aria-live="polite">
            {copyState === "copied"
              ? "Transcript copied to clipboard"
              : copyState === "failed"
                ? "Could not copy to clipboard"
                : ""}
          </p>

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
