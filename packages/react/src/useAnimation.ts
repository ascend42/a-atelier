import { useRef, useEffect, useState, useCallback } from "react";
import type { AtelierDocument } from "@a-company/atelier-types";
import { AnimationPlayer } from "./player.js";

export interface UseAnimationOptions {
  autoplay?: boolean;
  loop?: boolean;
  onFrame?: (frame: number) => void;
  onComplete?: () => void;
}

export interface UseAnimationReturn {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  play: () => void;
  pause: () => void;
  seek: (frame: number) => void;
  currentFrame: number;
  isPlaying: boolean;
  duration: number;
}

/**
 * Hook for controlling Atelier animation playback on a canvas element.
 */
export function useAnimation(
  doc: AtelierDocument | null,
  opts: UseAnimationOptions = {},
): UseAnimationReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<AnimationPlayer | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(opts.autoplay !== false);

  // Create/destroy player when doc or canvas changes
  useEffect(() => {
    if (!doc || !canvasRef.current) return;

    const player = new AnimationPlayer(doc, canvasRef.current, {
      autoplay: opts.autoplay,
      loop: opts.loop,
      onFrame: (frame) => {
        setCurrentFrame(frame);
        opts.onFrame?.(frame);
      },
      onComplete: () => {
        setIsPlaying(false);
        opts.onComplete?.();
      },
    });

    playerRef.current = player;
    setIsPlaying(player.isPlaying);

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const play = useCallback(() => {
    playerRef.current?.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const seek = useCallback((frame: number) => {
    playerRef.current?.seek(frame);
    setCurrentFrame(frame);
  }, []);

  const duration = doc ? Object.values(doc.states)[0]?.duration ?? 0 : 0;

  return {
    canvasRef,
    play,
    pause,
    seek,
    currentFrame,
    isPlaying,
    duration,
  };
}
