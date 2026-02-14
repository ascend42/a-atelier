export interface Theme {
  name: string;
  // App chrome
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  text: string;
  textMuted: string;
  textAccent: string;
  border: string;
  // Interactive
  buttonBg: string;
  buttonHover: string;
  buttonActive: string;
  // Accent
  accent: string;
  accentHover: string;
  // Slider
  sliderTrack: string;
  sliderThumb: string;
  // Fonts
  fontFamily: string;
  fontMono: string;
  // Canvas
  canvasShadow: string;
  // Sidebar
  sidebarItemHover: string;
  sidebarItemActive: string;
  // Category badge
  categoryBg: string;
  categoryText: string;
}

export const minimal: Theme = {
  name: "Minimal",
  bg: "#0a0a0a",
  bgSecondary: "#111111",
  bgTertiary: "#1a1a1a",
  text: "#c0c0c0",
  textMuted: "#666666",
  textAccent: "#ffffff",
  border: "#222222",
  buttonBg: "#1a1a1a",
  buttonHover: "#252525",
  buttonActive: "#333333",
  accent: "#888888",
  accentHover: "#aaaaaa",
  sliderTrack: "#333333",
  sliderThumb: "#888888",
  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontMono: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
  canvasShadow: "0 0 40px rgba(0,0,0,0.5)",
  sidebarItemHover: "#1a1a1a",
  sidebarItemActive: "#222222",
  categoryBg: "#1a1a1a",
  categoryText: "#666666",
};

export const branded: Theme = {
  name: "Branded",
  bg: "#0d1117",
  bgSecondary: "#161b22",
  bgTertiary: "#21262d",
  text: "#c9d1d9",
  textMuted: "#8b949e",
  textAccent: "#f0f6fc",
  border: "#30363d",
  buttonBg: "#21262d",
  buttonHover: "#30363d",
  buttonActive: "#484f58",
  accent: "#e94560",
  accentHover: "#ff6b81",
  sliderTrack: "#30363d",
  sliderThumb: "#e94560",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "'SF Mono', 'Fira Code', monospace",
  canvasShadow: "0 4px 60px rgba(233, 69, 96, 0.15), 0 0 40px rgba(0,0,0,0.4)",
  sidebarItemHover: "#1c2028",
  sidebarItemActive: "#e945601a",
  categoryBg: "#e945601a",
  categoryText: "#e94560",
};

export const themes = { minimal, branded };
export type ThemeName = keyof typeof themes;
