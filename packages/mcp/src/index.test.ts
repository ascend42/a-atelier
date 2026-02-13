import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, DocumentStore } from "./index.js";

// ─── Helpers ──────────────────────────────────────────────────

/** Connect a Client to our MCP server via in-memory transport */
async function setup() {
  const { server, store } = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server, store };
}

/** Call a tool and parse the JSON response */
async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  try {
    return { ...JSON.parse(text), _isError: result.isError ?? false };
  } catch {
    // For raw text responses (like YAML export)
    return { _raw: text, _isError: result.isError ?? false };
  }
}

// ─── Store Unit Tests ─────────────────────────────────────────

describe("DocumentStore", () => {
  let store: DocumentStore;

  beforeEach(() => {
    store = new DocumentStore();
  });

  it("creates and retrieves a document", () => {
    const doc = {
      version: "1.0",
      name: "test",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    const id = store.create(doc);
    expect(store.has(id)).toBe(true);
    expect(store.get(id)).toBe(doc);
  });

  it("creates with custom ID", () => {
    const doc = {
      version: "1.0",
      name: "test",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    const id = store.create(doc, "my-id");
    expect(id).toBe("my-id");
    expect(store.get("my-id")).toBe(doc);
  });

  it("rejects duplicate IDs", () => {
    const doc = {
      version: "1.0",
      name: "test",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    store.create(doc, "dup");
    expect(() => store.create(doc, "dup")).toThrow("already exists");
  });

  it("deletes a document", () => {
    const doc = {
      version: "1.0",
      name: "test",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    const id = store.create(doc);
    expect(store.delete(id)).toBe(true);
    expect(store.has(id)).toBe(false);
    expect(store.delete(id)).toBe(false);
  });

  it("lists all documents", () => {
    const doc1 = {
      version: "1.0",
      name: "first",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    const doc2 = {
      version: "1.0",
      name: "second",
      canvas: { width: 200, height: 200, fps: 60 },
      layers: [],
      states: {},
    };
    store.create(doc1, "a");
    store.create(doc2, "b");
    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("first");
    expect(list[1].name).toBe("second");
  });

  it("clears all documents", () => {
    const doc = {
      version: "1.0",
      name: "test",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    store.create(doc, "a");
    store.create({ ...doc, name: "b" }, "b");
    store.clear();
    expect(store.list()).toHaveLength(0);
  });
});

// ─── MCP Tool Integration Tests ──────────────────────────────

describe("MCP Tools", () => {
  let client: Client;
  let store: DocumentStore;

  beforeEach(async () => {
    const s = await setup();
    client = s.client;
    store = s.store;
  });

  // ── Tool listing ──────────────────────────────────────────

  it("lists all registered tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map(t => t.name);

    expect(toolNames).toContain("atelier_create");
    expect(toolNames).toContain("atelier_info");
    expect(toolNames).toContain("atelier_load");
    expect(toolNames).toContain("atelier_export");
    expect(toolNames).toContain("atelier_list");
    expect(toolNames).toContain("atelier_add_layer");
    expect(toolNames).toContain("atelier_edit_layer");
    expect(toolNames).toContain("atelier_remove_layer");
    expect(toolNames).toContain("atelier_list_layers");
    expect(toolNames).toContain("atelier_reorder");
    expect(toolNames).toContain("atelier_set_shape");
    expect(toolNames).toContain("atelier_set_fill");
    expect(toolNames).toContain("atelier_set_stroke");
    expect(toolNames).toContain("atelier_add_state");
    expect(toolNames).toContain("atelier_edit_state");
    expect(toolNames).toContain("atelier_remove_state");
    expect(toolNames).toContain("atelier_list_states");
    expect(toolNames).toContain("atelier_add_delta");
    expect(toolNames).toContain("atelier_edit_delta");
    expect(toolNames).toContain("atelier_remove_delta");
    expect(toolNames).toContain("atelier_apply_preset");
    expect(toolNames).toContain("atelier_define_preset");
    expect(toolNames).toContain("atelier_list_presets");
    expect(toolNames).toContain("atelier_validate");
    expect(toolNames).toContain("atelier_preview");
  });

  // ── Document tools ────────────────────────────────────────

  describe("document tools", () => {
    it("atelier_create creates a document", async () => {
      const result = await callTool(client, "atelier_create", {
        name: "My Animation",
        width: 1080,
        height: 1080,
        fps: 30,
        background: "#000000",
      });

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.name).toBe("My Animation");
      expect(result.canvas.width).toBe(1080);
      expect(result.canvas.fps).toBe(30);
    });

    it("atelier_info returns document summary", async () => {
      const create = await callTool(client, "atelier_create", {
        name: "Test",
        width: 100,
        height: 100,
        fps: 30,
      });

      const info = await callTool(client, "atelier_info", { id: create.id });
      expect(info.success).toBe(true);
      expect(info.name).toBe("Test");
      expect(info.layerCount).toBe(0);
      expect(info.stateNames).toEqual([]);
    });

    it("atelier_info returns error for nonexistent doc", async () => {
      const result = await callTool(client, "atelier_info", { id: "nonexistent" });
      expect(result.error).toContain("not found");
      expect(result._isError).toBe(true);
    });

    it("atelier_list lists all documents", async () => {
      await callTool(client, "atelier_create", { name: "A", width: 100, height: 100, fps: 30 });
      await callTool(client, "atelier_create", { name: "B", width: 200, height: 200, fps: 60 });

      const result = await callTool(client, "atelier_list");
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });

    it("atelier_export and atelier_load round-trip", async () => {
      const create = await callTool(client, "atelier_create", {
        name: "Export Test",
        width: 100,
        height: 100,
        fps: 30,
      });

      const exportResult = await client.callTool({ name: "atelier_export", arguments: { id: create.id } });
      const yaml = (exportResult.content as Array<{ type: string; text: string }>)[0].text;
      expect(yaml).toContain("Export Test");
      expect(yaml).toContain("version:");

      // Load it back with a new ID
      const loadResult = await callTool(client, "atelier_load", {
        id: "reloaded",
        yaml,
      });
      expect(loadResult.success).toBe(true);
      expect(loadResult.id).toBe("reloaded");
    });
  });

  // ── Layer tools ───────────────────────────────────────────

  describe("layer tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "Layer Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      docId = result.id;
    });

    it("atelier_add_layer adds a layer", async () => {
      const result = await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });

      expect(result.success).toBe(true);
      expect(result.layerId).toBe("rect");
      expect(result.index).toBe(0);
    });

    it("atelier_add_layer rejects duplicate IDs", async () => {
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 100, height: 100,
      });

      const result = await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 50, y: 50, width: 50, height: 50,
      });

      expect(result.error).toContain("already exists");
    });

    it("atelier_edit_layer modifies a layer", async () => {
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 100, height: 100,
      });

      const result = await callTool(client, "atelier_edit_layer", {
        id: docId,
        layerId: "rect",
        x: 50,
        opacity: 0.5,
      });

      expect(result.success).toBe(true);

      const doc = store.get(docId)!;
      expect(doc.layers[0].frame.x).toBe(50);
      expect(doc.layers[0].opacity).toBe(0.5);
    });

    it("atelier_list_layers returns all layers", async () => {
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "bg",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 100, height: 100,
        description: "Background",
      });
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "title",
        visual: { type: "text", content: "Hello", style: { fontFamily: "sans-serif", fontSize: 24, color: "#000" } },
        x: 10, y: 10, width: 80, height: 20,
      });

      const result = await callTool(client, "atelier_list_layers", { id: docId });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.layers[0].id).toBe("bg");
      expect(result.layers[1].id).toBe("title");
    });

    it("atelier_remove_layer removes a layer with warnings", async () => {
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 100, height: 100,
      });

      // Add a state with a delta referencing this layer
      await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 30 });
      await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
      });

      const result = await callTool(client, "atelier_remove_layer", { id: docId, layerId: "rect" });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("intro");
    });

    it("atelier_reorder moves a layer", async () => {
      await callTool(client, "atelier_add_layer", {
        id: docId, layerId: "a",
        visual: { type: "group" }, x: 0, y: 0, width: 10, height: 10,
      });
      await callTool(client, "atelier_add_layer", {
        id: docId, layerId: "b",
        visual: { type: "group" }, x: 0, y: 0, width: 10, height: 10,
      });
      await callTool(client, "atelier_add_layer", {
        id: docId, layerId: "c",
        visual: { type: "group" }, x: 0, y: 0, width: 10, height: 10,
      });

      // Move "a" to position 2
      const result = await callTool(client, "atelier_reorder", {
        id: docId, layerId: "a", position: 2,
      });
      expect(result.success).toBe(true);

      const doc = store.get(docId)!;
      expect(doc.layers.map(l => l.id)).toEqual(["b", "c", "a"]);
    });
  });

  // ── Shape tools ───────────────────────────────────────────

  describe("shape tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "Shape Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      docId = result.id;
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 100, height: 100,
      });
    });

    it("atelier_set_shape changes the shape", async () => {
      const result = await callTool(client, "atelier_set_shape", {
        id: docId,
        layerId: "rect",
        shape: { type: "ellipse" },
      });
      expect(result.success).toBe(true);

      const doc = store.get(docId)!;
      expect((doc.layers[0].visual as any).shape.type).toBe("ellipse");
    });

    it("atelier_set_fill sets a solid fill", async () => {
      const result = await callTool(client, "atelier_set_fill", {
        id: docId,
        layerId: "rect",
        fill: { type: "solid", color: "#FF0000" },
      });
      expect(result.success).toBe(true);

      const doc = store.get(docId)!;
      expect((doc.layers[0].visual as any).fill.type).toBe("solid");
      expect((doc.layers[0].visual as any).fill.color).toBe("#FF0000");
    });

    it("atelier_set_stroke sets stroke properties", async () => {
      const result = await callTool(client, "atelier_set_stroke", {
        id: docId,
        layerId: "rect",
        stroke: { color: "#000000", width: 2, lineCap: "round" },
      });
      expect(result.success).toBe(true);

      const doc = store.get(docId)!;
      expect((doc.layers[0].visual as any).stroke.width).toBe(2);
    });

    it("shape tools reject non-shape layers", async () => {
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "group",
        visual: { type: "group" },
        x: 0, y: 0, width: 10, height: 10,
      });

      const result = await callTool(client, "atelier_set_shape", {
        id: docId,
        layerId: "group",
        shape: { type: "rect" },
      });
      expect(result.error).toContain("not \"shape\"");
    });
  });

  // ── State tools ───────────────────────────────────────────

  describe("state tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "State Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      docId = result.id;
    });

    it("atelier_add_state creates a state", async () => {
      const result = await callTool(client, "atelier_add_state", {
        id: docId,
        stateName: "intro",
        duration: 60,
        description: "Intro animation",
      });
      expect(result.success).toBe(true);
      expect(result.stateName).toBe("intro");
    });

    it("atelier_add_state rejects duplicates", async () => {
      await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 60 });
      const result = await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 30 });
      expect(result.error).toContain("already exists");
    });

    it("atelier_edit_state updates metadata", async () => {
      await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 60 });

      const result = await callTool(client, "atelier_edit_state", {
        id: docId,
        stateName: "intro",
        duration: 90,
        description: "Updated intro",
      });
      expect(result.success).toBe(true);

      const doc = store.get(docId)!;
      expect(doc.states.intro.duration).toBe(90);
      expect(doc.states.intro.description).toBe("Updated intro");
    });

    it("atelier_remove_state removes state and its deltas", async () => {
      await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 30 });
      await callTool(client, "atelier_add_layer", {
        id: docId, layerId: "bg",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 100, height: 100,
      });
      await callTool(client, "atelier_add_delta", {
        id: docId, stateName: "intro", layer: "bg",
        property: "opacity", range: [0, 30], from: 0, to: 1,
      });

      const result = await callTool(client, "atelier_remove_state", { id: docId, stateName: "intro" });
      expect(result.success).toBe(true);
      expect(result.deltasRemoved).toBe(1);

      const doc = store.get(docId)!;
      expect(doc.states.intro).toBeUndefined();
    });

    it("atelier_list_states returns state summaries", async () => {
      await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 30 });
      await callTool(client, "atelier_add_state", { id: docId, stateName: "hover", duration: 15 });

      const result = await callTool(client, "atelier_list_states", { id: docId });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  // ── Delta tools ───────────────────────────────────────────

  describe("delta tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "Delta Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      docId = result.id;

      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 100, height: 100,
      });
      await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 60 });
    });

    it("atelier_add_delta adds a delta", async () => {
      const result = await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
      });
      expect(result.success).toBe(true);
      expect(result.deltaIndex).toBe(0);
    });

    it("atelier_add_delta rejects nonexistent layer", async () => {
      const result = await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "missing",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
      });
      expect(result.error).toContain("not found");
    });

    it("atelier_add_delta rejects overlapping deltas", async () => {
      await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
      });

      const result = await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "opacity",
        range: [15, 45],
        from: 0.5,
        to: 0,
      });
      expect(result.error).toContain("Overlapping");
    });

    it("atelier_add_delta allows different properties", async () => {
      await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
      });

      const result = await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "rotation",
        range: [0, 30],
        from: 0,
        to: 360,
      });
      expect(result.success).toBe(true);
    });

    it("atelier_add_delta supports easing", async () => {
      const result = await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
        easing: "ease-in-out",
      });
      expect(result.success).toBe(true);

      const doc = store.get(docId)!;
      expect(doc.states.intro.deltas[0].easing).toBe("ease-in-out");
    });

    it("atelier_edit_delta modifies a delta", async () => {
      await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
      });

      const result = await callTool(client, "atelier_edit_delta", {
        id: docId,
        stateName: "intro",
        deltaIndex: 0,
        to: 0.8,
        easing: "ease-out",
      });
      expect(result.success).toBe(true);

      const doc = store.get(docId)!;
      expect(doc.states.intro.deltas[0].to).toBe(0.8);
      expect(doc.states.intro.deltas[0].easing).toBe("ease-out");
    });

    it("atelier_remove_delta removes a delta", async () => {
      await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
      });

      const result = await callTool(client, "atelier_remove_delta", {
        id: docId,
        stateName: "intro",
        deltaIndex: 0,
      });
      expect(result.success).toBe(true);
      expect(result.remainingDeltas).toBe(0);
    });

    it("atelier_apply_preset expands preset into deltas", async () => {
      // Define a preset
      await callTool(client, "atelier_define_preset", {
        id: docId,
        presetName: "fade-in",
        description: "Simple fade in",
        deltas: [
          { property: "opacity", from: 0, to: 1 },
        ],
      });

      // Apply it
      const result = await callTool(client, "atelier_apply_preset", {
        id: docId,
        stateName: "intro",
        presetName: "fade-in",
        layerId: "rect",
        startFrame: 0,
        duration: 30,
      });
      expect(result.success).toBe(true);
      expect(result.deltasAdded).toBe(1);

      const doc = store.get(docId)!;
      expect(doc.states.intro.deltas).toHaveLength(1);
      expect(doc.states.intro.deltas[0].layer).toBe("rect");
      expect(doc.states.intro.deltas[0].property).toBe("opacity");
      expect(doc.states.intro.deltas[0].range).toEqual([0, 30]);
    });
  });

  // ── Preset tools ──────────────────────────────────────────

  describe("preset tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "Preset Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      docId = result.id;
    });

    it("atelier_define_preset creates a preset", async () => {
      const result = await callTool(client, "atelier_define_preset", {
        id: docId,
        presetName: "slide-in",
        description: "Slide in from left",
        deltas: [
          { property: "frame.x", from: -100, to: 0 },
          { property: "opacity", from: 0, to: 1 },
        ],
      });
      expect(result.success).toBe(true);
      expect(result.deltaCount).toBe(2);
    });

    it("atelier_list_presets returns presets", async () => {
      await callTool(client, "atelier_define_preset", {
        id: docId,
        presetName: "fade-in",
        deltas: [{ property: "opacity", from: 0, to: 1 }],
      });
      await callTool(client, "atelier_define_preset", {
        id: docId,
        presetName: "slide-in",
        deltas: [{ property: "frame.x", from: -100, to: 0 }],
      });

      const result = await callTool(client, "atelier_list_presets", { id: docId });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  // ── Preview tools ─────────────────────────────────────────

  describe("preview tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "Preview Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      docId = result.id;

      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 100, height: 100,
        opacity: 0,
      });

      await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 30 });

      await callTool(client, "atelier_add_delta", {
        id: docId,
        stateName: "intro",
        layer: "rect",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
      });
    });

    it("atelier_validate passes for a valid document", async () => {
      const result = await callTool(client, "atelier_validate", { id: docId });
      expect(result.success).toBe(true);
      expect(result.valid).toBe(true);
    });

    it("atelier_preview resolves frame at start", async () => {
      const result = await callTool(client, "atelier_preview", {
        id: docId,
        stateName: "intro",
        frame: 0,
      });

      expect(result.success).toBe(true);
      expect(result.frame).toBe(0);
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].id).toBe("rect");
      expect(result.layers[0].computedProperties.opacity).toBe(0);
    });

    it("atelier_preview resolves frame at midpoint", async () => {
      const result = await callTool(client, "atelier_preview", {
        id: docId,
        stateName: "intro",
        frame: 15,
      });

      expect(result.success).toBe(true);
      expect(result.layers[0].computedProperties.opacity).toBeCloseTo(0.5, 1);
    });

    it("atelier_preview resolves frame at end", async () => {
      const result = await callTool(client, "atelier_preview", {
        id: docId,
        stateName: "intro",
        frame: 30,
      });

      expect(result.success).toBe(true);
      expect(result.layers[0].computedProperties.opacity).toBe(1);
    });

    it("atelier_preview errors for nonexistent state", async () => {
      const result = await callTool(client, "atelier_preview", {
        id: docId,
        stateName: "nonexistent",
        frame: 0,
      });
      expect(result.error).toContain("not found");
    });
  });

  // ── Full Workflow ─────────────────────────────────────────

  describe("full workflow", () => {
    it("create -> add layers -> add state -> add deltas -> validate -> preview", async () => {
      // 1. Create document
      const doc = await callTool(client, "atelier_create", {
        name: "Full Workflow",
        width: 1080,
        height: 1080,
        fps: 60,
        background: "#FFFFFF",
        description: "End-to-end test",
      });
      expect(doc.success).toBe(true);
      const id = doc.id;

      // 2. Add layers
      const bg = await callTool(client, "atelier_add_layer", {
        id,
        layerId: "background",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 1080, height: 1080,
        description: "Background rectangle",
      });
      expect(bg.success).toBe(true);

      await callTool(client, "atelier_set_fill", {
        id,
        layerId: "background",
        fill: { type: "solid", color: "#3498db" },
      });

      const title = await callTool(client, "atelier_add_layer", {
        id,
        layerId: "title",
        visual: { type: "text", content: "Hello World", style: { fontFamily: "sans-serif", fontSize: 48, color: "#FFFFFF" } },
        x: 100, y: 400, width: 880, height: 100,
        opacity: 0,
      });
      expect(title.success).toBe(true);

      // 3. Add state
      const state = await callTool(client, "atelier_add_state", {
        id,
        stateName: "intro",
        duration: 90,
        description: "Intro animation with fade + slide",
      });
      expect(state.success).toBe(true);

      // 4. Add deltas
      const fadeIn = await callTool(client, "atelier_add_delta", {
        id,
        stateName: "intro",
        layer: "title",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
        easing: "ease-out",
        description: "Fade in title",
      });
      expect(fadeIn.success).toBe(true);

      const slideUp = await callTool(client, "atelier_add_delta", {
        id,
        stateName: "intro",
        layer: "title",
        property: "frame.y",
        range: [0, 30],
        from: 450,
        to: 400,
        easing: "ease-out",
        description: "Slide title up",
      });
      expect(slideUp.success).toBe(true);

      // 5. Validate
      const validation = await callTool(client, "atelier_validate", { id });
      expect(validation.success).toBe(true);
      expect(validation.valid).toBe(true);

      // 6. Preview at different frames
      const frameStart = await callTool(client, "atelier_preview", { id, stateName: "intro", frame: 0 });
      expect(frameStart.layers).toHaveLength(2);
      const titleAtStart = frameStart.layers.find((l: any) => l.id === "title");
      expect(titleAtStart.computedProperties.opacity).toBe(0);
      expect(titleAtStart.computedProperties["frame.y"]).toBe(450);

      const frameMid = await callTool(client, "atelier_preview", { id, stateName: "intro", frame: 30 });
      const titleAtEnd = frameMid.layers.find((l: any) => l.id === "title");
      expect(titleAtEnd.computedProperties.opacity).toBe(1);
      expect(titleAtEnd.computedProperties["frame.y"]).toBe(400);

      // 7. Export and verify
      const exportResult = await client.callTool({ name: "atelier_export", arguments: { id } });
      const yaml = (exportResult.content as Array<{ type: string; text: string }>)[0].text;
      expect(yaml).toContain("Full Workflow");
      expect(yaml).toContain("intro");
      expect(yaml).toContain("title");

      // 8. Get info
      const info = await callTool(client, "atelier_info", { id });
      expect(info.layerCount).toBe(2);
      expect(info.stateNames).toEqual(["intro"]);
      expect(info.totalDuration).toBe(90);
    });
  });
});
