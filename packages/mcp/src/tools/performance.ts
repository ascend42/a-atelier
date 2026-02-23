// @a-company/atelier-mcp — Performance tools (profiling, frame diff, batch preview)

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveFrame } from "@a-company/atelier-core";
import type { DocumentStore } from "../store.js";

function getDoc(store: DocumentStore, id: string): { doc: AtelierDocument } | { error: string } {
  const doc = store.get(id);
  if (!doc) return { error: `Document "${id}" not found` };
  return { doc };
}

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

export function register(server: McpServer, store: DocumentStore): void {
  // ── atelier_profile ─────────────────────────────────────────
  server.tool(
    "atelier_profile",
    "Profile frame resolution performance — returns timing, layer count, property count, and delta count for a frame",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name to profile"),
      frame: z.number().int().min(0).describe("Frame number to resolve"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id, stateName, frame }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.states[stateName]) {
        return err(`State "${stateName}" not found`);
      }

      const state = doc.states[stateName];
      const deltaCount = state.deltas.length;
      const expressionCount = state.deltas.filter(
        d => (typeof d.from === "object" && d.from !== null && "expr" in d.from) ||
             (typeof d.to === "object" && d.to !== null && "expr" in d.to)
      ).length;

      const start = performance.now();
      const resolved = resolveFrame(doc, stateName, frame);
      const resolveTimeMs = performance.now() - start;

      let propertiesComputed = 0;
      const layerDetails = resolved.layers.map(rl => {
        const propCount = Object.keys(rl.computedProperties).length;
        propertiesComputed += propCount;
        return {
          id: rl.id,
          visualType: rl.layer.visual.type,
          propertiesComputed: propCount,
          properties: Object.keys(rl.computedProperties),
        };
      });

      return ok({
        stateName,
        frame,
        duration: state.duration,
        resolveTimeMs: Math.round(resolveTimeMs * 1000) / 1000,
        layerCount: doc.layers.length,
        deltaCount,
        expressionCount,
        propertiesComputed,
        layerDetails,
      });
    },
  );

  // ── atelier_diff_frames ────────────────────────────────────
  server.tool(
    "atelier_diff_frames",
    "Compare two frames and return only the properties that changed between them",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name"),
      frameA: z.number().int().min(0).describe("First frame number"),
      frameB: z.number().int().min(0).describe("Second frame number"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id, stateName, frameA, frameB }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.states[stateName]) {
        return err(`State "${stateName}" not found`);
      }

      const resolvedA = resolveFrame(doc, stateName, frameA);
      const resolvedB = resolveFrame(doc, stateName, frameB);

      const changes: Array<{
        layerId: string;
        property: string;
        from: unknown;
        to: unknown;
      }> = [];

      for (const layerB of resolvedB.layers) {
        const layerA = resolvedA.layers.find(l => l.id === layerB.id);
        const propsA = layerA?.computedProperties ?? {};
        const propsB = layerB.computedProperties;

        // All property keys from both frames
        const allKeys = new Set([...Object.keys(propsA), ...Object.keys(propsB)]);
        for (const key of allKeys) {
          const valA = (propsA as Record<string, unknown>)[key];
          const valB = (propsB as Record<string, unknown>)[key];
          if (valA !== valB) {
            changes.push({ layerId: layerB.id, property: key, from: valA, to: valB });
          }
        }
      }

      return ok({
        stateName,
        frameA,
        frameB,
        changeCount: changes.length,
        changes,
      });
    },
  );

  // ── atelier_batch_preview ──────────────────────────────────
  server.tool(
    "atelier_batch_preview",
    "Preview multiple frames at once — reduces round-trips for scrubbing or timeline inspection",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name to preview"),
      frames: z.array(z.number().int().min(0)).min(1).max(60).describe("Array of frame numbers to resolve (max 60)"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id, stateName, frames }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.states[stateName]) {
        return err(`State "${stateName}" not found`);
      }

      const start = performance.now();

      const results = frames.map(frame => {
        const resolved = resolveFrame(doc, stateName, frame);
        return {
          frame,
          layers: resolved.layers.map(rl => ({
            id: rl.id,
            computedProperties: rl.computedProperties,
          })),
        };
      });

      const totalTimeMs = performance.now() - start;

      return ok({
        stateName,
        duration: doc.states[stateName].duration,
        frameCount: frames.length,
        totalTimeMs: Math.round(totalTimeMs * 1000) / 1000,
        avgTimeMs: Math.round((totalTimeMs / frames.length) * 1000) / 1000,
        frames: results,
      });
    },
  );

  // ── atelier_complexity ─────────────────────────────────────
  server.tool(
    "atelier_complexity",
    "Analyze document complexity — layer count, delta count, expression usage, state hierarchy depth",
    {
      id: z.string().describe("Document ID"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layerCount = doc.layers.length;
      const stateCount = Object.keys(doc.states).length;
      const assetCount = doc.assets ? Object.keys(doc.assets).length : 0;
      const variableCount = doc.variables ? Object.keys(doc.variables).length : 0;

      let totalDeltas = 0;
      let totalExpressions = 0;
      let maxStateDuration = 0;
      let totalInteractions = 0;

      const stateDetails: Array<{
        name: string;
        duration: number;
        deltaCount: number;
        expressionCount: number;
        hasAudio: boolean;
        hasParent: boolean;
        transitionCount: number;
      }> = [];

      for (const [name, state] of Object.entries(doc.states)) {
        const deltaCount = state.deltas.length;
        totalDeltas += deltaCount;

        const expressionCount = state.deltas.filter(
          d => (typeof d.from === "object" && d.from !== null && "expr" in d.from) ||
               (typeof d.to === "object" && d.to !== null && "expr" in d.to)
        ).length;
        totalExpressions += expressionCount;

        if (state.duration > maxStateDuration) maxStateDuration = state.duration;

        stateDetails.push({
          name,
          duration: state.duration,
          deltaCount,
          expressionCount,
          hasAudio: !!state.audio,
          hasParent: !!state.parent,
          transitionCount: state.transitions ? Object.keys(state.transitions).length : 0,
        });
      }

      for (const layer of doc.layers) {
        if (layer.interactions) totalInteractions += layer.interactions.length;
      }

      // Compute hierarchy depth
      let maxHierarchyDepth = 0;
      for (const [name] of Object.entries(doc.states)) {
        let depth = 0;
        let current = name;
        const visited = new Set<string>();
        while (doc.states[current]?.parent && !visited.has(current)) {
          visited.add(current);
          current = doc.states[current].parent!;
          depth++;
        }
        if (depth > maxHierarchyDepth) maxHierarchyDepth = depth;
      }

      // Unique animated properties
      const animatedProperties = new Set<string>();
      for (const state of Object.values(doc.states)) {
        for (const delta of state.deltas) {
          animatedProperties.add(delta.property);
        }
      }

      return ok({
        layerCount,
        stateCount,
        totalDeltas,
        totalExpressions,
        totalInteractions,
        assetCount,
        variableCount,
        maxStateDuration,
        maxHierarchyDepth,
        uniqueAnimatedProperties: [...animatedProperties],
        stateDetails,
      });
    },
  );
}
