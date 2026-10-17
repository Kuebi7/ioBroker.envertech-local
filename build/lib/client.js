"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var client_exports = {};
__export(client_exports, {
  EnvertechClient: () => EnvertechClient,
  nodeClock: () => nodeClock
});
module.exports = __toCommonJS(client_exports);
var import_node_events = require("node:events");
var net = __toESM(require("node:net"));
var timers = __toESM(require("node:timers"));
var import_protocol = require("./protocol");
const nodeClock = {
  interval(handler, ms) {
    return timers.setInterval(handler, ms);
  },
  cancelInterval(handle) {
    timers.clearInterval(handle);
  },
  timeout(handler, ms) {
    return timers.setTimeout(handler, ms);
  },
  cancelTimeout(handle) {
    timers.clearTimeout(handle);
  }
};
class EnvertechClient extends import_node_events.EventEmitter {
  options;
  clock;
  socket;
  buffer = Buffer.alloc(0);
  stopped = false;
  connected = false;
  pollTimer;
  reconnectTimer;
  idleTimer;
  constructor(options) {
    var _a, _b, _c, _d;
    super();
    this.clock = (_a = options.clock) != null ? _a : nodeClock;
    this.options = {
      host: options.host,
      port: options.port,
      serial: options.serial,
      pollIntervalMs: (_b = options.pollIntervalMs) != null ? _b : 6e4,
      reconnectIntervalMs: (_c = options.reconnectIntervalMs) != null ? _c : 3e4,
      idleTimeoutMs: (_d = options.idleTimeoutMs) != null ? _d : 3e5,
      log: options.log
    };
  }
  start() {
    this.stopped = false;
    this.connect();
  }
  stop() {
    this.stopped = true;
    this.clearTimers();
    this.closeSocket();
    this.setConnected(false);
  }
  connect() {
    if (this.stopped || this.socket) {
      return;
    }
    this.log("info", `Connecting to ${this.options.host}:${this.options.port}`);
    const socket = net.connect({
      host: this.options.host,
      port: this.options.port
    });
    this.socket = socket;
    socket.setKeepAlive(true, 3e4);
    socket.on("connect", () => {
      this.setConnected(true);
      this.log("info", `Connected to ${this.options.host}:${this.options.port}`);
      this.buffer = Buffer.alloc(0);
      this.sendPoll();
      this.armIdle();
      this.schedulePoll();
    });
    socket.on("data", (chunk) => {
      this.onData(chunk);
    });
    socket.on("error", (error) => {
      this.log("warn", `Socket error: ${error.message}`);
      this.emit("error", error);
    });
    socket.on("close", () => {
      this.log("info", "Connection closed");
      this.handleDisconnect();
    });
  }
  onData(chunk) {
    this.log("debug", `RX ${chunk.length} bytes: ${chunk.toString("hex")}`);
    this.buffer = Buffer.from(Buffer.concat([this.buffer, chunk]));
    const { frames, rest } = (0, import_protocol.extractFrames)(this.buffer);
    this.buffer = Buffer.from(rest);
    for (const frame of frames) {
      const reading = (0, import_protocol.parseStatusFrame)(frame);
      if (!reading) {
        this.log("info", `Handshake/status frame (${frame.length} bytes), waiting for live data`);
        continue;
      }
      this.armIdle();
      this.sendAck();
      this.emit("data", reading);
    }
  }
  sendPoll() {
    this.write((0, import_protocol.buildPollMessage)(this.options.serial), "poll");
  }
  sendAck() {
    this.write((0, import_protocol.buildAckMessage)(this.options.serial), "ack");
  }
  write(payload, label) {
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    this.log("debug", `TX ${label} ${payload.toString("hex")}`);
    this.socket.write(payload);
  }
  schedulePoll() {
    this.clearTimer("poll");
    if (this.options.pollIntervalMs <= 0) {
      return;
    }
    this.pollTimer = this.clock.interval(() => {
      if (this.connected) {
        this.sendPoll();
      }
    }, this.options.pollIntervalMs);
  }
  scheduleReconnect() {
    this.clearTimer("poll");
    this.clearTimer("idle");
    this.clearTimer("reconnect");
    if (this.stopped) {
      return;
    }
    this.reconnectTimer = this.clock.timeout(() => {
      this.reconnectTimer = void 0;
      this.connect();
    }, this.options.reconnectIntervalMs);
  }
  armIdle() {
    this.clearTimer("idle");
    this.idleTimer = this.clock.timeout(() => {
      this.log("warn", "No live data from inverter, reconnecting");
      this.closeSocket();
    }, this.options.idleTimeoutMs);
  }
  closeSocket() {
    if (!this.socket) {
      this.handleDisconnect();
      return;
    }
    const socket = this.socket;
    this.socket = void 0;
    socket.removeAllListeners();
    socket.destroy();
    this.handleDisconnect();
  }
  handleDisconnect() {
    this.socket = void 0;
    this.clearTimer("poll");
    this.clearTimer("idle");
    this.setConnected(false);
    this.scheduleReconnect();
  }
  setConnected(connected) {
    if (this.connected === connected) {
      return;
    }
    this.connected = connected;
    this.emit("connection", connected);
  }
  clearTimers() {
    this.clearTimer("poll");
    this.clearTimer("reconnect");
    this.clearTimer("idle");
  }
  clearTimer(name) {
    if (name === "poll" && this.pollTimer != null) {
      this.clock.cancelInterval(this.pollTimer);
      this.pollTimer = void 0;
    }
    if (name === "reconnect" && this.reconnectTimer != null) {
      this.clock.cancelTimeout(this.reconnectTimer);
      this.reconnectTimer = void 0;
    }
    if (name === "idle" && this.idleTimer != null) {
      this.clock.cancelTimeout(this.idleTimer);
      this.idleTimer = void 0;
    }
  }
  log(level, message) {
    var _a, _b;
    (_b = (_a = this.options).log) == null ? void 0 : _b.call(_a, level, message);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EnvertechClient,
  nodeClock
});
//# sourceMappingURL=client.js.map
