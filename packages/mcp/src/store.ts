// @a-company/atelier-mcp — In-memory document store

import type { AtelierDocument } from "@a-company/atelier-types";

let counter = 0;

function generateId(): string {
  counter++;
  return `doc_${Date.now()}_${counter}`;
}

/**
 * Source of a mutation — distinguishes who triggered the change so listeners
 * (notably the live WS bridge in task #10) can avoid echoing changes back to
 * the originator and creating a feedback loop.
 */
export type MutationSource = "human" | "llm" | "system";

/**
 * Listener invoked after every mutating store operation.
 *
 * @param id      The document ID that changed.
 * @param doc     The new document value, or `null` if the document was deleted.
 * @param source  Who triggered the change. Defaults to "system" when the caller
 *                did not tag the mutation.
 */
export type ChangeListener = (
  id: string,
  doc: AtelierDocument | null,
  source: MutationSource,
) => void;

/**
 * In-memory store for AtelierDocuments.
 * Each document is keyed by a string ID.
 *
 * Supports an `onChange` event-emitter API so external observers (e.g. the
 * forthcoming WS bridge for the LLM↔human live-mutation loop — see task #10)
 * can subscribe to mutations and ferry them to other processes.
 */
export class DocumentStore {
  private docs = new Map<string, AtelierDocument>();
  private listeners: ChangeListener[] = [];

  /** Create a new document entry. Returns the assigned ID. */
  create(doc: AtelierDocument, id?: string, source: MutationSource = "system"): string {
    const docId = id ?? generateId();
    if (this.docs.has(docId)) {
      throw new Error(`Document "${docId}" already exists`);
    }
    this.docs.set(docId, doc);
    this.emit(docId, doc, source);
    return docId;
  }

  /** Get a document by ID. */
  get(id: string): AtelierDocument | undefined {
    return this.docs.get(id);
  }

  /** Set (overwrite) a document by ID. */
  set(id: string, doc: AtelierDocument, source: MutationSource = "system"): void {
    this.docs.set(id, doc);
    this.emit(id, doc, source);
  }

  /** Delete a document by ID. Returns true if it existed. */
  delete(id: string, source: MutationSource = "system"): boolean {
    const existed = this.docs.delete(id);
    if (existed) this.emit(id, null, source);
    return existed;
  }

  /** Check if a document exists. */
  has(id: string): boolean {
    return this.docs.has(id);
  }

  /** List all document IDs and their names. */
  list(): Array<{ id: string; name: string; canvas: AtelierDocument["canvas"] }> {
    const result: Array<{ id: string; name: string; canvas: AtelierDocument["canvas"] }> = [];
    for (const [id, doc] of this.docs) {
      result.push({ id, name: doc.name, canvas: doc.canvas });
    }
    return result;
  }

  /** Clear all documents (useful for testing). Does NOT fire onChange. */
  clear(): void {
    this.docs.clear();
  }

  /**
   * Subscribe to mutation events. The listener is invoked after every
   * create()/set()/delete() with the changed document ID, the new value
   * (or `null` when deleted), and the source tag.
   *
   * Returns an unsubscribe function. Multiple listeners are supported and
   * delivered in registration order. A listener that throws is isolated —
   * the error is swallowed and remaining listeners still fire.
   *
   * TODO(#10): the live WS bridge will subscribe here to forward LLM-side
   * mutations into the in-browser Studio (which exposes the symmetric
   * `AtelierStudio.applyMutation()` API).
   */
  onChange(listener: ChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  private emit(id: string, doc: AtelierDocument | null, source: MutationSource): void {
    // Snapshot the list so a listener mutating subscriptions mid-emit doesn't
    // skip or double-fire siblings.
    const snapshot = this.listeners.slice();
    for (const listener of snapshot) {
      try {
        listener(id, doc, source);
      } catch {
        // Isolate listener failures — one buggy subscriber must not break the
        // mutation chain for the rest. No logger is wired into this package
        // today; if/when one lands, surface the error here.
      }
    }
  }
}
