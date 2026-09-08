"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvertechClient = void 0;
const events_1 = require("events");
const net = __importStar(require("net"));
const protocol_1 = require("./protocol");
class EnvertechClient extends events_1.EventEmitter {
    options;
    socket;
    buffer = Buffer.alloc(0);
    stopped = false;
    connected = false;
    pollTimer;
    reconnectTimer;
    idleTimer;
    constructor(options) {
        super();
        this.options = {
            host: options.host,
            port: options.port,
            serial: options.serial,
            pollIntervalMs: options.pollIntervalMs ?? 60_000,
            reconnectIntervalMs: options.reconnectIntervalMs ?? 30_000,
            idleTimeoutMs: options.idleTimeoutMs ?? 300_000,
            log: options.log,
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
        this.log('info', `Connecting to ${this.options.host}:${this.options.port}`);
        const socket = net.connect({
            host: this.options.host,
            port: this.options.port,
        });
        this.socket = socket;
        socket.setKeepAlive(true, 30_000);
        socket.on('connect', () => {
            this.setConnected(true);
            this.log('info', `Connected to ${this.options.host}:${this.options.port}`);
            this.buffer = Buffer.alloc(0);
            this.sendPoll();
            this.armIdle();
            this.schedulePoll();
        });
        socket.on('data', (chunk) => {
            this.onData(chunk);
        });
        socket.on('error', (error) => {
            this.log('warn', `Socket error: ${error.message}`);
            this.emit('error', error);
        });
        socket.on('close', () => {
            this.log('info', 'Connection closed');
            this.handleDisconnect();
        });
    }
    onData(chunk) {
        this.log('debug', `RX ${chunk.length} bytes: ${chunk.toString('hex')}`);
        this.buffer = Buffer.from(Buffer.concat([this.buffer, chunk]));
        const { frames, rest } = (0, protocol_1.extractFrames)(this.buffer);
        this.buffer = Buffer.from(rest);
        for (const frame of frames) {
            const reading = (0, protocol_1.parseStatusFrame)(frame);
            if (!reading) {
                this.log('info', `Handshake/status frame (${frame.length} bytes), waiting for live data`);
                continue;
            }
            this.armIdle();
            this.sendAck();
            this.emit('data', reading);
        }
    }
    sendPoll() {
        this.write((0, protocol_1.buildPollMessage)(this.options.serial), 'poll');
    }
    sendAck() {
        this.write((0, protocol_1.buildAckMessage)(this.options.serial), 'ack');
    }
    write(payload, label) {
        if (!this.socket || this.socket.destroyed) {
            return;
        }
        this.log('debug', `TX ${label} ${payload.toString('hex')}`);
        this.socket.write(payload);
    }
    schedulePoll() {
        this.clearTimer('poll');
        if (this.options.pollIntervalMs <= 0) {
            return;
        }
        this.pollTimer = setInterval(() => {
            if (this.connected) {
                this.sendPoll();
            }
        }, this.options.pollIntervalMs);
    }
    scheduleReconnect() {
        this.clearTimer('poll');
        this.clearTimer('idle');
        this.clearTimer('reconnect');
        if (this.stopped) {
            return;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, this.options.reconnectIntervalMs);
    }
    armIdle() {
        this.clearTimer('idle');
        this.idleTimer = setTimeout(() => {
            this.log('warn', 'No live data from inverter, reconnecting');
            this.closeSocket();
        }, this.options.idleTimeoutMs);
    }
    closeSocket() {
        if (!this.socket) {
            this.handleDisconnect();
            return;
        }
        const socket = this.socket;
        this.socket = undefined;
        socket.removeAllListeners();
        socket.destroy();
        this.handleDisconnect();
    }
    handleDisconnect() {
        this.socket = undefined;
        this.clearTimer('poll');
        this.clearTimer('idle');
        this.setConnected(false);
        this.scheduleReconnect();
    }
    setConnected(connected) {
        if (this.connected === connected) {
            return;
        }
        this.connected = connected;
        this.emit('connection', connected);
    }
    clearTimers() {
        this.clearTimer('poll');
        this.clearTimer('reconnect');
        this.clearTimer('idle');
    }
    clearTimer(name) {
        if (name === 'poll' && this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
        if (name === 'reconnect' && this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (name === 'idle' && this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }
    log(level, message) {
        this.options.log?.(level, message);
    }
}
exports.EnvertechClient = EnvertechClient;
//# sourceMappingURL=client.js.map