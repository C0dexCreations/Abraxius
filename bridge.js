const { EventEmitter } = require("events");
const WebSocket = require("ws");
const http = require("http");

/**
 * A pure-Node WebSocket bridge that replaces StudioMCP.exe.
 *
 * Roblox Studio hard-codes a connection to ws://localhost:13469/studio.
 * This bridge listens on that endpoint, performs the MCP client handshake
 * with Roblox Studio, and exposes an async JavaScript API to list/call tools.
 *
 * Architecture:
 *   Your code  <=async API=>  RobloxMCPBridge  <=WebSocket MCP client=>  Roblox Studio
 */
class RobloxMCPBridge extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {number} [options.port=13469]
   * @param {string} [options.path='/studio']
   * @param {Object} [options.clientInfo={name:'roblox-mcp-bridge',version:'1.0.0'}]
   * @param {string} [options.protocolVersion='2024-11-05']
   */
  constructor(options = {}) {
    super();
    this.port = options.port || 13469;
    this.path = options.path || "/studio";
    this.clientInfo = options.clientInfo || {
      name: "roblox-mcp-bridge",
      version: "1.0.0",
    };
    this.protocolVersion = options.protocolVersion || "2024-11-05";

    this.server = null;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.ready = false;
    this.serverInfo = null;
    this.tools = [];
  }

  async start(timeoutMs = 30000) {
    if (this.server) throw new Error("Bridge already started");

    await new Promise((resolve, reject) => {
      this.server = http.createServer();
      const wss = new WebSocket.Server({
        server: this.server,
        path: this.path,
      });

      wss.on("connection", (ws, req) => {
        if (this.ws) {
          console.warn(
            "[bridge] Roblox Studio tried to connect but a connection already exists",
          );
          ws.close(1008, "Only one Studio connection allowed");
          return;
        }
        this._onConnection(ws, req);
      });

      this.server.on("error", reject);
      this.server.listen(this.port, () => {
        this.emit("listening", { port: this.port, path: this.path });
        resolve();
      });
    });

    // Wait for Roblox Studio to connect
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Roblox Studio did not connect within ${timeoutMs}ms. Make sure Studio is open and MCP is enabled.`,
          ),
        );
      }, timeoutMs);

      const onReady = () => {
        clearTimeout(timer);
        this.off("error", onError);
        resolve(this.serverInfo);
      };
      const onError = (err) => {
        clearTimeout(timer);
        this.off("ready", onReady);
        reject(err);
      };
      this.once("ready", onReady);
      this.once("error", onError);
    });
  }

  stop() {
    this.ready = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    for (const [id, { reject }] of this.pending) {
      reject(new Error("Bridge stopped"));
    }
    this.pending.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  _onConnection(ws, req) {
    this.ws = ws;
    this.emit("connection", req.connection.remoteAddress);

    ws.on("message", (data) => this._onMessage(data));
    ws.on("close", (code, reason) => {
      this.ready = false;
      this.ws = null;
      this.emit("disconnect", code, reason?.toString());
    });
    ws.on("error", (err) => this.emit("error", err));

    // Send initialize as the MCP client
    this._request("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: { roots: { listChanged: true } },
      clientInfo: this.clientInfo,
    })
      .then((result) => {
        this.serverInfo = result;
        this._notify("notifications/initialized", {});
        this.ready = true;
        this.emit("ready", result);
        this.logToStudio("[Abraxius] Bridge connected");
      })
      .catch((err) => this.emit("error", err));
  }

  _onMessage(data) {
    let text;
    try {
      text = data.toString("utf8");
    } catch (err) {
      this.emit("parseError", err);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(text);
    } catch (err) {
      this.emit("parseError", err, text);
      return;
    }

    this.emit("message", msg);

    if (msg.type && msg.type !== "json_rpc") {
      this.emit("unknownType", msg);
      return;
    }

    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        if (msg.error) {
          const err = new Error(msg.error.message || "MCP error");
          err.code = msg.error.code;
          err.data = msg.error.data;
          pending.reject(err);
        } else {
          pending.resolve(msg.result);
        }
        return;
      }
      // id + method = incoming request (e.g. ping)
      if (msg.method) {
        this._handleRequest(msg.id, msg.method, msg.params);
        return;
      }
    } else if (msg.method) {
      this.emit("notification", msg.method, msg.params);
    }
  }

  _handleRequest(id, method, params) {
    if (method === "ping") {
      this._send({ jsonrpc: "2.0", id, result: {} });
      return;
    }
    this.emit("request", id, method, params);
  }

  _send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    // Wrap plain JSON-RPC in the envelope Roblox Studio expects
    const envelope = { type: "json_rpc", ...obj };
    this.ws.send(JSON.stringify(envelope));
    this.emit("send", envelope);
  }

  _request(method, params = {}) {
    const id = `${method}-${++this.nextId}-${cryptoRandomUUID()}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this._send({ jsonrpc: "2.0", id, method, params });
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  _notify(method, params = {}) {
    this._send({ jsonrpc: "2.0", method, params });
  }

  async listTools() {
    const result = await this._request("tools/list", {});
    this.tools = result.tools || [];
    return this.tools;
  }

  async callTool(name, args = {}) {
    if (name !== "execute_luau") {
      this.logToStudio(`[Abraxius] Tool call: ${name}`);
    }
    return this._request("tools/call", { name, arguments: args });
  }

  async logToStudio(message) {
    if (!this.ready) return;
    const escaped = String(message)
      .replace(/\r\n|\r|\n/g, " ")
      .replace(/["\\]/g, "\\$&");
    try {
      await this._request("tools/call", {
        name: "execute_luau",
        arguments: {
          code: `print("${escaped}")`,
          datamodel_type: "Edit",
        },
      });
    } catch {
      // Silent fail - Studio output is optional.
    }
  }

  async listPrompts() {
    const result = await this._request("prompts/list", {});
    return result.prompts || [];
  }

  async getPrompt(name, args = {}) {
    return this._request("prompts/get", { name, arguments: args });
  }

  async listResources() {
    const result = await this._request("resources/list", {});
    return result.resources || [];
  }

  async readResource(uri) {
    return this._request("resources/read", { uri });
  }

  async getStudioState() {
    return this.callTool("get_studio_state", {});
  }

  async executeLuau(code, datamodelType = "Workspace") {
    this.logToStudio("[Abraxius] Executing Luau");
    return this.callTool("execute_luau", {
      code,
      datamodel_type: datamodelType,
    });
  }

  async listRobloxStudios() {
    return this.callTool("list_roblox_studios", {});
  }

  async setActiveStudio(studioId) {
    return this.callTool("set_active_studio", { studio_id: studioId });
  }
}

function cryptoRandomUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

module.exports = { RobloxMCPBridge };
