import type { AtelierDocument } from "@a-company/atelier-types";
import { serializeAtelier } from "@a-company/atelier-schema";

export class YamlPanel {
  readonly el: HTMLElement;
  private pre: HTMLPreElement;
  private copyBtn: HTMLButtonElement;
  private doc: AtelierDocument | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "atel-yaml-panel";

    // Header with copy button
    const header = document.createElement("div");
    header.className = "atel-panel-header";

    const label = document.createElement("span");
    label.textContent = "YAML Source";

    this.copyBtn = document.createElement("button");
    this.copyBtn.className = "atel-yaml-copy-btn";
    this.copyBtn.textContent = "Copy";
    this.copyBtn.addEventListener("click", () => this.copyToClipboard());

    header.appendChild(label);
    header.appendChild(this.copyBtn);
    this.el.appendChild(header);

    // Content
    const content = document.createElement("div");
    content.className = "atel-yaml-content";
    this.pre = document.createElement("pre");
    content.appendChild(this.pre);
    this.el.appendChild(content);

    parent.appendChild(this.el);
  }

  loadDocument(doc: AtelierDocument): void {
    this.doc = doc;
    this.refresh();
  }

  refresh(): void {
    if (!this.doc) {
      this.pre.innerHTML = "";
      return;
    }
    const yaml = serializeAtelier(this.doc);
    this.pre.innerHTML = highlightYaml(yaml);
  }

  private async copyToClipboard(): Promise<void> {
    if (!this.doc) return;
    const yaml = serializeAtelier(this.doc);
    try {
      await navigator.clipboard.writeText(yaml);
      const orig = this.copyBtn.textContent;
      this.copyBtn.textContent = "Copied!";
      setTimeout(() => { this.copyBtn.textContent = orig; }, 1500);
    } catch {
      // Fallback: select text
      const range = document.createRange();
      range.selectNodeContents(this.pre);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }
}

/** Simple YAML syntax highlighter — no external dependencies */
function highlightYaml(yaml: string): string {
  return yaml
    .split("\n")
    .map((line) => highlightLine(line))
    .join("\n");
}

function highlightLine(line: string): string {
  // Comment
  if (line.trimStart().startsWith("#")) {
    return `<span class="atel-yaml-comment">${esc(line)}</span>`;
  }

  // Key: value pairs
  const kvMatch = line.match(/^(\s*)(- )?([^:]+?)(:)(.*)/);
  if (kvMatch) {
    const [, indent, dash, key, colon, rest] = kvMatch;
    let result = esc(indent);
    if (dash) result += `<span class="atel-yaml-dash">- </span>`;
    result += `<span class="atel-yaml-key">${esc(key)}</span>`;
    result += `<span class="atel-yaml-colon">:</span>`;
    result += highlightValue(rest);
    return result;
  }

  // List item without key
  const listMatch = line.match(/^(\s*)(- )(.*)/);
  if (listMatch) {
    const [, indent, dash, val] = listMatch;
    return esc(indent) + `<span class="atel-yaml-dash">${esc(dash)}</span>` + highlightValue(val);
  }

  return esc(line);
}

function highlightValue(val: string): string {
  const trimmed = val.trim();
  if (!trimmed) return esc(val);

  // Inline string
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return ` <span class="atel-yaml-string">${esc(trimmed)}</span>`;
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return ` <span class="atel-yaml-number">${esc(trimmed)}</span>`;
  }

  // Boolean
  if (trimmed === "true" || trimmed === "false") {
    return ` <span class="atel-yaml-bool">${esc(trimmed)}</span>`;
  }

  // Null
  if (trimmed === "null" || trimmed === "~") {
    return ` <span class="atel-yaml-null">${esc(trimmed)}</span>`;
  }

  // Unquoted string value
  return ` <span class="atel-yaml-string">${esc(trimmed)}</span>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
