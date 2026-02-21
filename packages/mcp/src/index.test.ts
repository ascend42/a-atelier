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
    expect(toolNames).toContain("atelier_instantiate_template");
    expect(toolNames).toContain("atelier_find_variables");
    // M9 tools
    expect(toolNames).toContain("atelier_set_blend_mode");
    expect(toolNames).toContain("atelier_set_shadow");
    expect(toolNames).toContain("atelier_set_motion_path");
    expect(toolNames).toContain("atelier_set_clip_path");
    expect(toolNames).toContain("atelier_edit_visual");
    expect(toolNames).toContain("atelier_set_audio");
    expect(toolNames).toContain("atelier_configure_transition");
    expect(toolNames).toContain("atelier_set_state_parent");
    expect(toolNames).toContain("atelier_export_svg");
    expect(toolNames).toContain("atelier_export_lottie");
    // M10 tools
    expect(toolNames).toContain("atelier_add_asset");
    expect(toolNames).toContain("atelier_list_assets");
    expect(toolNames).toContain("atelier_remove_asset");
    // M11 tools
    expect(toolNames).toContain("atelier_add_variable");
    expect(toolNames).toContain("atelier_list_variables");
    expect(toolNames).toContain("atelier_remove_variable");
    expect(toolNames).toHaveLength(43);
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

  // ── Template tools ─────────────────────────────────────────

  describe("template tools", () => {
    let templateId: string;

    beforeEach(async () => {
      // Create a document with variables (template)
      const create = await callTool(client, "atelier_create", {
        name: "Template Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      templateId = create.id;

      // Manually set up the template with variables via the store
      const doc = store.get(templateId)!;
      doc.name = "{{title}}";
      doc.variables = {
        title: { type: "string", description: "Animation title" },
        color: { type: "color", default: "#000000" },
      };
      doc.layers = [
        {
          id: "text",
          visual: {
            type: "text" as const,
            content: "Hello {{title}}",
            style: { fontFamily: "sans-serif", fontSize: 24, color: "{{color}}" },
          },
          frame: { x: 0, y: 0 },
          bounds: { width: 100, height: 100 },
        },
      ];
    });

    it("atelier_instantiate_template creates a new document", async () => {
      const result = await callTool(client, "atelier_instantiate_template", {
        id: templateId,
        bindings: { title: "My Animation", color: "#FF0000" },
      });

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.name).toBe("My Animation");

      // Verify the new document
      const newDoc = store.get(result.id)!;
      expect(newDoc.name).toBe("My Animation");
      expect(newDoc.variables).toBeUndefined();
      const visual = newDoc.layers[0].visual as { content: string; style: { color: string } };
      expect(visual.content).toBe("Hello My Animation");
      expect(visual.style.color).toBe("#FF0000");
    });

    it("atelier_instantiate_template uses defaults", async () => {
      const result = await callTool(client, "atelier_instantiate_template", {
        id: templateId,
        bindings: { title: "Test" },
      });

      expect(result.success).toBe(true);
      const newDoc = store.get(result.id)!;
      const visual = newDoc.layers[0].visual as { style: { color: string } };
      expect(visual.style.color).toBe("#000000");
    });

    it("atelier_instantiate_template returns errors for missing required vars", async () => {
      const result = await callTool(client, "atelier_instantiate_template", {
        id: templateId,
        bindings: {},
      });

      expect(result._isError).toBe(true);
      expect(result.error).toContain("title");
    });

    it("atelier_instantiate_template returns error for nonexistent doc", async () => {
      const result = await callTool(client, "atelier_instantiate_template", {
        id: "nonexistent",
        bindings: { title: "Test" },
      });

      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });

    it("atelier_find_variables scans for variable patterns", async () => {
      const result = await callTool(client, "atelier_find_variables", {
        id: templateId,
      });

      expect(result.success).toBe(true);
      expect(result.variables).toContain("title");
      expect(result.variables).toContain("color");
      expect(result.declared).toContain("title");
      expect(result.declared).toContain("color");
    });

    it("atelier_find_variables identifies undeclared variables", async () => {
      // Add an undeclared variable reference
      const doc = store.get(templateId)!;
      doc.description = "Uses {{undeclared}}";

      const result = await callTool(client, "atelier_find_variables", {
        id: templateId,
      });

      expect(result.success).toBe(true);
      expect(result.undeclared).toContain("undeclared");
    });

    it("atelier_find_variables returns error for nonexistent doc", async () => {
      const result = await callTool(client, "atelier_find_variables", {
        id: "nonexistent",
      });

      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });
  });

  // ── Layer effect tools ─────────────────────────────────────

  describe("layer effect tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "Effect Test",
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
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "title",
        visual: { type: "text", content: "Hello", style: { fontFamily: "sans-serif", fontSize: 24, color: "#000" } },
        x: 10, y: 10, width: 80, height: 20,
      });
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "img",
        visual: { type: "image", assetId: "photo" },
        x: 0, y: 0, width: 50, height: 50,
      });
    });

    it("atelier_set_blend_mode sets multiply", async () => {
      const result = await callTool(client, "atelier_set_blend_mode", {
        id: docId, layerId: "rect", blendMode: "multiply",
      });
      expect(result.success).toBe(true);
      expect(result.blendMode).toBe("multiply");
      expect(store.get(docId)!.layers[0].blendMode).toBe("multiply");
    });

    it("atelier_set_blend_mode clears with null", async () => {
      await callTool(client, "atelier_set_blend_mode", { id: docId, layerId: "rect", blendMode: "screen" });
      const result = await callTool(client, "atelier_set_blend_mode", { id: docId, layerId: "rect", blendMode: null });
      expect(result.success).toBe(true);
      expect(result.cleared).toBe(true);
      expect(store.get(docId)!.layers[0].blendMode).toBeUndefined();
    });

    it("atelier_set_blend_mode errors on nonexistent layer", async () => {
      const result = await callTool(client, "atelier_set_blend_mode", { id: docId, layerId: "missing", blendMode: "overlay" });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });

    it("atelier_set_shadow sets shadow", async () => {
      const result = await callTool(client, "atelier_set_shadow", {
        id: docId, layerId: "rect",
        shadow: { color: "#000000", blur: 10, offsetX: 2, offsetY: 4 },
      });
      expect(result.success).toBe(true);
      expect(result.hasShadow).toBe(true);
      const layer = store.get(docId)!.layers[0];
      expect(layer.shadow).toBeDefined();
      expect(layer.shadow!.blur).toBe(10);
    });

    it("atelier_set_shadow removes with null", async () => {
      await callTool(client, "atelier_set_shadow", { id: docId, layerId: "rect", shadow: { color: "#000", blur: 5 } });
      const result = await callTool(client, "atelier_set_shadow", { id: docId, layerId: "rect", shadow: null });
      expect(result.success).toBe(true);
      expect(result.removed).toBe(true);
      expect(store.get(docId)!.layers[0].shadow).toBeUndefined();
    });

    it("atelier_set_shadow errors on nonexistent layer", async () => {
      const result = await callTool(client, "atelier_set_shadow", { id: docId, layerId: "nope", shadow: { color: "#000", blur: 1 } });
      expect(result._isError).toBe(true);
    });

    it("atelier_set_motion_path sets 2-point path", async () => {
      const result = await callTool(client, "atelier_set_motion_path", {
        id: docId, layerId: "rect",
        motionPath: {
          points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
          autoRotate: true,
        },
      });
      expect(result.success).toBe(true);
      expect(result.pointCount).toBe(2);
      expect(store.get(docId)!.layers[0].motionPath).toBeDefined();
    });

    it("atelier_set_motion_path removes with null", async () => {
      await callTool(client, "atelier_set_motion_path", {
        id: docId, layerId: "rect",
        motionPath: { points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] },
      });
      const result = await callTool(client, "atelier_set_motion_path", { id: docId, layerId: "rect", motionPath: null });
      expect(result.success).toBe(true);
      expect(result.removed).toBe(true);
    });

    it("atelier_set_motion_path errors on nonexistent layer", async () => {
      const result = await callTool(client, "atelier_set_motion_path", {
        id: docId, layerId: "ghost",
        motionPath: { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
      });
      expect(result._isError).toBe(true);
    });

    it("atelier_set_clip_path sets ellipse clip", async () => {
      const result = await callTool(client, "atelier_set_clip_path", {
        id: docId, layerId: "rect",
        clipPath: { type: "ellipse" },
      });
      expect(result.success).toBe(true);
      expect(result.clipType).toBe("ellipse");
      expect(store.get(docId)!.layers[0].clipPath).toBeDefined();
    });

    it("atelier_set_clip_path removes with null", async () => {
      await callTool(client, "atelier_set_clip_path", { id: docId, layerId: "rect", clipPath: { type: "rect" } });
      const result = await callTool(client, "atelier_set_clip_path", { id: docId, layerId: "rect", clipPath: null });
      expect(result.success).toBe(true);
      expect(result.removed).toBe(true);
    });

    it("atelier_edit_visual edits text content", async () => {
      const result = await callTool(client, "atelier_edit_visual", {
        id: docId, layerId: "title", content: "Updated",
      });
      expect(result.success).toBe(true);
      expect(result.updated).toContain("content");
      expect((store.get(docId)!.layers[1].visual as any).content).toBe("Updated");
    });

    it("atelier_edit_visual edits text style partially", async () => {
      const result = await callTool(client, "atelier_edit_visual", {
        id: docId, layerId: "title", style: { fontSize: 36 },
      });
      expect(result.success).toBe(true);
      const visual = store.get(docId)!.layers[1].visual as any;
      expect(visual.style.fontSize).toBe(36);
      // Original keys preserved
      expect(visual.style.fontFamily).toBe("sans-serif");
    });

    it("atelier_edit_visual edits image src", async () => {
      const result = await callTool(client, "atelier_edit_visual", {
        id: docId, layerId: "img", src: "https://example.com/photo.png",
      });
      expect(result.success).toBe(true);
      expect((store.get(docId)!.layers[2].visual as any).src).toBe("https://example.com/photo.png");
    });

    it("atelier_edit_visual rejects text edit on shape layer", async () => {
      const result = await callTool(client, "atelier_edit_visual", {
        id: docId, layerId: "rect", content: "nope",
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("text layers only");
    });
  });

  // ── State config tools ─────────────────────────────────────

  describe("state config tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "State Config Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      docId = result.id;
      await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 60 });
      await callTool(client, "atelier_add_state", { id: docId, stateName: "hover", duration: 30 });
    });

    it("atelier_set_audio sets audio on state", async () => {
      const result = await callTool(client, "atelier_set_audio", {
        id: docId, stateName: "intro",
        audio: { src: "music.mp3", volume: 0.8, loop: true },
      });
      expect(result.success).toBe(true);
      expect(result.audioSrc).toBe("music.mp3");
      expect(store.get(docId)!.states.intro.audio).toBeDefined();
      expect(store.get(docId)!.states.intro.audio!.volume).toBe(0.8);
    });

    it("atelier_set_audio removes with null", async () => {
      await callTool(client, "atelier_set_audio", { id: docId, stateName: "intro", audio: { src: "x.mp3" } });
      const result = await callTool(client, "atelier_set_audio", { id: docId, stateName: "intro", audio: null });
      expect(result.success).toBe(true);
      expect(result.removed).toBe(true);
      expect(store.get(docId)!.states.intro.audio).toBeUndefined();
    });

    it("atelier_set_audio errors on nonexistent state", async () => {
      const result = await callTool(client, "atelier_set_audio", { id: docId, stateName: "gone", audio: { src: "x" } });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });

    it("atelier_configure_transition configures transition", async () => {
      const result = await callTool(client, "atelier_configure_transition", {
        id: docId, stateName: "intro", targetState: "hover",
        transition: { duration: 15, easing: "ease-in-out" },
      });
      expect(result.success).toBe(true);
      expect(result.duration).toBe(15);
      const transitions = store.get(docId)!.states.intro.transitions;
      expect(transitions).toBeDefined();
      expect(transitions!.hover.duration).toBe(15);
    });

    it("atelier_configure_transition removes with null", async () => {
      await callTool(client, "atelier_configure_transition", {
        id: docId, stateName: "intro", targetState: "hover",
        transition: { duration: 10 },
      });
      const result = await callTool(client, "atelier_configure_transition", {
        id: docId, stateName: "intro", targetState: "hover",
        transition: null,
      });
      expect(result.success).toBe(true);
      expect(result.removed).toBe(true);
    });

    it("atelier_configure_transition errors on nonexistent target", async () => {
      const result = await callTool(client, "atelier_configure_transition", {
        id: docId, stateName: "intro", targetState: "missing",
        transition: { duration: 10 },
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });

    it("atelier_set_state_parent sets parent", async () => {
      const result = await callTool(client, "atelier_set_state_parent", {
        id: docId, stateName: "hover", parent: "intro",
      });
      expect(result.success).toBe(true);
      expect(result.parent).toBe("intro");
      expect(store.get(docId)!.states.hover.parent).toBe("intro");
    });

    it("atelier_set_state_parent clears with null", async () => {
      await callTool(client, "atelier_set_state_parent", { id: docId, stateName: "hover", parent: "intro" });
      const result = await callTool(client, "atelier_set_state_parent", { id: docId, stateName: "hover", parent: null });
      expect(result.success).toBe(true);
      expect(result.cleared).toBe(true);
      expect(store.get(docId)!.states.hover.parent).toBeUndefined();
    });

    it("atelier_set_state_parent rejects circular reference", async () => {
      await callTool(client, "atelier_set_state_parent", { id: docId, stateName: "hover", parent: "intro" });
      const result = await callTool(client, "atelier_set_state_parent", { id: docId, stateName: "intro", parent: "hover" });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("cycle");
    });
  });

  // ── Export tools ────────────────────────────────────────────

  describe("export tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "Export Test",
        width: 200,
        height: 200,
        fps: 30,
        background: "#FFFFFF",
      });
      docId = result.id;
      await callTool(client, "atelier_add_layer", {
        id: docId,
        layerId: "bg",
        visual: { type: "shape", shape: { type: "rect" } },
        x: 0, y: 0, width: 200, height: 200,
      });
      await callTool(client, "atelier_set_fill", {
        id: docId, layerId: "bg",
        fill: { type: "solid", color: "#FF0000" },
      });
      await callTool(client, "atelier_add_state", { id: docId, stateName: "main", duration: 30 });
    });

    it("atelier_export_svg exports SVG string containing <svg>", async () => {
      const result = await callTool(client, "atelier_export_svg", {
        id: docId, stateName: "main", frame: 0,
      });
      expect(result.success).toBe(true);
      expect(result.svg).toContain("<svg");
      expect(result.svg).toContain("</svg>");
      expect(result.svg).toContain("200");
      expect(result.stateName).toBe("main");
    });

    it("atelier_export_svg errors on nonexistent state", async () => {
      const result = await callTool(client, "atelier_export_svg", {
        id: docId, stateName: "nope",
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });

    it("atelier_export_lottie exports Lottie JSON", async () => {
      const result = await callTool(client, "atelier_export_lottie", {
        id: docId, stateName: "main",
      });
      expect(result.success).toBe(true);
      expect(result.lottie).toBeDefined();
      expect(result.lottie.v).toBeDefined();
      expect(result.lottie.layers).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("atelier_export_lottie errors on nonexistent document", async () => {
      const result = await callTool(client, "atelier_export_lottie", {
        id: "nonexistent",
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });
  });

  // ── Asset tools ──────────────────────────────────────────────

  describe("asset tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "Asset Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      docId = result.id;
    });

    it("atelier_add_asset adds an image asset", async () => {
      const result = await callTool(client, "atelier_add_asset", {
        id: docId,
        assetId: "hero-img",
        type: "image",
        src: "assets/hero.png",
        description: "Hero image",
      });
      expect(result.success).toBe(true);
      expect(result.assetId).toBe("hero-img");
      expect(result.type).toBe("image");

      const doc = store.get(docId)!;
      expect(doc.assets).toBeDefined();
      expect(doc.assets!["hero-img"].type).toBe("image");
      expect(doc.assets!["hero-img"].src).toBe("assets/hero.png");
      expect(doc.assets!["hero-img"].description).toBe("Hero image");
    });

    it("atelier_add_asset adds an audio asset", async () => {
      const result = await callTool(client, "atelier_add_asset", {
        id: docId,
        assetId: "bgm",
        type: "audio",
        src: "audio/background.mp3",
      });
      expect(result.success).toBe(true);
      expect(result.type).toBe("audio");
    });

    it("atelier_add_asset rejects duplicate assetId", async () => {
      await callTool(client, "atelier_add_asset", {
        id: docId, assetId: "dup", type: "image", src: "a.png",
      });
      const result = await callTool(client, "atelier_add_asset", {
        id: docId, assetId: "dup", type: "svg", src: "b.svg",
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("already exists");
    });

    it("atelier_add_asset errors on nonexistent doc", async () => {
      const result = await callTool(client, "atelier_add_asset", {
        id: "nonexistent", assetId: "x", type: "image", src: "x.png",
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });

    it("atelier_list_assets lists with usage info", async () => {
      // Add asset
      await callTool(client, "atelier_add_asset", {
        id: docId, assetId: "photo", type: "image", src: "photo.jpg",
      });
      // Add a layer referencing it
      await callTool(client, "atelier_add_layer", {
        id: docId, layerId: "img-layer",
        visual: { type: "image", assetId: "photo" },
        x: 0, y: 0, width: 100, height: 100,
      });
      // Add audio asset and state referencing it
      await callTool(client, "atelier_add_asset", {
        id: docId, assetId: "music", type: "audio", src: "music.mp3",
      });
      await callTool(client, "atelier_add_state", { id: docId, stateName: "intro", duration: 30 });
      await callTool(client, "atelier_set_audio", {
        id: docId, stateName: "intro", audio: { src: "music" },
      });

      const result = await callTool(client, "atelier_list_assets", { id: docId });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      const photo = result.assets.find((a: any) => a.assetId === "photo");
      expect(photo.usedByLayers).toContain("img-layer");

      const music = result.assets.find((a: any) => a.assetId === "music");
      expect(music.usedByStates).toContain("intro");
    });

    it("atelier_list_assets returns empty list", async () => {
      const result = await callTool(client, "atelier_list_assets", { id: docId });
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.assets).toEqual([]);
    });

    it("atelier_remove_asset removes unused asset", async () => {
      await callTool(client, "atelier_add_asset", {
        id: docId, assetId: "unused", type: "font", src: "font.woff2",
      });

      const result = await callTool(client, "atelier_remove_asset", {
        id: docId, assetId: "unused",
      });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(store.get(docId)!.assets!["unused"]).toBeUndefined();
    });

    it("atelier_remove_asset returns warnings for referenced asset", async () => {
      await callTool(client, "atelier_add_asset", {
        id: docId, assetId: "bg-img", type: "image", src: "bg.png",
      });
      await callTool(client, "atelier_add_layer", {
        id: docId, layerId: "bg-layer",
        visual: { type: "image", assetId: "bg-img" },
        x: 0, y: 0, width: 100, height: 100,
      });

      const result = await callTool(client, "atelier_remove_asset", {
        id: docId, assetId: "bg-img",
      });
      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("bg-layer");
      // Asset should still be removed
      expect(store.get(docId)!.assets!["bg-img"]).toBeUndefined();
    });

    it("atelier_remove_asset errors on nonexistent asset", async () => {
      const result = await callTool(client, "atelier_remove_asset", {
        id: docId, assetId: "ghost",
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });
  });

  // ── Variable tools ───────────────────────────────────────────

  describe("variable tools", () => {
    let docId: string;

    beforeEach(async () => {
      const result = await callTool(client, "atelier_create", {
        name: "Variable Test",
        width: 100,
        height: 100,
        fps: 30,
      });
      docId = result.id;
    });

    it("atelier_add_variable adds a string variable", async () => {
      const result = await callTool(client, "atelier_add_variable", {
        id: docId,
        variableName: "title",
        type: "string",
        description: "Animation title",
      });
      expect(result.success).toBe(true);
      expect(result.variableName).toBe("title");
      expect(result.type).toBe("string");

      const doc = store.get(docId)!;
      expect(doc.variables).toBeDefined();
      expect(doc.variables!.title.type).toBe("string");
      expect(doc.variables!.title.description).toBe("Animation title");
    });

    it("atelier_add_variable adds a variable with default", async () => {
      const result = await callTool(client, "atelier_add_variable", {
        id: docId,
        variableName: "color",
        type: "color",
        default: "#FF0000",
      });
      expect(result.success).toBe(true);

      const doc = store.get(docId)!;
      expect(doc.variables!.color.default).toBe("#FF0000");
    });

    it("atelier_add_variable rejects duplicate", async () => {
      await callTool(client, "atelier_add_variable", {
        id: docId, variableName: "title", type: "string",
      });
      const result = await callTool(client, "atelier_add_variable", {
        id: docId, variableName: "title", type: "number",
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("already exists");
    });

    it("atelier_add_variable errors on nonexistent doc", async () => {
      const result = await callTool(client, "atelier_add_variable", {
        id: "nonexistent", variableName: "x", type: "string",
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });

    it("atelier_list_variables lists with usage info", async () => {
      // Add variables
      await callTool(client, "atelier_add_variable", {
        id: docId, variableName: "title", type: "string", description: "Title text",
      });
      await callTool(client, "atelier_add_variable", {
        id: docId, variableName: "unused", type: "number",
      });

      // Add a reference to title in the doc name
      const doc = store.get(docId)!;
      doc.name = "{{title}} Animation";

      const result = await callTool(client, "atelier_list_variables", { id: docId });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      const title = result.variables.find((v: any) => v.name === "title");
      expect(title.referenced).toBe(true);

      const unused = result.variables.find((v: any) => v.name === "unused");
      expect(unused.referenced).toBe(false);
    });

    it("atelier_list_variables returns empty list", async () => {
      const result = await callTool(client, "atelier_list_variables", { id: docId });
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.variables).toEqual([]);
    });

    it("atelier_list_variables detects undeclared references", async () => {
      const doc = store.get(docId)!;
      doc.name = "{{mystery}}";

      const result = await callTool(client, "atelier_list_variables", { id: docId });
      expect(result.success).toBe(true);
      expect(result.undeclared).toContain("mystery");
    });

    it("atelier_remove_variable removes unused variable", async () => {
      await callTool(client, "atelier_add_variable", {
        id: docId, variableName: "temp", type: "boolean",
      });

      const result = await callTool(client, "atelier_remove_variable", {
        id: docId, variableName: "temp",
      });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("atelier_remove_variable warns for referenced variable", async () => {
      await callTool(client, "atelier_add_variable", {
        id: docId, variableName: "title", type: "string",
      });
      const doc = store.get(docId)!;
      doc.name = "{{title}}";

      const result = await callTool(client, "atelier_remove_variable", {
        id: docId, variableName: "title",
      });
      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("title");
    });

    it("atelier_remove_variable errors on nonexistent variable", async () => {
      const result = await callTool(client, "atelier_remove_variable", {
        id: docId, variableName: "ghost",
      });
      expect(result._isError).toBe(true);
      expect(result.error).toContain("not found");
    });
  });
});
