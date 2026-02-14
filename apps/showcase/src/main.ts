import { resolveFrame } from "@atelier/core";
import { renderFrame } from "@atelier/canvas";
import { AtelierStudio, type StudioView } from "@atelier/studio";
import { Player } from "./player.js";
import { themes, type Theme, type ThemeName } from "./themes.js";
import { examples, type Example } from "./examples/index.js";
import "./styles.css";

// State
let currentTheme: ThemeName = "branded";
let currentExample: Example = examples[0].items[0];
let currentView: "preview" | "studio" = "preview";
let studioView: StudioView = "yaml";
let player: Player | null = null;
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
  if (player) { player.destroy(); player = null; }

  // Header
  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <div style="display:flex;align-items:center">
      <span class="header__title">ATELIER</span>
      <span class="header__subtitle">Animation Showcase</span>
    </div>
    <div class="header__actions">
      <div class="view-toggle">
        <button class="view-toggle__btn ${currentView === 'preview' ? 'view-toggle__btn--active' : ''}" data-view="preview">\u25B6 Preview</button>
        <button class="view-toggle__btn ${currentView === 'studio' && studioView === 'yaml' ? 'view-toggle__btn--active' : ''}" data-view="yaml">{ } YAML</button>
        <button class="view-toggle__btn ${currentView === 'studio' && studioView === 'editor' ? 'view-toggle__btn--active' : ''}" data-view="editor">\u270E Editor</button>
      </div>
      <div class="theme-toggle">
        <button class="theme-toggle__btn ${currentTheme === 'minimal' ? 'theme-toggle__btn--active' : ''}" data-theme="minimal">Minimal</button>
        <button class="theme-toggle__btn ${currentTheme === 'branded' ? 'theme-toggle__btn--active' : ''}" data-theme="branded">Branded</button>
      </div>
    </div>
  `;
  app.appendChild(header);

  // View toggle handler
  header.querySelectorAll(".view-toggle__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = (btn as HTMLElement).dataset.view!;
      if (view === "preview") {
        currentView = "preview";
      } else {
        currentView = "studio";
        studioView = view as StudioView;
      }
      buildApp();
    });
  });

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

  // Main
  const main = document.createElement("div");
  main.className = "main";

  const doc = currentExample.create();

  if (currentView === "studio") {
    // Studio mode: embed the studio widget
    main.classList.add("main--studio");
    const studioContainer = document.createElement("div");
    studioContainer.className = "studio-container";
    main.appendChild(studioContainer);
    app.appendChild(main);

    studio = new AtelierStudio(studioContainer, {
      mode: "compact",
      initialView: studioView,
      allowSave: false,
    });
    studio.setTheme(themes[currentTheme]);
    studio.loadDocument(doc);
  } else {
    // Preview mode: original behavior
    const canvasWrapper = document.createElement("div");
    canvasWrapper.className = "canvas-wrapper";
    const canvas = document.createElement("canvas");
    canvas.width = doc.canvas.width;
    canvas.height = doc.canvas.height;

    const maxWidth = 600;
    if (doc.canvas.width > maxWidth) {
      const scale = maxWidth / doc.canvas.width;
      canvas.style.width = `${doc.canvas.width * scale}px`;
      canvas.style.height = `${doc.canvas.height * scale}px`;
    }

    canvasWrapper.appendChild(canvas);
    main.appendChild(canvasWrapper);

    // Description
    if (currentExample.description) {
      const desc = document.createElement("div");
      desc.className = "description";
      desc.textContent = currentExample.description;
      main.appendChild(desc);
    }

    // Controls
    const controls = document.createElement("div");
    controls.className = "controls";

    const playBtn = document.createElement("button");
    playBtn.className = "controls__play";
    playBtn.textContent = "\u25B6";

    const scrubber = document.createElement("input");
    scrubber.type = "range";
    scrubber.className = "controls__scrubber";
    scrubber.min = "0";

    const frameDisplay = document.createElement("span");
    frameDisplay.className = "controls__frame";

    controls.appendChild(playBtn);
    controls.appendChild(scrubber);
    controls.appendChild(frameDisplay);
    main.appendChild(controls);

    // Info
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = `
      <span class="info__badge">${currentExample.category}</span>
      <span>${doc.canvas.width}x${doc.canvas.height} @ ${doc.canvas.fps}fps</span>
      <span>${doc.layers.length} layers</span>
    `;
    main.appendChild(info);

    app.appendChild(main);

    // Setup player
    const ctx = canvas.getContext("2d")!;
    const stateName = Object.keys(doc.states)[0];
    const state = doc.states[stateName];
    const totalFrames = state.duration;
    scrubber.max = String(totalFrames - 1);
    scrubber.value = "0";

    function renderAt(frame: number): void {
      const resolved = resolveFrame(doc, stateName, frame);
      renderFrame(ctx as any, resolved, doc);
      scrubber.value = String(frame);
      frameDisplay.textContent = `${frame} / ${totalFrames - 1}`;
    }

    renderAt(0);

    player = new Player(doc.canvas.fps, totalFrames, renderAt, true);

    playBtn.addEventListener("click", () => {
      player!.toggle();
      playBtn.textContent = player!.isPlaying ? "\u275A\u275A" : "\u25B6";
    });

    let wasPlaying = false;
    scrubber.addEventListener("mousedown", () => {
      wasPlaying = player!.isPlaying;
      player!.pause();
      playBtn.textContent = "\u25B6";
    });
    scrubber.addEventListener("input", () => {
      player!.seek(Number(scrubber.value));
    });
    scrubber.addEventListener("mouseup", () => {
      if (wasPlaying) {
        player!.play();
        playBtn.textContent = "\u275A\u275A";
      }
    });

    player.play();
    playBtn.textContent = "\u275A\u275A";
  }

  // Keyboard
  document.onkeydown = (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (player) {
        player.toggle();
      }
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
