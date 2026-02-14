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
  accent: "#A89F95",
  accentHover: "#C4BAB0",
  sliderTrack: "#4A4A4A",
  sliderThumb: "#A89F95",
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontMono: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
  canvasShadow: "0 0 40px rgba(0,0,0,0.5)",
  sidebarItemHover: "#333333",
  sidebarItemActive: "#3D3D3D",
  categoryBg: "#3D3D3D",
  categoryText: "#A89F95",
};

export const branded: Theme = {
  name: "Branded",
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
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontMono: "'SF Mono', 'Fira Code', monospace",
  canvasShadow: "0 4px 60px rgba(199, 91, 57, 0.12), 0 0 40px rgba(0,0,0,0.4)",
  sidebarItemHover: "#363636",
  sidebarItemActive: "#C75B3920",
  categoryBg: "#C75B3920",
  categoryText: "#C75B39",
};

export const themes = { minimal, branded };
export type ThemeName = keyof typeof themes;
