'use client';

import * as React from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface Props {
  src: string;
  poster?: string;
  /** Auto-hide controls dopo inattività (ms). Default 2500. */
  hideDelayMs?: number;
}

/**
 * Player video custom: niente controlli nativi del browser.
 * Tap centro = play/pause. Bottom bar = scrubber + tempo + mute + fullscreen.
 * Su mobile (iOS): playsInline + muted-by-default per evitare politiche autoplay.
 * Controlli auto-hidden durante riproduzione, riappaiono al touch.
 */
export function VideoPlayer({ src, poster, hideDelayMs = 2500 }: Props) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [time, setTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [buffered, setBuffered] = React.useState(0);
  const [showControls, setShowControls] = React.useState(true);
  const [fullscreen, setFullscreen] = React.useState(false);

  // Ricorda volume + lazy load
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setTime(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onProgress = () => {
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1));
      }
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('progress', onProgress);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('progress', onProgress);
    };
  }, []);

  const resetHideTimer = React.useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, hideDelayMs);
  }, [hideDelayMs]);

  React.useEffect(() => {
    if (playing) resetHideTimer();
    else setShowControls(true);
  }, [playing, resetHideTimer]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const toggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    resetHideTimer();
  };

  const toggleFullscreen = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      try {
        await el.requestFullscreen();
        setFullscreen(true);
      } catch {}
    } else {
      try {
        await document.exitFullscreen();
        setFullscreen(false);
      } catch {}
    }
  };

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    resetHideTimer();
  };

  const onPointerActivity = () => resetHideTimer();

  const progressPct = duration ? (time / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center bg-black"
      onPointerMove={onPointerActivity}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        className="max-h-full max-w-full"
      />

      {/* Center play overlay (visibile quando paused) */}
      {!playing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          className="absolute inset-0 flex items-center justify-center"
          aria-label="Play"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/30 transition-transform hover:scale-105 active:scale-95">
            <Play className="h-9 w-9 translate-x-0.5 fill-white text-white" />
          </span>
        </button>
      )}

      {/* Bottom controls bar */}
      <div
        className={
          'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-10 transition-opacity duration-300 ' +
          (showControls ? 'opacity-100' : 'opacity-0')
        }
      >
        {/* Scrubber */}
        <div
          className="pointer-events-auto group/scrub relative mb-2 h-1.5 cursor-pointer rounded-full bg-white/20"
          onPointerDown={seek}
        >
          {/* Buffered */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/30"
            style={{ width: `${bufferedPct}%` }}
          />
          {/* Played */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white"
            style={{ width: `${progressPct}%` }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/scrub:opacity-100"
            style={{ left: `${progressPct}%` }}
          />
        </div>

        {/* Buttons row */}
        <div className="pointer-events-auto flex items-center justify-between text-white">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label={playing ? 'Pausa' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-white/90">
            {formatTime(time)} <span className="text-white/50">/</span> {formatTime(duration)}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-full p-2 hover:bg-white/10"
              aria-label={muted ? 'Riattiva audio' : 'Silenzia'}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-full p-2 hover:bg-white/10"
              aria-label={fullscreen ? 'Esci da schermo intero' : 'Schermo intero'}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
