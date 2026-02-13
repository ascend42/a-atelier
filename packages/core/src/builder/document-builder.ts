import type {
  AtelierDocument, Canvas, Layer, State, Delta, Preset,
  Variable, Asset,
} from "@atelier/types";
import { validateNoOverlap } from "../validation/overlap-validator.js";

/**
 * Fluent builder for constructing AtelierDocument objects.
 * Validates constraints (like no-overlap) as you build.
 */
export class DocumentBuilder {
  private doc: AtelierDocument;

  constructor(name: string, canvas: Canvas) {
    this.doc = {
      version: "1.0",
      name,
      canvas,
      layers: [],
      states: {},
    };
  }

  /** Set document description */
  description(desc: string): this {
    this.doc.description = desc;
    return this;
  }

  /** Add tags to the document */
  tags(...tags: string[]): this {
    this.doc.tags = [...(this.doc.tags ?? []), ...tags];
    return this;
  }

  /** Add a variable definition */
  variable(id: string, variable: Variable): this {
    if (!this.doc.variables) this.doc.variables = {};
    this.doc.variables[id] = variable;
    return this;
  }

  /** Add an asset reference */
  asset(id: string, asset: Asset): this {
    if (!this.doc.assets) this.doc.assets = {};
    this.doc.assets[id] = asset;
    return this;
  }

  /** Add a preset */
  preset(id: string, preset: Preset): this {
    if (!this.doc.presets) this.doc.presets = {};
    this.doc.presets[id] = preset;
    return this;
  }

  /** Add a layer */
  addLayer(layer: Layer): this {
    // Check for duplicate IDs
    if (this.doc.layers.some(l => l.id === layer.id)) {
      throw new Error(`Layer with id "${layer.id}" already exists`);
    }
    this.doc.layers.push(layer);
    return this;
  }

  /** Add a state */
  addState(name: string, state: Omit<State, "deltas"> & { deltas?: Delta[] }): this {
    if (this.doc.states[name]) {
      throw new Error(`State "${name}" already exists`);
    }
    this.doc.states[name] = { ...state, deltas: state.deltas ?? [] };
    return this;
  }

  /** Add a delta to an existing state, with overlap validation */
  addDelta(stateName: string, delta: Delta): this {
    const state = this.doc.states[stateName];
    if (!state) {
      throw new Error(`State "${stateName}" not found`);
    }

    // Verify the layer exists
    if (!this.doc.layers.some(l => l.id === delta.layer)) {
      throw new Error(`Layer "${delta.layer}" not found — add the layer before adding deltas`);
    }

    // Check for overlaps
    const overlap = validateNoOverlap(state.deltas, delta);
    if (overlap) {
      throw new Error(overlap.message);
    }

    state.deltas.push(delta);
    return this;
  }

  /** Build and return the final document */
  build(): AtelierDocument {
    return JSON.parse(JSON.stringify(this.doc)) as AtelierDocument;
  }
}

/**
 * Create a new DocumentBuilder.
 * Convenience function for starting a builder chain.
 */
export function createDocument(name: string, canvas: Canvas): DocumentBuilder {
  return new DocumentBuilder(name, canvas);
}
