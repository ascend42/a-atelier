import React, { useEffect } from "react";
import type { AtelierDocument } from "@a-company/atelier-types";
import { useAnimation, type UseAnimationOptions } from "./useAnimation.js";

export interface AnimationProps extends UseAnimationOptions {
  /** The Atelier document to render */
  document: AtelierDocument;
  /** Canvas width (defaults to document canvas width) */
  width?: number;
  /** Canvas height (defaults to document canvas height) */
  height?: number;
  /** Initial state to play */
  initialState?: string;
  /** Called when the active state changes */
  onStateChange?: (state: string) => void;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

/**
 * React component for rendering Atelier animations.
 * Creates a canvas element and manages playback automatically.
 */
export function Animation({
  document: doc,
  width,
  height,
  autoplay = true,
  loop = false,
  initialState,
  onFrame,
  onComplete,
  onStateChange,
  className,
  style,
}: AnimationProps): React.JSX.Element {
  const canvasWidth = width ?? doc.canvas.width;
  const canvasHeight = height ?? doc.canvas.height;

  const { canvasRef } = useAnimation(doc, {
    autoplay,
    loop,
    onFrame,
    onComplete,
  });

  // Handle initial state
  useEffect(() => {
    if (initialState && onStateChange) {
      onStateChange(initialState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialState]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      className={className}
      style={style}
    />
  );
}
