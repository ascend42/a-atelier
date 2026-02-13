export interface SpringConfig {
  mass?: number; // default 1
  stiffness?: number; // default 100
  damping?: number; // default 10
  velocity?: number; // default 0
}

/**
 * Creates a spring easing function.
 * Uses damped harmonic oscillator physics.
 * Returns a function that takes t (0-1) and returns the spring value.
 *
 * The spring always goes from 0 to 1, but may overshoot.
 */
export function spring(config: SpringConfig = {}): (t: number) => number {
  const {
    mass = 1,
    stiffness = 100,
    damping = 10,
    velocity = 0,
  } = config;

  const w0 = Math.sqrt(stiffness / mass); // natural frequency
  const zeta = damping / (2 * Math.sqrt(stiffness * mass)); // damping ratio

  // Determine total duration to normalize t
  // We pre-calculate a reasonable duration where the spring settles
  const duration = estimateSettleTime(zeta, w0);

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    const time = t * duration;
    let value: number;

    if (zeta < 1) {
      // Underdamped
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const A = 1;
      const B = (zeta * w0 + velocity) / wd;
      value =
        1 -
        Math.exp(-zeta * w0 * time) *
          (A * Math.cos(wd * time) + B * Math.sin(wd * time));
    } else if (zeta === 1) {
      // Critically damped
      value = 1 - Math.exp(-w0 * time) * (1 + (w0 + velocity) * time);
    } else {
      // Overdamped
      const s1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
      const s2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
      const A = (velocity - s2) / (s1 - s2);
      const B = 1 - A;
      value = 1 - A * Math.exp(s1 * time) - B * Math.exp(s2 * time);
    }

    return value;
  };
}

/**
 * Estimates the time for a spring to settle within 0.1% of target.
 */
function estimateSettleTime(zeta: number, w0: number): number {
  if (zeta >= 1) {
    return 10 / (zeta * w0);
  }
  // For underdamped: settling ~ -ln(0.001) / (zeta * w0)
  return Math.log(1000) / (zeta * w0);
}
