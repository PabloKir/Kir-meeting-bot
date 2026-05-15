"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import {
  SectionHead,
  BracketedCard,
  CardHead,
  Button,
  Chev,
  Alert,
  Tag,
} from "./Brand";
import { Actions } from "./Setup";
import type { Utterance } from "@/lib/types";

// =============================================================================
// Capture Stage
// =============================================================================
// Flujo:
//  1. User aprieta "Iniciar grabación" → MediaRecorder graba audio local
//  2. User aprieta "Detener" → audio.blob queda en estado
//  3. User aprieta "Transcribir" → POST /api/transcribe (sube a AssemblyAI)
//  4. Polling cada 3s a /api/transcribe/[id] hasta que status === 'completed'
//  5. Utterances diarizadas quedan en capture.utterances → siguiente stage es Speakers
// =============================================================================

export function CaptureStage({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const capture = useStore((s) => s.capture);
  const setCapture = useStore((s) => s.setCapture);
  const markDone = useStore((s) => s.markDone);
  const participants = useStore((s) => s.participants);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const [audioLevel, setAudioLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(webm|mp3|m4a|mp4|ogg|wav|flac)$/i.test(file.name)) {
      alert("Formato no reconocido. Subí un archivo de audio (.webm, .mp3, .m4a, .ogg, .wav, .flac).");
      e.target.value = "";
      return;
    }
    if (capture.audioUrl) {
      URL.revokeObjectURL(capture.audioUrl);
    }
    const url = URL.createObjectURL(file);
    const durationSec = 0; // se calcula al reproducir; no es critico
    setCapture({
      audioBlob: file,
      audioUrl: url,
      utterances: [],
      manualNotes: capture.manualNotes,
      status: "idle",
      errorMsg: null,
      elapsed: durationSec,
    });
    setElapsed(0);
    e.target.value = ""; // permitir re-subir el mismo file
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling when transcribing
  useEffect(() => {
    if (capture.status !== "transcribing" || !capture.transcribeJobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/transcribe/${capture.transcribeJobId}`);
        const data = await res.json();
        if (data.status === "completed") {
          setCapture({
            status: "transcribed",
            utterances: data.utterances || [],
            errorMsg: null,
          });
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === "error") {
          setCapture({ status: "failed", errorMsg: data.errorMsg || "Error en transcripción" });
          if (pollRef.current) clearInterval(pollRef.current);
        }
        // si sigue 'queued' o 'processing', el siguiente tick lo chequea
      } catch (e: any) {
        setCapture({ status: "failed", errorMsg: e.message || "Error de red" });
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [capture.status, capture.transcribeJobId, setCapture]);

  function stopAll() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    analyserRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
  }

  async function startRecording() {
    chunksRef.current = [];
    if (capture.audioUrl) {
      URL.revokeObjectURL(capture.audioUrl);
    }
    setCapture({ audioUrl: null, audioBlob: null, utterances: [], errorMsg: null });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e: any) {
      let msg = "No se pudo acceder al micrófono";
      if (e.name === "NotAllowedError") msg = "Permiso de micrófono denegado";
      else if (e.name === "NotFoundError") msg = "No se detectó ningún micrófono";
      else if (e.name === "NotReadableError") msg = "El micrófono está siendo usado por otra app";
      setCapture({ status: "failed", errorMsg: msg });
      return;
    }

    streamRef.current = stream;

    const mimeOptions = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    let mimeType = "";
    for (const m of mimeOptions) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
        mimeType = m;
        break;
      }
    }

    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (e: any) {
      setCapture({ status: "failed", errorMsg: "MediaRecorder no soportado: " + e.message });
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      setCapture({ audioBlob: blob, audioUrl: url, status: "idle" });
      stopLevelMeter();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    recorder.onerror = (e: any) => {
      setCapture({ status: "failed", errorMsg: "Error en grabación: " + (e.error?.name || "") });
    };
    mediaRecorderRef.current = recorder;

    recorder.start(1000);
    startLevelMeter(stream);
    const startedAt = Date.now();
    setCapture({ status: "recording", startTime: startedAt, elapsed: 0 });
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function startLevelMeter(stream: MediaStream) {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        setAudioLevel(Math.min(100, (avg / 128) * 100));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {}
  }

  function stopLevelMeter() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    analyserRef.current = null;
    setAudioLevel(0);
  }

  // Upload del audio directo a AssemblyAI con barra de progreso (XHR para
  // que upload.onprogress funcione — fetch no expone progreso de upload).
  function uploadDirectToAssemblyAI(blob: Blob, apiKey: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://api.assemblyai.com/v2/upload");
      xhr.setRequestHeader("authorization", apiKey);
      xhr.setRequestHeader("content-type", "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (!data.upload_url) {
              reject(new Error("AssemblyAI no devolvio upload_url"));
              return;
            }
            resolve(data.upload_url as string);
          } catch (e: any) {
            reject(new Error("Respuesta invalida de AssemblyAI: " + e.message));
          }
        } else {
          reject(new Error(`AssemblyAI ${xhr.status}: ${xhr.responseText || xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error("Error de red subiendo a AssemblyAI"));
      xhr.ontimeout = () => reject(new Error("Timeout subiendo a AssemblyAI"));
      xhr.send(blob);
    });
  }

  async function transcribe() {
    if (!capture.audioBlob) {
      alert("Primero grabá el audio");
      return;
    }
    setCapture({ status: "uploading", errorMsg: null, utterances: [] });
    setUploadProgress(0);

    try {
      // 1) Obtener API key de AssemblyAI desde el server (origin checked)
      const keyRes = await fetch("/api/aai-key");
      if (!keyRes.ok) {
        const err = await keyRes.json().catch(() => ({}));
        throw new Error(err.error || "No se pudo obtener token de AssemblyAI");
      }
      const { key } = await keyRes.json();
      if (!key) throw new Error("API key de AssemblyAI vacia");

      // 2) Subir audio directo a AssemblyAI (bypass del limite 4.5 MB de Vercel)
      const uploadUrl = await uploadDirectToAssemblyAI(capture.audioBlob, key);

      // 3) Pedirle al server que cree el transcript (solo JSON con la URL)
      const exp = participants.filter((p) => p.attended).length;
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadUrl,
          language: "es",
          ...(exp > 0 ? { speakers_expected: exp } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCapture({
        status: "transcribing",
        transcribeJobId: data.jobId,
      });
      setUploadProgress(0);
    } catch (e: any) {
      setCapture({ status: "failed", errorMsg: e.message || "Error subiendo audio" });
      setUploadProgress(0);
    }
  }

  function downloadAudio() {
    if (!capture.audioBlob || !capture.audioUrl) return;
    const ext = capture.audioBlob.type.includes("mp4") ? "m4a"
              : capture.audioBlob.type.includes("ogg") ? "ogg" : "webm";
    const a = document.createElement("a");
    a.href = capture.audioUrl;
    a.download = `reunion_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function loadSample() {
    // Cargar utterances de ejemplo para probar sin API
    const sample: Utterance[] = [
      { speaker: "A", text: "Buenos días a todos. Abrimos el comité con la revisión de caja. Diego, ¿cómo venimos con las certificaciones de abril?", start: 0, end: 8000, confidence: 0.95 },
      { speaker: "B", text: "Tenemos un atraso en la certificación de Migraciones. Se decide acelerar la certificación con cliente para esta semana. Florencia tiene que coordinar con Servicios el diferimiento de pagos a proveedores no críticos.", start: 8500, end: 22000, confidence: 0.93 },
      { speaker: "C", text: "Hay un riesgo importante: el dashboard de avance de obras está desactualizado. Eso compromete el forecast. Pedro tiene que actualizarlo antes del 29 de abril.", start: 22500, end: 35000, confidence: 0.94 },
      { speaker: "A", text: "Es crítico. Marcelo, también necesitamos avanzar con la revisión del proceso de selección de jornalizados, hubo 74 salidas en marzo. Hablalo con RRHH.", start: 35500, end: 48000, confidence: 0.92 },
      { speaker: "D", text: "Una duda: ¿el stop de pagos aplica a todos los proveedores o hay excepciones?", start: 48500, end: 55000, confidence: 0.96 },
      { speaker: "A", text: "Hay excepciones, pero las tenemos que definir. Florencia, armá el listado de proveedores críticos para el viernes.", start: 55500, end: 65000, confidence: 0.94 },
      { speaker: "B", text: "Sobre el portfolio de prospectos, todavía no tengo los números cerrados. Lo presento en la próxima reunión.", start: 65500, end: 75000, confidence: 0.93 },
      { speaker: "C", text: "Bien, próxima reunión miércoles 29. Cierro la minuta y la circulo.", start: 75500, end: 82000, confidence: 0.95 },
    ];
    setCapture({ status: "transcribed", utterances: sample, errorMsg: null });
  }

  const handleNext = () => {
    if (capture.utterances.length === 0 && !capture.manualNotes.trim()) {
      return alert("Necesitás transcribir el audio o agregar notas manuales");
    }
    markDone("capture");
    onNext();
  };

  const fmt = (s: number) => {
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${ss}`;
  };

  const stateLbl = {
    idle: { txt: "Esperando", color: "" },
    recording: { txt: "Grabando", color: "text-kir-rojo" },
    uploading: { txt: "Subiendo audio", color: "text-kir-amber" },
    transcribing: { txt: "Transcribiendo + diarizando", color: "text-kir-amber" },
    transcribed: { txt: "Transcripción lista", color: "text-kir-teal" },
    failed: { txt: "Error", color: "text-kir-rojo" },
  }[capture.status];

  const speakersFound = Array.from(new Set(capture.utterances.map((u) => u.speaker))).sort();

  return (
    <>
      <SectionHead
        eyebrow="Stage B.01 · Reunión activa"
        title="Captura + diarización"
        subtitle="Grabá la reunión completa. Al terminar, el audio se sube a AssemblyAI y se transcribe automáticamente con identificación de hablantes (speaker A, B, C…). En la próxima pantalla los mapeás a tus participantes."
        meta={{ num: "B.01", label: "FOG · Captura" }}
      />

      {capture.errorMsg && (
        <Alert variant="warn" title="Error">
          {capture.errorMsg}
        </Alert>
      )}

      <div className="grid grid-cols-[320px_1fr] gap-6">
        {/* CONTROLES */}
        <div className="bg-white border border-kir-negro p-6">
          <div className="font-display uppercase text-kir-gris mb-2" style={{ fontSize: 11, letterSpacing: "0.22em" }}>
            Estado del micrófono
          </div>
          <div
            className={`font-display font-black uppercase mb-6 ${stateLbl.color}`}
            style={{ fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            {stateLbl.txt}
          </div>

          <div
            className="font-mono border border-kir-negro px-4 py-3 text-center mb-4 bg-kir-gris-papel"
            style={{ fontSize: 32, letterSpacing: "0.04em" }}
          >
            {fmt(capture.status === "recording" ? elapsed : Math.floor((capture.audioBlob ? elapsed : 0)))}
          </div>

          {capture.status === "recording" && (
            <div className="mb-4">
              <div className="font-display uppercase text-kir-gris mb-1.5 flex items-center gap-1.5" style={{ fontSize: 10, letterSpacing: "0.22em" }}>
                <Chev kind="single" />
                Nivel de audio
              </div>
              <div className="h-2 bg-kir-gris-papel border border-kir-gris-border relative overflow-hidden">
                <div
                  className="h-full bg-kir-teal transition-all"
                  style={{ width: `${audioLevel}%`, transitionDuration: "80ms" }}
                />
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.webm,.mp3,.m4a,.mp4,.ogg,.wav,.flac"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />

          <div className="flex flex-col gap-2">
            {(capture.status === "idle" || capture.status === "failed") && !capture.audioBlob && (
              <>
                <Button variant="primary" onClick={startRecording}>
                  Iniciar grabación <Chev className="text-white" />
                </Button>
                <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                  Subir archivo de audio <Chev />
                </Button>
              </>
            )}
            {capture.status === "recording" && (
              <Button variant="danger" onClick={stopRecording}>
                Detener grabación
              </Button>
            )}
            {(capture.status === "idle" || capture.status === "failed") && capture.audioBlob && (
              <>
                <Button variant="primary" onClick={transcribe}>
                  Transcribir con AssemblyAI <Chev className="text-white" />
                </Button>
                <Button variant="ghost" onClick={startRecording}>
                  Grabar de nuevo
                </Button>
                <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                  Subir otro archivo
                </Button>
              </>
            )}
            {capture.status === "uploading" && (
              <div className="text-kir-gris text-sm">
                <div className="kir-blink mb-2">»» Subiendo audio a AssemblyAI…</div>
                <div className="h-2 bg-kir-gris-papel border border-kir-gris-border relative overflow-hidden mb-1">
                  <div
                    className="h-full bg-kir-teal transition-all"
                    style={{ width: `${uploadProgress}%`, transitionDuration: "200ms" }}
                  />
                </div>
                <div className="font-mono text-xs text-kir-negro">{uploadProgress}%</div>
                <div className="text-xs mt-2">
                  Audio enviado directo desde tu browser a AssemblyAI (sin pasar por el servidor de la app). Cuando termine, arranca la transcripción.
                </div>
              </div>
            )}
            {capture.status === "transcribing" && (
              <div className="text-kir-gris text-sm">
                <div className="kir-blink">»» Transcribiendo + diarizando…</div>
                <div className="text-xs mt-2">
                  La diarización puede tardar entre 30 segundos y unos minutos según la duración del audio.
                </div>
              </div>
            )}
          </div>

          {capture.audioUrl && (
            <div className="mt-4 pt-4 border-t border-kir-gris-border">
              <div className="font-display uppercase text-kir-gris mb-2 flex items-center gap-1.5" style={{ fontSize: 10, letterSpacing: "0.22em" }}>
                <Chev /> Audio grabado
              </div>
              <audio controls src={capture.audioUrl} className="w-full border border-kir-gris-border" />
              <button
                onClick={downloadAudio}
                className="mt-2 w-full text-center font-display font-bold uppercase border border-kir-gris-border py-2 hover:bg-kir-negro hover:text-white transition-colors"
                style={{ fontSize: 10, letterSpacing: "0.18em" }}
              >
                Descargar audio »»
              </button>
            </div>
          )}

          <div className="mt-5 pt-5 border-t border-kir-gris-border text-xs text-kir-gris leading-relaxed">
            La grabación se almacena solo durante el proceso de transcripción. El audio se sube a AssemblyAI (US-East) que lo procesa y devuelve la transcripción diarizada en español.
          </div>
        </div>

        {/* TRANSCRIPCIÓN / NOTAS */}
        <div className="bg-white border border-kir-negro flex flex-col min-h-[500px]">
          <div className="flex border-b border-kir-negro">
            <div
              className="px-5 py-3 font-display font-bold uppercase text-kir-negro border-r border-kir-gris-border bg-white"
              style={{ fontSize: 10, letterSpacing: "0.22em" }}
            >
              Transcripción {capture.utterances.length > 0 && <span className="text-kir-teal font-mono ml-1.5">{capture.utterances.length}</span>}
            </div>
            <div className="flex-1 flex justify-end items-center px-4 gap-3">
              {speakersFound.length > 0 && (
                <div className="font-display uppercase text-kir-gris flex gap-2 items-center" style={{ fontSize: 10, letterSpacing: "0.18em" }}>
                  <Chev /> Voces detectadas:
                  {speakersFound.map((s) => (
                    <Tag key={s} variant="teal">{s}</Tag>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            {capture.utterances.length === 0 ? (
              <div className="text-center text-kir-gris italic py-20 px-6">
                {capture.status === "idle" && "Grabá la reunión para ver acá la transcripción diarizada."}
                {(capture.status === "uploading" || capture.status === "transcribing") &&
                  "Procesando audio… esta pantalla se actualiza sola cuando termina."}
                {capture.status === "failed" && "Error en transcripción. Revisá la configuración del servidor o probá de nuevo."}
              </div>
            ) : (
              <div className="space-y-3">
                {capture.utterances.map((u, i) => (
                  <div key={i} className="grid grid-cols-[80px_60px_1fr] gap-3 items-start text-sm border-b border-kir-gris-border pb-3">
                    <div className="font-mono text-xs text-kir-gris">{fmtMs(u.start)}</div>
                    <Tag variant="solid">{u.speaker}</Tag>
                    <div className="text-kir-negro">{u.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-kir-negro p-4">
            <div className="font-display uppercase text-kir-gris mb-2 flex items-center gap-1.5" style={{ fontSize: 10, letterSpacing: "0.22em" }}>
              <Chev /> Notas manuales (opcional)
            </div>
            <textarea
              className="kir-input min-h-[80px] resize-y"
              placeholder="Notas adicionales del facilitador. Se suman al transcript en el análisis."
              value={capture.manualNotes}
              onChange={(e) => setCapture({ manualNotes: e.target.value })}
            />
          </div>
        </div>
      </div>

      <Actions
        left={
          <>
            <Button variant="ghost" onClick={onBack}>«« Volver</Button>
            <Button variant="ghost" size="sm" onClick={loadSample}>
              Cargar transcripción de ejemplo
            </Button>
          </>
        }
        right={
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={capture.utterances.length === 0 && !capture.manualNotes.trim()}
          >
            {capture.utterances.length > 0 ? "Mapear voces" : "Saltar a análisis"} <Chev className="text-white" />
          </Button>
        }
      />
    </>
  );
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
