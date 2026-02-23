import { createDemoAnimation } from "./demo.js";
import { Player } from "./player.js";
import { resolveFrame } from "@a-company/atelier-core";
import { renderFrame } from "@a-company/atelier-canvas";
import "./styles.css";

// --- Build the demo document ---
const doc = createDemoAnimation();
const stateName = Object.keys(doc.states)[0];
const totalFrames = doc.states[stateName].duration;

// --- Create app container ---
const app = document.getElementById("app")!;

// Header
const header = document.createElement("h1");
header.textContent = `${doc.name} — Playground`;
app.appendChild(header);

// Canvas
const canvas = document.createElement("canvas");
canvas.width = doc.canvas.width;
canvas.height = doc.canvas.height;
app.appendChild(canvas);

const ctx = canvas.getContext("2d")!;

// Controls bar
const controls = document.createElement("div");
controls.className = "controls";

const playBtn = document.createElement("button");
playBtn.className = "btn-play";
playBtn.textContent = "\u25B6";
playBtn.title = "Play / Pause (Space)";

const scrubber = document.createElement("input");
scrubber.className = "scrubber";
scrubber.type = "range";
scrubber.min = "0";
scrubber.max = String(totalFrames - 1);
scrubber.value = "0";

const frameInfo = document.createElement("span");
frameInfo.className = "frame-info";

controls.appendChild(playBtn);
controls.appendChild(scrubber);
controls.appendChild(frameInfo);
app.appendChild(controls);

// State info
const stateInfo = document.createElement("div");
stateInfo.className = "state-info";
app.appendChild(stateInfo);

// --- Rendering ---
function renderCurrentFrame(frame: number): void {
  const resolved = resolveFrame(doc, stateName, frame);
  renderFrame(ctx, resolved, doc);
  updateUI(frame);
}

function updateUI(frame: number): void {
  scrubber.value = String(frame);
  frameInfo.textContent = `Frame ${frame} / ${totalFrames - 1}  (${(frame / doc.canvas.fps).toFixed(2)}s)`;
  stateInfo.textContent = `State: ${stateName}  |  ${doc.canvas.fps} fps  |  ${(totalFrames / doc.canvas.fps).toFixed(1)}s duration`;
}

// --- Player ---
const player = new Player(doc.canvas.fps, totalFrames, renderCurrentFrame, true);

// --- Controls wiring ---
playBtn.addEventListener("click", () => {
  player.toggle();
  playBtn.textContent = player.isPlaying ? "\u23F8" : "\u25B6";
});

scrubber.addEventListener("input", () => {
  const wasPaused = !player.isPlaying;
  player.pause();
  player.seek(Number(scrubber.value));
  playBtn.textContent = "\u25B6";
  if (!wasPaused) {
    // If the user scrubs while playing, keep playing from new position
    player.play();
    playBtn.textContent = "\u23F8";
  }
});

// Keyboard shortcut: Space to toggle play/pause
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target === document.body) {
    e.preventDefault();
    player.toggle();
    playBtn.textContent = player.isPlaying ? "\u23F8" : "\u25B6";
  }
});

// --- Initial render ---
renderCurrentFrame(0);
