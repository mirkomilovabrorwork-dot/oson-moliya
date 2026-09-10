"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LangCode } from "@/lib/i18n/translate";
import { QuickAddForm } from "@/components/QuickAddForm";
import { translateCategoryName } from "@/lib/categories-i18n";
import { resizeImageForUpload } from "@/lib/capture/resize-image";
import { IconMic, IconCam, IconPen, IconChart, IconClose, IconCheck } from "./icons";

type Mode = "voice" | "photo" | "text" | null;
type Screen = "home" | "record" | "process" | "done" | "error" | "photo" | "text";
type ErrorKind =
  | "no-speech" // V-F1
  | "no-amount" // V-F2 / P-F1
  | "network" // V-F4 / P-F3
  | "permission"; // V-F5

interface CategoryOption {
  id: string;
  name: string;
  type: string;
  emoji: string | null;
}

interface TodayRow {
  id: string;
  type: string;
  amountUzs: string;
  occurredAt: string;
  categoryName: string | null;
  categoryEmoji: string | null;
}

interface TxCategory {
  id?: string;
  name: string;
  emoji?: string | null;
  type?: string;
}

interface TxLike {
  id: string;
  type: "income" | "expense";
  amountUzs: string;
  note?: string | null;
  occurredAt: string;
  category?: TxCategory | null;
  categoryId?: string | null;
}

interface CaptureClientProps {
  lang: LangCode;
  categories: CategoryOption[];
  mainCurrency: "UZS" | "USD" | "EUR" | "RUB";
  todayCount: number;
  todayTotal: string;
  todayRows: TodayRow[];
}

function formatUzs(raw: string): string {
  const negative = raw.trim().startsWith("-");
  const digits = raw.replace(/[^0-9]/g, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (negative ? "-" : "") + grouped;
}

/** Asia/Tashkent (UTC+5, no DST) calendar date + time for an ISO timestamp. */
function tashkentParts(iso: string) {
  const tt = new Date(new Date(iso).getTime() + 5 * 60 * 60 * 1000);
  return {
    y: tt.getUTCFullYear(),
    m: tt.getUTCMonth(),
    d: tt.getUTCDate(),
    hh: tt.getUTCHours(),
    mm: tt.getUTCMinutes(),
  };
}

/** Short WebAudio "done" ding — no audio asset needed. */
function playDoneDing() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    // best-effort only — never block the done state on audio failure
  }
}

function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return undefined;
}

export function CaptureClient({ lang, categories, mainCurrency, todayCount, todayTotal, todayRows }: CaptureClientProps) {
  const [screen, setScreen] = useState<Screen>("home");
  const [errorKind, setErrorKind] = useState<ErrorKind>("network");
  const [transcript, setTranscript] = useState<string>("");
  const [level, setLevel] = useState(0);
  const [processingLabel, setProcessingLabel] = useState("Yozyapman...");
  const [doneTx, setDoneTx] = useState<TxLike | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastMode, setLastMode] = useState<"voice" | "photo">("voice");
  const [editingTx, setEditingTx] = useState<TxLike | null>(null);
  const [undoError, setUndoError] = useState(false);

  // Recording plumbing
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const speechStartedAtRef = useRef<number>(0);
  const finishedRef = useRef(false);
  const mountedRef = useRef(true);
  const captureIdRef = useRef<string>("");
  const retryBlobRef = useRef<{ blob: Blob; mimeType: string } | null>(null);
  const retryPhotoRef = useRef<Blob | null>(null);
  const processTimerRef = useRef<number | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadGenRef = useRef(0);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const newCaptureId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cap-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // Consume ?mode= once on mount, then scrub it from the URL immediately so
  // Back/Forward never re-arms the microphone (extra requirement #1).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") as Mode;
    if (!mode) return;
    window.history.replaceState(null, "", "/capture");
    if (mode === "voice") startRecording();
    else if (mode === "photo") setScreen("photo");
    else if (mode === "text") setScreen("text");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      finishedRef.current = true;
      uploadGenRef.current++;
      uploadAbortRef.current?.abort();
      cleanupRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupRecording = useCallback(() => {
    if (meterTimerRef.current !== null) {
      window.clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const onDone = useCallback((tx: TxLike) => {
    setUndoError(false);
    setDoneTx(tx);
    setScreen("done");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([40, 60, 40]);
    }
    playDoneDing();
  }, []);

  const uploadVoice = useCallback(
    async (blob: Blob, mimeType: string) => {
      retryBlobRef.current = { blob, mimeType };
      setScreen("process");
      setProcessingLabel("Yozyapman...");
      if (processTimerRef.current !== null) window.clearTimeout(processTimerRef.current);
      processTimerRef.current = window.setTimeout(() => setProcessingLabel("Sekin internet..."), 8000);

      const myGen = ++uploadGenRef.current;
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      const stale = () => myGen !== uploadGenRef.current || !mountedRef.current;

      try {
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        form.append("captureId", captureIdRef.current);
        const res = await fetch("/api/capture/voice", { method: "POST", body: form, signal: controller.signal });
        if (stale()) return;
        if (res.status === 429 || res.status >= 500) {
          setErrorKind("network");
          setScreen("error");
          return;
        }
        const data = (await res.json().catch(() => null)) as
          | { ok: boolean; saved?: boolean; transcript?: string; transaction?: TxLike }
          | null;
        if (stale()) return;
        if (!data || !data.ok) {
          setErrorKind("network");
          setScreen("error");
          return;
        }
        if (data.saved && data.transaction) {
          onDone(data.transaction);
          return;
        }
        setTranscript(data.transcript ?? "");
        setErrorKind("no-amount");
        setScreen("error");
      } catch {
        if (stale()) return;
        setErrorKind("network");
        setScreen("error");
      } finally {
        window.clearTimeout(timeoutId);
        if (processTimerRef.current !== null) {
          window.clearTimeout(processTimerRef.current);
          processTimerRef.current = null;
        }
      }
    },
    [onDone]
  );

  const finishRecording = useCallback(
    (reason: "no-speech" | "silence" | "hard-cap" | "manual") => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      cleanupRecording();
      const recorder = recorderRef.current;

      if (reason === "no-speech") {
        if (recorder && recorder.state !== "inactive") {
          recorder.ondataavailable = null;
          recorder.onstop = null;
          recorder.stop();
        }
        setErrorKind("no-speech");
        setScreen("error");
        return;
      }

      const doUpload = () => {
        const mimeType = recorder?.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        void uploadVoice(blob, mimeType);
      };

      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = doUpload;
        recorder.stop();
      } else {
        doUpload();
      }
    },
    [cleanupRecording, uploadVoice]
  );

  async function startRecording() {
    finishedRef.current = false;
    chunksRef.current = [];
    captureIdRef.current = newCaptureId();
    setLevel(0);
    setLastMode("voice");
    setScreen("record");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorKind("permission");
      setScreen("error");
      return;
    }

    // The capture may have been cancelled (X, mode switch, unmount) while the
    // permission prompt was still open — don't start a mic nobody is looking at.
    if (finishedRef.current || !mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;

    try {
      const mimeType = pickAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        finishRecording("hard-cap"); // no Web Audio support — fall back to whatever was captured
        return;
      }
      const audioCtx = new Ctx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const startedAt = Date.now();
      let ambientSum = 0;
      let ambientSamples = 0;
      let speechStarted = false;
      let speechCandidateStart = 0;
      let lastLoudAt = 0;

      meterTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const lvl = Math.sqrt(sum / data.length);
        setLevel(lvl);

        const elapsed = Date.now() - startedAt;
        if (elapsed < 300) {
          ambientSum += lvl;
          ambientSamples++;
          return;
        }
        const ambientAvg = ambientSamples > 0 ? ambientSum / ambientSamples : 0.01;
        const threshold = Math.max(ambientAvg * 3, 0.02);

        if (!speechStarted) {
          if (lvl > threshold) {
            if (!speechCandidateStart) speechCandidateStart = Date.now();
            if (Date.now() - speechCandidateStart >= 200) {
              speechStarted = true;
              speechStartedAtRef.current = Date.now();
              lastLoudAt = Date.now();
            }
          } else {
            speechCandidateStart = 0;
          }
          if (!speechStarted && elapsed >= 4000) {
            finishRecording("no-speech");
            return;
          }
        } else {
          if (lvl > threshold) lastLoudAt = Date.now();
          if (Date.now() - lastLoudAt >= 1500) {
            finishRecording("silence");
            return;
          }
        }

        if (elapsed >= 20000) {
          finishRecording("hard-cap");
        }
      }, 100);
    } catch {
      // The stream is already live at this point (e.g. MediaRecorder unsupported) —
      // this is not a permission problem, and the mic must not keep running.
      cleanupRecording();
      setErrorKind("network");
      setScreen("error");
    }
  }

  function cancelRecording() {
    finishedRef.current = true;
    cleanupRecording();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    setScreen("home");
  }

  async function retryVoiceUpload() {
    const prev = retryBlobRef.current;
    if (prev) {
      void uploadVoice(prev.blob, prev.mimeType);
    } else {
      void startRecording();
    }
  }

  // ---- Photo mode ----
  async function handlePhotoFile(file: File | undefined) {
    setLastMode("photo");
    if (!file) return; // P-F2: camera cancelled — silently back to the picker
    setScreen("process");
    setProcessingLabel("Chekni o'qiyapman...");
    if (processTimerRef.current !== null) window.clearTimeout(processTimerRef.current);
    processTimerRef.current = window.setTimeout(() => setProcessingLabel("Sekin internet..."), 8000);

    const myGen = ++uploadGenRef.current;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    const stale = () => myGen !== uploadGenRef.current || !mountedRef.current;

    try {
      const resized = await resizeImageForUpload(file);
      retryPhotoRef.current = resized;
      // Fresh id per capture attempt — a server-side de-duplicator keys on this,
      // so reusing the previous receipt's id would silently drop this one.
      captureIdRef.current = newCaptureId();

      const form = new FormData();
      form.append("image", resized, "receipt.jpg");
      form.append("captureId", captureIdRef.current);
      const res = await fetch("/api/capture/receipt", { method: "POST", body: form, signal: controller.signal });
      if (stale()) return;
      if (res.status === 429 || res.status >= 500) {
        setErrorKind("network");
        setScreen("error");
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; saved?: boolean; transaction?: TxLike }
        | null;
      if (stale()) return;
      if (!data || !data.ok) {
        setErrorKind("network");
        setScreen("error");
        return;
      }
      if (data.saved && data.transaction) {
        onDone(data.transaction);
        return;
      }
      setErrorKind("no-amount");
      setScreen("error");
    } catch {
      if (stale()) return;
      setErrorKind("network");
      setScreen("error");
    } finally {
      window.clearTimeout(timeoutId);
      if (processTimerRef.current !== null) {
        window.clearTimeout(processTimerRef.current);
        processTimerRef.current = null;
      }
    }
  }

  async function retryPhotoUpload() {
    setLastMode("photo");
    const prev = retryPhotoRef.current;
    if (prev) {
      setScreen("process");
      setProcessingLabel("Chekni o'qiyapman...");
      const myGen = ++uploadGenRef.current;
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      const stale = () => myGen !== uploadGenRef.current || !mountedRef.current;
      try {
        const form = new FormData();
        form.append("image", prev, "receipt.jpg");
        form.append("captureId", captureIdRef.current);
        const res = await fetch("/api/capture/receipt", { method: "POST", body: form, signal: controller.signal });
        if (stale()) return;
        if (res.status === 429 || res.status >= 500) {
          setErrorKind("network");
          setScreen("error");
          return;
        }
        const data = (await res.json().catch(() => null)) as
          | { ok: boolean; saved?: boolean; transaction?: TxLike }
          | null;
        if (stale()) return;
        if (data?.ok && data.saved && data.transaction) {
          onDone(data.transaction);
          return;
        }
        setErrorKind(data?.ok ? "no-amount" : "network");
        setScreen("error");
      } catch {
        if (stale()) return;
        setErrorKind("network");
        setScreen("error");
      } finally {
        window.clearTimeout(timeoutId);
      }
    } else {
      setScreen("photo");
    }
  }

  // ---- Done-card actions ----
  async function handleUndo() {
    if (!doneTx) return;
    setUndoError(false);
    try {
      const res = await fetch(`/api/transactions/${doneTx.id}`, { method: "DELETE" });
      if (!res.ok) {
        setUndoError(true);
        return;
      }
    } catch {
      setUndoError(true);
      return;
    }
    setDoneTx(null);
    setScreen("home");
    window.location.reload();
  }

  function handleFix() {
    // "Tuzatish" must never delete the record — it opens QuickAddForm in edit mode
    // (pre-filled from the just-saved transaction), which PATCHes on submit instead
    // of creating a new one.
    if (!doneTx) return;
    setEditingTx(doneTx);
    setDoneTx(null);
    setScreen("text");
  }

  async function pickCategory(catId: string) {
    if (!doneTx) return;
    setPickerOpen(false);
    try {
      const res = await fetch(`/api/transactions/${doneTx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: catId }),
      });
      if (res.ok) {
        const updated = (await res.json()) as TxLike;
        setDoneTx(updated);
      }
    } catch {
      // leave the card as-is on failure
    }
  }

  // ================= RENDER =================

  if (screen === "text") {
    return (
      <Shell
        onClose={() => {
          setEditingTx(null);
          setScreen("home");
        }}
        rightCount={todayCount}
      >
        <div className="px-4 pt-2 pb-6">
          <h1 className="text-lg font-semibold mb-4" style={{ color: "var(--fg)" }}>
            {editingTx ? "Tuzatish" : "Qo'lda yozish"}
          </h1>
          <QuickAddForm
            lang={lang}
            categories={categories}
            mainCurrency={mainCurrency}
            bare
            editTx={
              editingTx
                ? {
                    id: editingTx.id,
                    type: editingTx.type,
                    amountUzs: editingTx.amountUzs,
                    categoryId: editingTx.categoryId ?? editingTx.category?.id ?? null,
                    note: editingTx.note ?? null,
                    occurredAt: editingTx.occurredAt,
                  }
                : null
            }
            onSuccess={(tx) => {
              setEditingTx(null);
              if (tx) onDone(tx as unknown as TxLike);
              else setScreen("home");
            }}
          />
        </div>
      </Shell>
    );
  }

  if (screen === "photo") {
    return (
      <Shell onClose={() => setScreen("home")} rightCount={todayCount}>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handlePhotoFile(file);
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            hidden
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handlePhotoFile(file);
            }}
          />
          <button
            type="button"
            aria-label="Chekni suratga olish"
            onClick={() => photoInputRef.current?.click()}
            className="w-full max-w-xs flex flex-col items-center justify-center gap-2 rounded-2xl"
            style={{
              minHeight: 180,
              background: "var(--accent-gradient)",
              color: "#fff",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <IconCam />
            <span className="text-base font-semibold">Chekni suratga olish</span>
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="text-sm font-medium underline"
            style={{ color: "var(--fg-muted)" }}
          >
            Galereyadan
          </button>
        </div>
      </Shell>
    );
  }

  if (screen === "record") {
    const bars = Array.from({ length: 12 }, (_, i) => {
      const h = 6 + Math.min(1, level * (1 + (i % 3) * 0.3)) * 34;
      return h;
    });
    return (
      <Shell onClose={cancelRecording} rightCount={todayCount}>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded-full animate-pulse"
              style={{ width: 12, height: 12, background: "var(--accent)" }}
              aria-hidden="true"
            />
            <span className="text-lg font-semibold" style={{ color: "var(--fg)" }}>
              Gapiring
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Yozilmoqda...
          </p>
          <div className="flex items-end gap-1" style={{ height: 40 }} role="img" aria-label="ovoz darajasi">
            {bars.map((h, i) => (
              <span
                key={i}
                style={{
                  width: 4,
                  height: h,
                  background: "var(--accent)",
                  borderRadius: 2,
                  transition: "height 100ms linear",
                }}
              />
            ))}
          </div>
          <p className="text-sm text-center" style={{ color: "var(--fg-subtle)" }}>
            masalan: &quot;logistikaga besh yuz ming chiqim&quot;
          </p>
        </div>
        <div className="px-4 pb-6 space-y-3">
          <button
            type="button"
            onClick={() => finishRecording("manual")}
            className="w-full rounded-2xl font-semibold text-base"
            style={{ minHeight: 72, background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-md)" }}
          >
            Tayyor
          </button>
          <div className="flex items-center justify-center gap-8 pt-1">
            <button
              type="button"
              onClick={() => {
                cancelRecording();
                setScreen("photo");
              }}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "var(--fg-muted)", minHeight: 48 }}
            >
              <IconCam /> Chek
            </button>
            <button
              type="button"
              onClick={() => {
                cancelRecording();
                setScreen("text");
              }}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "var(--fg-muted)", minHeight: 48 }}
            >
              <IconPen /> Yoz
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (screen === "process") {
    return (
      <Shell
        onClose={() => {
          // Abort the in-flight upload and invalidate its generation so a late
          // response can never render onto whatever screen the user is on next.
          uploadGenRef.current++;
          uploadAbortRef.current?.abort();
          if (processTimerRef.current !== null) {
            window.clearTimeout(processTimerRef.current);
            processTimerRef.current = null;
          }
          setScreen("home");
        }}
        rightCount={todayCount}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <div
            className="rounded-full animate-spin"
            style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTopColor: "var(--accent)" }}
            role="status"
            aria-label={processingLabel}
          />
          <p className="text-base font-medium" style={{ color: "var(--fg)" }}>
            {processingLabel}
          </p>
        </div>
      </Shell>
    );
  }

  if (screen === "error") {
    return (
      <ErrorCard
        kind={errorKind}
        transcript={transcript}
        lastMode={lastMode}
        onRetryVoice={retryVoiceUpload}
        onRetryPhoto={retryPhotoUpload}
        onWrite={() => setScreen("text")}
        onClose={() => setScreen("home")}
      />
    );
  }

  if (screen === "done" && doneTx) {
    const isExpense = doneTx.type === "expense";
    const catName = doneTx.category?.name ? translateCategoryName(doneTx.category.name, lang) : "Boshqa";
    const catEmoji = doneTx.category?.emoji ?? "🏷️";
    const occ = tashkentParts(doneTx.occurredAt);
    const now = tashkentParts(new Date().toISOString());
    const yest = tashkentParts(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const isToday = occ.y === now.y && occ.m === now.m && occ.d === now.d;
    const isYesterday = occ.y === yest.y && occ.m === yest.m && occ.d === yest.d;
    const dayLabel = isToday
      ? "bugun"
      : isYesterday
      ? "kecha"
      : `${String(occ.d).padStart(2, "0")}.${String(occ.m + 1).padStart(2, "0")}.${occ.y}`;
    const timeLabel = `${dayLabel}, ${String(occ.hh).padStart(2, "0")}:${String(occ.mm).padStart(2, "0")}`;
    const doneModeType = doneTx.category?.type ?? doneTx.type;

    return (
      <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--done-wash)" }}>
        <div className="flex items-center justify-between px-4 pt-4">
          <span />
          <span className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
            Bugun · {isToday ? todayCount + 1 : todayCount}
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 72, height: 72, background: "var(--accent)", color: "#fff" }}
          >
            <IconCheck />
          </div>
          <p className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
            Saqlandi
          </p>
          <p className="text-4xl font-bold tabular" style={{ color: isExpense ? "var(--expense)" : "var(--income)" }}>
            {isExpense ? "-" : "+"}
            {formatUzs(doneTx.amountUzs)} so&apos;m
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 text-base font-medium"
            style={{ color: "var(--fg)" }}
          >
            <span aria-hidden="true">{catEmoji}</span>
            {catName} · {isExpense ? "chiqim" : "kirim"}
          </button>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            {timeLabel}
          </p>
        </div>
        <div className="px-4 pb-6 space-y-3">
          {undoError && (
            <div
              className="text-sm px-3 py-2.5 rounded-lg"
              style={{ background: "var(--expense-wash)", color: "var(--expense)" }}
              role="alert"
            >
              O&apos;chirib bo&apos;lmadi — qaytadan urining
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleUndo}
              className="flex-1 rounded-xl text-sm font-semibold"
              style={{ minHeight: 48, color: "var(--expense)", border: "1px solid var(--border-strong)" }}
            >
              Bekor qilish
            </button>
            <button
              type="button"
              onClick={handleFix}
              className="flex-1 rounded-xl text-sm font-semibold"
              style={{ minHeight: 48, color: "var(--fg)", border: "1px solid var(--border-strong)" }}
            >
              Tuzatish
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setDoneTx(null);
              void startRecording();
            }}
            className="w-full rounded-2xl font-semibold text-base flex items-center justify-center gap-2"
            style={{ minHeight: 72, background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-md)" }}
          >
            <IconMic /> Yana
          </button>
        </div>

        {pickerOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: "rgba(0,0,0,0.4)" }}
            role="dialog"
            aria-label="Kategoriya tanlash"
            onClick={() => setPickerOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto"
              style={{ background: "var(--surface-elevated)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold mb-3" style={{ color: "var(--fg)" }}>
                Kategoriyani tanlang
              </p>
              <div className="grid grid-cols-2 gap-2">
                {categories
                  .filter((c) => c.type === doneModeType)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickCategory(c.id)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-left"
                      style={{ background: "var(--surface-sunken)", color: "var(--fg)", minHeight: 44 }}
                    >
                      <span aria-hidden="true">{c.emoji ?? "🏷️"}</span>
                      {translateCategoryName(c.name, lang)}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- STATE H: idle home ----
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="font-bold text-base" style={{ color: "var(--fg)" }}>
          Oson Moliya
        </span>
        <Link href="/" aria-label="Umumiy ko'rinishga o'tish" style={{ color: "var(--fg-muted)" }}>
          <IconChart />
        </Link>
      </div>

      <div className="px-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
            Bugun
          </span>
          <span className="text-lg font-bold tabular" style={{ color: todayTotal.startsWith("-") ? "var(--expense)" : "var(--fg)" }}>
            {formatUzs(todayTotal)}
          </span>
        </div>

        {todayRows.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--fg-subtle)" }}>
            Bugun hali yozuv yo&apos;q — masalan: &quot;logistikaga besh yuz ming chiqim&quot;
          </p>
        ) : (
          <ul className="space-y-1">
            {todayRows.map((row) => (
              <li key={row.id}>
                <Link
                  href="/transactions"
                  className="flex items-center justify-between rounded-lg px-2 py-2.5 text-sm"
                  style={{ minHeight: 52 }}
                >
                  <span className="flex items-center gap-2" style={{ color: "var(--fg)" }}>
                    <span aria-hidden="true">{row.categoryEmoji ?? "🏷️"}</span>
                    {row.categoryName ? translateCategoryName(row.categoryName, lang) : "Boshqa"}
                  </span>
                  <span
                    className="tabular font-medium"
                    style={{ color: row.type === "income" ? "var(--income)" : "var(--expense)" }}
                  >
                    {row.type === "income" ? "+" : "-"}
                    {formatUzs(row.amountUzs)}
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link href="/transactions" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                Hammasi →
              </Link>
            </li>
          </ul>
        )}
      </div>

      <div className="flex-1" />

      <div className="px-4 pb-6 space-y-3">
        <button
          type="button"
          onClick={() => void startRecording()}
          className="w-full rounded-2xl font-semibold text-base flex items-center justify-center gap-2"
          style={{ minHeight: 72, background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-md)" }}
        >
          <IconMic /> Gapirish
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setScreen("photo")}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium"
            style={{ minHeight: 48, color: "var(--fg-muted)", border: "1px solid var(--border-strong)" }}
          >
            <IconCam /> Chek
          </button>
          <button
            type="button"
            onClick={() => setScreen("text")}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium"
            style={{ minHeight: 48, color: "var(--fg-muted)", border: "1px solid var(--border-strong)" }}
          >
            <IconPen /> Yoz
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children, onClose, rightCount }: { children: React.ReactNode; onClose: () => void; rightCount: number }) {
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between px-3" style={{ height: 56 }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          className="flex items-center justify-center"
          style={{ width: 48, height: 48, color: "var(--fg-muted)" }}
        >
          <IconClose />
        </button>
        <Link href="/transactions" className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
          Bugun · {rightCount}
        </Link>
      </div>
      {children}
    </div>
  );
}

function ErrorCard({
  kind,
  transcript,
  lastMode,
  onRetryVoice,
  onRetryPhoto,
  onWrite,
  onClose,
}: {
  kind: ErrorKind;
  transcript: string;
  lastMode: "voice" | "photo";
  onRetryVoice: () => void;
  onRetryPhoto: () => void;
  onWrite: () => void;
  onClose: () => void;
}) {
  const retry = lastMode === "voice" ? onRetryVoice : onRetryPhoto;
  const copy: Record<ErrorKind, { title: string; tone: string; wash: string; primaryLabel: string; onPrimary: () => void }> = {
    "no-speech": {
      title: "Hech narsa eshitilmadi",
      tone: "var(--fg-muted)",
      wash: "var(--surface-sunken)",
      primaryLabel: "Qayta",
      onPrimary: onRetryVoice,
    },
    "no-amount": {
      title:
        lastMode === "voice" && transcript
          ? `Tushunmadim: "${transcript}"`
          : "Chekni o'qiy olmadim",
      tone: "var(--warning)",
      wash: "var(--warning-wash)",
      primaryLabel: "Qayta",
      onPrimary: retry,
    },
    network: {
      title: "Saqlanmadi — internet yo'q",
      tone: "var(--expense)",
      wash: "var(--expense-wash)",
      primaryLabel: "Qayta yuborish",
      onPrimary: retry,
    },
    permission: {
      title: "Mikrofonga ruxsat yo'q",
      tone: "var(--expense)",
      wash: "var(--expense-wash)",
      primaryLabel: "Ruxsat berish",
      onPrimary: onRetryVoice,
    },
  };
  const c = copy[kind];

  return (
    <Shell onClose={onClose} rightCount={0}>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-full max-w-xs rounded-2xl p-5 space-y-3" style={{ background: c.wash }}>
          <p className="text-base font-semibold" style={{ color: c.tone }}>
            {c.title}
          </p>
          {kind === "network" && (
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
              Ilovadan chiqsangiz, yozuv yo&apos;qoladi
            </p>
          )}
          {kind === "permission" && (
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
              Sozlamalar → Ilovalar → Oson Moliya → Ruxsatlar → Mikrofon
            </p>
          )}
          <button
            type="button"
            onClick={c.onPrimary}
            aria-label={c.primaryLabel}
            className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5"
            style={{ background: "var(--accent-gradient)", color: "#fff", minHeight: 48 }}
          >
            <IconMic /> {c.primaryLabel}
          </button>
          <button
            type="button"
            onClick={onWrite}
            className="w-full rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1.5"
            style={{ color: "var(--fg-muted)", minHeight: 44 }}
          >
            <IconPen /> Yoz
          </button>
        </div>
      </div>
    </Shell>
  );
}
