export interface StudioTheme {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  text: string;
  textMuted: string;
  textAccent: string;
  border: string;
  buttonBg: string;
  buttonHover: string;
  buttonActive: string;
  accent: string;
  accentHover: string;
  sliderTrack: string;
  sliderThumb: string;
  fontFamily: string;
  fontMono: string;
  canvasShadow: string;
}

export const defaultTheme: StudioTheme = {
  bg: "#2C2C2C",
  bgSecondary: "#333333",
  bgTertiary: "#3D3D3D",
  text: "#F5F0EB",
  textMuted: "#A89F95",
  textAccent: "#F5F0EB",
  border: "#4A4A4A",
  buttonBg: "#3D3D3D",
  buttonHover: "#4A4A4A",
  buttonActive: "#555555",
  accent: "#C75B39",
  accentHover: "#D4724E",
  sliderTrack: "#4A4A4A",
  sliderThumb: "#C75B39",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "'SF Mono', 'Fira Code', monospace",
  canvasShadow: "0 4px 60px rgba(199, 91, 57, 0.12), 0 0 40px rgba(0,0,0,0.4)",
};

export function applyStudioTheme(container: HTMLElement, theme: StudioTheme): void {
  const s = container.style;
  s.setProperty("--atel-bg", theme.bg);
  s.setProperty("--atel-bg-secondary", theme.bgSecondary);
  s.setProperty("--atel-bg-tertiary", theme.bgTertiary);
  s.setProperty("--atel-text", theme.text);
  s.setProperty("--atel-text-muted", theme.textMuted);
  s.setProperty("--atel-text-accent", theme.textAccent);
  s.setProperty("--atel-border", theme.border);
  s.setProperty("--atel-button-bg", theme.buttonBg);
  s.setProperty("--atel-button-hover", theme.buttonHover);
  s.setProperty("--atel-button-active", theme.buttonActive);
  s.setProperty("--atel-accent", theme.accent);
  s.setProperty("--atel-accent-hover", theme.accentHover);
  s.setProperty("--atel-slider-track", theme.sliderTrack);
  s.setProperty("--atel-slider-thumb", theme.sliderThumb);
  s.setProperty("--atel-font-family", theme.fontFamily);
  s.setProperty("--atel-font-mono", theme.fontMono);
  s.setProperty("--atel-canvas-shadow", theme.canvasShadow);
}
