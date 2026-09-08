import { EventEmitter } from 'events';
import * as net from 'net';
import {
    buildAckMessage,
    buildPollMessage,
    extractFrames,
    parseStatusFrame,
    type InverterReading,
} from './protocol';

export interface ClientOptions {
    host: string;
    port: number;
    serial: string;
    pollIntervalMs?: number;
    reconnectIntervalMs?: number;
    idleTimeoutMs?: number;
    log?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
}

export interface EnvertechClientEvents {
    data: [InverterReading];
    connection: [boolean];
    error: [Error];
}

export class EnvertechClient extends EventEmitter {
    private readonly options: Required<Omit<ClientOptions, 'log'>> & Pick<ClientOptions, 'log'>;
    private socket?: net.Socket;
    private buffer = Buffer.alloc(0);
    private stopped = false;
    private connected = false;
    private pollTimer?: NodeJS.Timeout;
    private reconnectTimer?: NodeJS.Timeout;
    private idleTimer?: NodeJS.Timeout;

    public constructor(options: ClientOptions) {
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

    public start(): void {
        this.stopped = false;
        this.connect();
    }

    public stop(): void {
        this.stopped = true;
        this.clearTimers();
        this.closeSocket();
        this.setConnected(false);
    }

    private connect(): void {
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
        socket.on('data', (chunk: Buffer) => {
            this.onData(chunk);
        });
        socket.on('error', (error: Error) => {
            this.log('warn', `Socket error: ${error.message}`);
            this.emit('error', error);
        });
        socket.on('close', () => {
            this.log('info', 'Connection closed');
            this.handleDisconnect();
        });
    }

    private onData(chunk: Buffer): void {
        this.log('debug', `RX ${chunk.length} bytes: ${chunk.toString('hex')}`);
        this.buffer = Buffer.from(Buffer.concat([this.buffer, chunk]));
        const { frames, rest } = extractFrames(this.buffer);
        this.buffer = Buffer.from(rest);
        for (const frame of frames) {
            const reading = parseStatusFrame(frame);
            if (!reading) {
                this.log('info', `Handshake/status frame (${frame.length} bytes), waiting for live data`);
                continue;
            }
            this.armIdle();
            this.sendAck();
            this.emit('data', reading);
        }
    }

    private sendPoll(): void {
        this.write(buildPollMessage(this.options.serial), 'poll');
    }

    private sendAck(): void {
        this.write(buildAckMessage(this.options.serial), 'ack');
    }

    private write(payload: Buffer, label: string): void {
        if (!this.socket || this.socket.destroyed) {
            return;
        }
        this.log('debug', `TX ${label} ${payload.toString('hex')}`);
        this.socket.write(payload);
    }

    private schedulePoll(): void {
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

    private scheduleReconnect(): void {
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

    private armIdle(): void {
        this.clearTimer('idle');
        this.idleTimer = setTimeout(() => {
            this.log('warn', 'No live data from inverter, reconnecting');
            this.closeSocket();
        }, this.options.idleTimeoutMs);
    }

    private closeSocket(): void {
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

    private handleDisconnect(): void {
        this.socket = undefined;
        this.clearTimer('poll');
        this.clearTimer('idle');
        this.setConnected(false);
        this.scheduleReconnect();
    }

    private setConnected(connected: boolean): void {
        if (this.connected === connected) {
            return;
        }
        this.connected = connected;
        this.emit('connection', connected);
    }

    private clearTimers(): void {
        this.clearTimer('poll');
        this.clearTimer('reconnect');
        this.clearTimer('idle');
    }

    private clearTimer(name: 'poll' | 'reconnect' | 'idle'): void {
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

    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
        this.options.log?.(level, message);
    }
}

export type { InverterReading };
