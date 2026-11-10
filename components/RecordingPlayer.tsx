"use client";

import { useCallback, useRef, useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";

/**
 * Reproductor de grabaciones con barra de progreso PROPIA (§14.1). El control
 * nativo <audio controls> no pinta la barra con streams por rangos en todos los
 * navegadores (sobre todo con WAV de telefonía a 16 kHz): la duración queda en
 * 0:00 y el progreso no avanza. Este componente maneja currentTime/duration
 * explícitamente y pinta una barra <input type="range"> que también permite
 * retroceder/avanzar (seek).
 */
export function RecordingPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => setError(true));
    } else {
      a.pause();
    }
  }, []);

  const seek = useCallback((value: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration)) return;
    a.currentTime = value;
    setCurrent(value);
  }, []);

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const max = Number.isFinite(duration) && duration > 0 ? duration : 0;

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        preload="metadata"
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          setReady(true);
        }}
        onError={() => setError(true)}
        className="hidden"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!ready && !error}
          className="btn btn-primary btn-sm w-9 h-9 shrink-0 flex items-center justify-center rounded-full p-0"
          aria-label={playing ? "Pausar" : "Reproducir"}
        >
          {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </button>
        <input
          type="range"
          min={0}
          max={max || 0}
          step={0.1}
          value={Math.min(current, max || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!ready || error}
          className="w-full accent-brand-600"
          aria-label="Progreso de la grabación"
        />
        <span className="text-xs tabular-nums text-surface-700 shrink-0">
          {fmt(current)} / {ready ? fmt(duration) : "—"}
        </span>
      </div>
      {error && <p className="text-xs error-text">No se pudo reproducir la grabación.</p>}
    </div>
  );
}