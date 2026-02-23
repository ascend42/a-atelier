// @a-company/atelier-mcp — In-memory document store

import type { AtelierDocument } from "@a-company/atelier-types";

let counter = 0;

function generateId(): string {
  counter++;
  return `doc_${Date.now()}_${counter}`;
}

/**
 * In-memory store for AtelierDocuments.
 * Each document is keyed by a string ID.
 */
export class DocumentStore {
  private docs = new Map<string, AtelierDocument>();

  /** Create a new document entry. Returns the assigned ID. */
  create(doc: AtelierDocument, id?: string): string {
    const docId = id ?? generateId();
    if (this.docs.has(docId)) {
      throw new Error(`Document "${docId}" already exists`);
    }
    this.docs.set(docId, doc);
    return docId;
  }

  /** Get a document by ID. */
  get(id: string): AtelierDocument | undefined {
    return this.docs.get(id);
  }

  /** Set (overwrite) a document by ID. */
  set(id: string, doc: AtelierDocument): void {
    this.docs.set(id, doc);
  }

  /** Delete a document by ID. Returns true if it existed. */
  delete(id: string): boolean {
    return this.docs.delete(id);
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

  /** Clear all documents (useful for testing). */
  clear(): void {
    this.docs.clear();
  }
}
