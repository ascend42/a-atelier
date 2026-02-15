/**
 * Snapshot-based undo/redo history.
 * Stores JSON-serialized document snapshots for O(1) restore.
 */
export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxSize = 50;

  /** Push a snapshot (JSON string of the doc before mutation). Clears redo stack. */
  snapshot(json: string): void {
    this.undoStack.push(json);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  /** Undo: pops from undo stack, pushes current state to redo, returns the restored JSON. */
  undo(currentJson: string): string | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(currentJson);
    return prev;
  }

  /** Redo: pops from redo stack, pushes current state to undo, returns the restored JSON. */
  redo(currentJson: string): string | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(currentJson);
    return next;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
