// @a-company/atelier-mcp — WebSocket server transport for the MCP SDK
//
// Wraps a single WebSocket (from the `ws` library) as an MCP Transport so
// the same `McpServer` from `createServer()` can be reached over `/mcp` on
// the `atelier studio` Hono-equivalent (Vite-backed) HTTP server.
//
// Used in tandem with the live bridge in `bridge-protocol.ts`:
//   - MCP over /mcp  → external client drives DocumentStore mutations.
//   - Bridge over /bridge → broadcasts those mutations into the browser
//     studio so the human sees them land in real time.
//
// Per-connection instance: one transport per WebSocket. The CLI spawns a
// new `McpServer` per connection but shares the underlying `DocumentStore`
// across all of them so mutations from any client surface through the
// single onChange emitter the bridge subscribes to.

import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { WebSocket as WsWebSocket } from "ws";

/** Minimal slice of `ws.WebSocket` we depend on — keeps the transport mockable. */
export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (err: Error) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * MCP server transport over a single WebSocket connection.
 *
 * Lifecycle:
 *   1. CLI accepts WS upgrade, instantiates `new WebSocketServerTransport(ws)`.
 *   2. CLI passes it to `server.connect(transport)` — the SDK then calls
 *      `start()` and wires `onmessage` / `send()`.
 *   3. Incoming WS frames → parsed as JSON-RPC → `onmessage(message)`.
 *   4. SDK `send(message)` → JSON.stringify → `ws.send(...)`.
 *   5. WS `close` → `onclose()` fires once.
 *
 * Parse errors on inbound frames are surfaced via `onerror()` but do NOT
 * close the connection — a malformed message from a misbehaving client
 * should not knock out a healthy session.
 */
export class WebSocketServerTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sessionId?: string;

  private started = false;
  private closed = false;

  constructor(private readonly ws: WsLike) {}

  async start(): Promise<void> {
    if (this.started) {
      throw new Error(
        "WebSocketServerTransport already started — the MCP SDK calls start() automatically; do not call it again",
      );
    }
    this.started = true;

    this.ws.on("message", (data: unknown) => {
      // `ws` delivers Buffer / ArrayBuffer / Buffer[] depending on frame type.
      // Normalize to string before JSON.parse.
      let text: string;
      try {
        if (typeof data === "string") {
          text = data;
        } else if (data instanceof Buffer) {
          text = data.toString("utf-8");
        } else if (Array.isArray(data)) {
          text = Buffer.concat(data as Buffer[]).toString("utf-8");
        } else if (data instanceof ArrayBuffer) {
          text = Buffer.from(data).toString("utf-8");
        } else {
          text = String(data);
        }
      } catch (err) {
        this.onerror?.(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        this.onerror?.(
          new Error(
            `WebSocketServerTransport: failed to parse JSON-RPC message: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
        return;
      }

      // The SDK validates message shape downstream; we just hand it the parsed value.
      this.onmessage?.(parsed as JSONRPCMessage);
    });

    this.ws.on("close", () => {
      if (this.closed) return;
      this.closed = true;
      this.onclose?.();
    });

    this.ws.on("error", (err: Error) => {
      this.onerror?.(err);
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      throw new Error("WebSocketServerTransport: cannot send after close");
    }
    // ws.WebSocket.OPEN === 1. Hard-coded to avoid importing ws at top level
    // (keeps the test seam clean — WsLike can be a plain object with readyState).
    if (this.ws.readyState !== 1) {
      throw new Error(
        `WebSocketServerTransport: WebSocket is not OPEN (readyState=${this.ws.readyState})`,
      );
    }
    this.ws.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      // Swallow — close() should be idempotent and never throw.
    }
    this.onclose?.();
  }
}

/** Re-export the imported `ws.WebSocket` type for downstream consumers. */
export type { WsWebSocket };
