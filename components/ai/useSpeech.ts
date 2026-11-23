"use client";

// Hook voix de l'assistant Orbs (côté navigateur).
//
// Trois responsabilités, isolées de l'UI :
//   1. Enregistrer le micro (appuyer pour parler) → `startRecording` /
//      `stopAndTranscribe` / `cancelRecording`.
//   2. Transcrire l'audio via /api/ai/voice/transcribe (voix → texte).
//   3. Lire une réponse à voix haute via /api/ai/voice/speak (texte → voix),
//      avec `speak(id, texte, voix)` / `stopSpeaking`.
//
// Tout est pensé « app » (web + PWA + coque native) : on n'utilise que des API
// web standard (getUserMedia, MediaRecorder, Audio), compatibles avec un
// empaquetage Capacitor. Aucun secret ne transite par le client.

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceId } from "@/lib/ai/voices";

/** Formats d'enregistrement tentés, du plus au moins compatible. */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/mpeg",
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const c of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* certains navigateurs lèvent : on continue */
    }
  }
  return undefined;
}

/** Nettoie un Markdown pour qu'il soit lu naturellement (pas « astérisque »). */
function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // blocs de code
    .replace(/`([^`]+)`/g, "$1") // code en ligne
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // liens → libellé
    .replace(/^#{1,6}\s+/gm, "") // titres
    .replace(/^\s*>\s?/gm, "") // citations
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1") // gras/italique/barré
    .replace(/^\s*[-*+]\s+/gm, "") // puces
    .replace(/^\s*\d+\.\s+/gm, "") // listes numérotées
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type SpeechError = {
  message: string;
  /** `true` si l'élève a refusé l'accès au micro (message d'aide dédié). */
  denied?: boolean;
} | null;

export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [error, setError] = useState<SpeechError>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Support détecté après montage (évite tout décalage d'hydratation SSR).
  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      !!pickMime();
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setSupported(ok);
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // ---- Enregistrement ----
  const startRecording = useCallback(async () => {
    if (recorderRef.current || transcribing) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      const denied = name === "NotAllowedError" || name === "SecurityError";
      setError({
        denied,
        message: denied
          ? "Micro bloqué. Autorise le micro dans les réglages pour parler à l'assistant."
          : "Micro indisponible. Vérifie qu'un micro est branché et réessaie.",
      });
      return;
    }

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError({ message: "Enregistrement non supporté sur cet appareil." });
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || mime || "audio/webm";
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type })
        : null;
      chunksRef.current = [];
      recorderRef.current = null;
      releaseStream();
      stopResolveRef.current?.(blob);
      stopResolveRef.current = null;
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
  }, [transcribing, releaseStream]);

  /** Attend la fin de l'enregistrement et renvoie le Blob (ou null). */
  const finishRecording = useCallback((): Promise<Blob | null> => {
    const rec = recorderRef.current;
    if (!rec) return Promise.resolve(null);
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }, []);

  /** Annule sans transcrire (jette l'audio). */
  const cancelRecording = useCallback(() => {
    const rec = recorderRef.current;
    setRecording(false);
    // Débloque un éventuel `stopAndTranscribe` en attente (renvoie null).
    stopResolveRef.current?.(null);
    stopResolveRef.current = null;
    if (!rec) {
      releaseStream();
      return;
    }
    chunksRef.current = [];
    recorderRef.current = null;
    try {
      rec.onstop = null;
      rec.stop();
    } catch {
      /* ignore */
    }
    releaseStream();
  }, [releaseStream]);

  /**
   * Arrête l'enregistrement puis transcrit. Renvoie le texte, ou `null` si
   * rien n'a été capté / en cas d'erreur (l'erreur est alors exposée).
   */
  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (!recorderRef.current) return null;
    setRecording(false);
    const blob = await finishRecording();
    if (!blob || blob.size === 0) {
      setError({ message: "Je n'ai rien entendu. Réessaie en parlant près du micro." });
      return null;
    }
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "voix");
      const res = await fetch("/api/ai/voice/transcribe", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as
        | { text?: string; message?: string }
        | null;
      if (!res.ok) {
        setError({ message: data?.message ?? "La reconnaissance vocale a échoué. Réessaie." });
        return null;
      }
      const text = (data?.text ?? "").trim();
      if (!text) {
        setError({ message: "Je n'ai rien compris. Réessaie en parlant plus distinctement." });
        return null;
      }
      return text;
    } catch {
      setError({ message: "Connexion interrompue pendant la transcription. Réessaie." });
      return null;
    } finally {
      setTranscribing(false);
    }
  }, [finishRecording]);

  // ---- Lecture à voix haute ----
  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    async (id: string, markdown: string, voice: VoiceId) => {
      const text = speechText(markdown);
      if (!text) return;
      stopSpeaking();
      setError(null);
      setSpeakingId(id);
      try {
        const res = await fetch("/api/ai/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.slice(0, 4000), voice }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { message?: string } | null;
          setError({ message: data?.message ?? "Lecture vocale impossible pour le moment." });
          setSpeakingId(null);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audio.addEventListener("ended", () => {
          if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
          }
          setSpeakingId((cur) => (cur === id ? null : cur));
        });
        audioRef.current = audio;
        await audio.play();
      } catch {
        setError({ message: "Lecture vocale interrompue. Réessaie." });
        setSpeakingId(null);
      }
    },
    [stopSpeaking],
  );

  // Nettoyage au démontage.
  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      releaseStream();
      const a = audioRef.current;
      if (a) a.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, [releaseStream]);

  return {
    supported,
    recording,
    transcribing,
    speakingId,
    error,
    clearError,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
    speak,
    stopSpeaking,
  };
}
