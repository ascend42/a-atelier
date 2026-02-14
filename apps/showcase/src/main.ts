import { AtelierStudio } from "@atelier/studio";
import "@atelier/studio/styles.css";
import { themes, type Theme, type ThemeName } from "./themes.js";
import { examples, type Example } from "./examples/index.js";
import "./styles.css";

// State
let currentTheme: ThemeName = "branded";
let currentExample: Example = examples[0].items[0];
let studio: AtelierStudio | null = null;

// Apply theme to CSS custom properties
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--bg-secondary", theme.bgSecondary);
  root.style.setProperty("--bg-tertiary", theme.bgTertiary);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--text-muted", theme.textMuted);
  root.style.setProperty("--text-accent", theme.textAccent);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--button-bg", theme.buttonBg);
  root.style.setProperty("--button-hover", theme.buttonHover);
  root.style.setProperty("--button-active", theme.buttonActive);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-hover", theme.accentHover);
  root.style.setProperty("--slider-track", theme.sliderTrack);
  root.style.setProperty("--slider-thumb", theme.sliderThumb);
  root.style.setProperty("--font-family", theme.fontFamily);
  root.style.setProperty("--font-mono", theme.fontMono);
  root.style.setProperty("--canvas-shadow", theme.canvasShadow);
  root.style.setProperty("--sidebar-item-hover", theme.sidebarItemHover);
  root.style.setProperty("--sidebar-item-active", theme.sidebarItemActive);
  root.style.setProperty("--category-bg", theme.categoryBg);
  root.style.setProperty("--category-text", theme.categoryText);
}

// Build the DOM
function buildApp(): void {
  const app = document.getElementById("app")!;
  app.innerHTML = "";
  if (studio) { studio.destroy(); studio = null; }

  // Header
  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <div style="display:flex;align-items:center">
      <span class="header__title">ATELIER</span>
      <span class="header__subtitle">Animation Showcase</span>
    </div>
    <div class="header__actions">
      <div class="theme-toggle">
        <button class="theme-toggle__btn ${currentTheme === 'minimal' ? 'theme-toggle__btn--active' : ''}" data-theme="minimal">Minimal</button>
        <button class="theme-toggle__btn ${currentTheme === 'branded' ? 'theme-toggle__btn--active' : ''}" data-theme="branded">Branded</button>
      </div>
    </div>
  `;
  app.appendChild(header);

  // Theme toggle handler
  header.querySelectorAll(".theme-toggle__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTheme = (btn as HTMLElement).dataset.theme as ThemeName;
      applyTheme(themes[currentTheme]);
      buildApp();
    });
  });

  // Sidebar
  const sidebar = document.createElement("div");
  sidebar.className = "sidebar";

  for (const category of examples) {
    const cat = document.createElement("div");
    cat.className = "sidebar__category";
    cat.innerHTML = `<div class="sidebar__category-label">${category.name}</div>`;

    for (const example of category.items) {
      const item = document.createElement("div");
      item.className = `sidebar__item ${example.id === currentExample.id ? 'sidebar__item--active' : ''}`;
      item.innerHTML = `<span class="sidebar__item-icon">${category.icon}</span> ${example.name}`;
      item.addEventListener("click", () => {
        selectExample(example);
      });
      cat.appendChild(item);
    }

    sidebar.appendChild(cat);
  }
  app.appendChild(sidebar);

  // Main — always studio
  const main = document.createElement("div");
  main.className = "main main--studio";

  const studioContainer = document.createElement("div");
  studioContainer.className = "studio-container";
  main.appendChild(studioContainer);
  app.appendChild(main);

  const doc = currentExample.create();

  studio = new AtelierStudio(studioContainer, {
    mode: "compact",
    initialTab: "yaml",
    allowSave: false,
  });
  studio.setTheme(themes[currentTheme]);
  studio.loadDocument(doc);

  // Keyboard
  document.onkeydown = (e) => {
    if (e.code === "Space") {
      e.preventDefault();
    }
  };
}

function selectExample(example: Example): void {
  currentExample = example;
  buildApp();
}

// Boot
applyTheme(themes[currentTheme]);
buildApp();
