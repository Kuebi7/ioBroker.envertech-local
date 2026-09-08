import { EnvertechClient } from './lib/client';
import { normalizeSerial } from './lib/protocol';

function arg(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    if (index >= 0 && process.argv[index + 1]) {
        return process.argv[index + 1];
    }
    return fallback;
}

const host = arg('host', '192.168.1.241');
const port = Number(arg('port', '14889'));
const serial = normalizeSerial(arg('serial', '30819660'));
const timeoutMs = Number(arg('timeout', '90')) * 1000;

const client = new EnvertechClient({
    host,
    port,
    serial,
    pollIntervalMs: 15_000,
    reconnectIntervalMs: 10_000,
    idleTimeoutMs: timeoutMs,
    log: (level, message) => {
        console.log(`[${level}] ${message}`);
    },
});

const timer = setTimeout(() => {
    console.error('No inverter data received. The device may be in standby (no sun).');
    client.stop();
    process.exit(2);
}, timeoutMs);

client.on('data', (reading) => {
    clearTimeout(timer);
    console.log(JSON.stringify(reading, null, 2));
    client.stop();
    process.exit(0);
});

client.start();
