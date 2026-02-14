export interface DragReorderOptions {
  list: HTMLElement;
  itemClass: string;
  onReorder: (from: number, to: number) => void;
}

export function enableDragReorder(opts: DragReorderOptions): { destroy: () => void } {
  const { list, itemClass, onReorder } = opts;
  const ac = new AbortController();
  const signal = ac.signal;

  let fromIndex = -1;

  function getItems(): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>(`.${itemClass}`));
  }

  function setupHandles(): void {
    for (const item of getItems()) {
      const handle = item.querySelector<HTMLElement>(".atel-drag-handle");
      if (!handle || handle.dataset.bound) continue;
      handle.dataset.bound = "1";

      handle.addEventListener(
        "pointerdown",
        () => {
          item.draggable = true;
        },
        { signal },
      );

      handle.addEventListener(
        "pointerup",
        () => {
          item.draggable = false;
        },
        { signal },
      );
    }
  }

  const observer = new MutationObserver(() => setupHandles());
  observer.observe(list, { childList: true });
  setupHandles();

  list.addEventListener(
    "dragstart",
    (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>(`.${itemClass}`);
      if (!item) return;
      fromIndex = getItems().indexOf(item);
      item.classList.add("atel-drag-item--dragging");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    },
    { signal },
  );

  list.addEventListener(
    "dragover",
    (e) => {
      e.preventDefault();
      const items = getItems();
      for (const it of items) {
        it.classList.remove("atel-drag-indicator--above", "atel-drag-indicator--below");
      }
      const target = (e.target as HTMLElement).closest<HTMLElement>(`.${itemClass}`);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        target.classList.add("atel-drag-indicator--above");
      } else {
        target.classList.add("atel-drag-indicator--below");
      }
    },
    { signal },
  );

  list.addEventListener(
    "drop",
    (e) => {
      e.preventDefault();
      const items = getItems();
      const target = (e.target as HTMLElement).closest<HTMLElement>(`.${itemClass}`);
      if (!target || fromIndex < 0) return;
      let toIndex = items.indexOf(target);
      const rect = target.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY >= mid) toIndex++;
      // Adjust for source removal
      if (fromIndex < toIndex) toIndex--;
      if (fromIndex !== toIndex && toIndex >= 0) {
        onReorder(fromIndex, toIndex);
      }
      cleanup();
    },
    { signal },
  );

  list.addEventListener(
    "dragend",
    () => {
      cleanup();
    },
    { signal },
  );

  function cleanup(): void {
    fromIndex = -1;
    for (const item of getItems()) {
      item.draggable = false;
      item.classList.remove(
        "atel-drag-item--dragging",
        "atel-drag-indicator--above",
        "atel-drag-indicator--below",
      );
    }
  }

  return {
    destroy() {
      ac.abort();
      observer.disconnect();
    },
  };
}
