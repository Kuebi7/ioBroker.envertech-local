import * as utils from '@iobroker/adapter-core';
import { EnvertechClient, type Clock, type InverterReading } from './lib/client';
import { type EnergySnapshot, updateDailyEnergy } from './lib/energy';
import { normalizeSerial } from './lib/protocol';

class EnvertechLocal extends utils.Adapter {
    private client?: EnvertechClient;
    private energy?: EnergySnapshot;
    private unloading = false;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'envertech-local',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        await this.setState('info.connection', false, true);

        let serial: string;
        try {
            serial = normalizeSerial(this.config.serial);
        } catch (error) {
            this.log.error((error as Error).message);
            return;
        }

        const host = String(this.config.host || '').trim();
        const port = Number(this.config.port) || 14889;
        if (!host) {
            this.log.error('Please set the inverter IP address in the adapter configuration');
            return;
        }

        this.energy = await this.loadEnergySnapshot();
        await this.ensureBaseObjects();
        await this.setStateAsync('info.inverterId', { val: serial, ack: true });
        this.log.info(`Starting local read of ${host}:${port} (MID ${serial})`);

        this.client = new EnvertechClient({
            host,
            port,
            serial,
            pollIntervalMs: Math.max(15, Number(this.config.pollInterval) || 60) * 1000,
            reconnectIntervalMs: Math.max(10, Number(this.config.reconnectInterval) || 30) * 1000,
            clock: this.trackedClock(),
            log: (level, message) => {
                if (level === 'debug') {
                    this.log.debug(message);
                } else if (level === 'warn') {
                    this.log.warn(message);
                } else if (level === 'error') {
                    this.log.error(message);
                } else {
                    this.log.info(message);
                }
            },
        });
        this.client.on('connection', online => {
            void this.setState('info.connection', online, true);
            if (!online && !this.unloading) {
                void this.setOfflinePower();
            }
        });
        this.client.on('data', reading => {
            void this.publish(reading);
        });
        this.client.on('error', error => {
            this.log.warn(error.message);
        });
        this.client.start();
    }

    /** Adapter-owned timers so compact mode clears them when the instance stops. */
    private trackedClock(): Clock {
        return {
            interval: (handler, ms) => this.setInterval(handler, ms),
            cancelInterval: handle => {
                this.clearInterval(handle as ioBroker.Interval | undefined);
            },
            timeout: (handler, ms) => this.setTimeout(handler, ms),
            cancelTimeout: handle => {
                this.clearTimeout(handle as ioBroker.Timeout | undefined);
            },
        };
    }

    private async publish(reading: InverterReading): Promise<void> {
        this.energy = updateDailyEnergy(reading.energy, this.energy);
        await this.ensureInverterObjects(reading.modules.length);
        await this.setStateAsync('info.lastUpdate', { val: Date.now(), ack: true });
        await this.setStateAsync('info.inverterId', { val: reading.inverterId, ack: true });
        await this.setStateAsync('inverter.power', { val: reading.power, ack: true });
        await this.setStateAsync('inverter.energy', { val: reading.energy, ack: true });
        await this.setStateAsync('inverter.energyDaily', { val: this.energy.daily, ack: true });
        await this.setStateAsync('inverter.energyBaseline', { val: this.energy.baseline, ack: true });
        await this.setStateAsync('inverter.energyDay', { val: this.energy.dayKey, ack: true });

        for (let index = 0; index < reading.modules.length; index++) {
            const module = reading.modules[index];
            const prefix = `module${index + 1}`;
            await this.setStateAsync(`${prefix}.id`, { val: module.id, ack: true });
            await this.setStateAsync(`${prefix}.firmware`, { val: module.firmware, ack: true });
            await this.setStateAsync(`${prefix}.voltageDc`, { val: module.voltageDc, ack: true });
            await this.setStateAsync(`${prefix}.power`, { val: module.power, ack: true });
            await this.setStateAsync(`${prefix}.energy`, { val: module.energy, ack: true });
            await this.setStateAsync(`${prefix}.temperature`, { val: module.temperature, ack: true });
            await this.setStateAsync(`${prefix}.voltageAc`, { val: module.voltageAc, ack: true });
            await this.setStateAsync(`${prefix}.frequency`, { val: module.frequency, ack: true });
            await this.setStateAsync(`${prefix}.current`, { val: module.current, ack: true });
        }
        this.log.info(`Live data: ${reading.power} W, ${reading.energy} kWh, ${reading.modules.length} module(s)`);
    }

    private async setOfflinePower(): Promise<void> {
        const power = await this.getStateAsync('inverter.power');
        if (power?.val != null) {
            await this.setStateAsync('inverter.power', { val: 0, ack: true });
        }
        for (const prefix of ['module1', 'module2', 'module3', 'module4']) {
            const state = await this.getStateAsync(`${prefix}.power`);
            if (state?.val != null) {
                await this.setStateAsync(`${prefix}.power`, { val: 0, ack: true });
            }
        }
    }

    private async ensureBaseObjects(): Promise<void> {
        await this.extendObjectAsync('info.lastUpdate', {
            type: 'state',
            common: {
                name: 'Last successful update',
                type: 'number',
                role: 'value.time',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.extendObjectAsync('info.inverterId', {
            type: 'state',
            common: { name: 'Inverter ID', type: 'string', role: 'text', read: true, write: false },
            native: {},
        });
        await this.extendObjectAsync('inverter', {
            type: 'channel',
            common: { name: 'Inverter totals' },
            native: {},
        });
        await this.extendObjectAsync('inverter.power', {
            type: 'state',
            common: {
                name: 'AC power',
                type: 'number',
                role: 'value.power',
                unit: 'W',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.extendObjectAsync('inverter.energy', {
            type: 'state',
            common: {
                name: 'Lifetime energy',
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.extendObjectAsync('inverter.energyDaily', {
            type: 'state',
            common: {
                name: 'Energy today',
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.extendObjectAsync('inverter.energyBaseline', {
            type: 'state',
            common: {
                name: 'Daily energy baseline',
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.extendObjectAsync('inverter.energyDay', {
            type: 'state',
            common: { name: 'Energy day key', type: 'string', role: 'text', read: true, write: false },
            native: {},
        });
    }

    private async ensureInverterObjects(moduleCount: number): Promise<void> {
        for (let index = 1; index <= moduleCount; index++) {
            const prefix = `module${index}`;
            await this.extendObjectAsync(prefix, {
                type: 'channel',
                common: { name: `Module ${index}` },
                native: {},
            });
            await this.extendObjectAsync(`${prefix}.id`, {
                type: 'state',
                common: { name: 'Module ID', type: 'string', role: 'text', read: true, write: false },
                native: {},
            });
            await this.extendObjectAsync(`${prefix}.firmware`, {
                type: 'state',
                common: { name: 'Firmware', type: 'string', role: 'text', read: true, write: false },
                native: {},
            });
            await this.extendObjectAsync(`${prefix}.voltageDc`, {
                type: 'state',
                common: {
                    name: 'DC voltage',
                    type: 'number',
                    role: 'value.voltage',
                    unit: 'V',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.extendObjectAsync(`${prefix}.power`, {
                type: 'state',
                common: {
                    name: 'AC power',
                    type: 'number',
                    role: 'value.power',
                    unit: 'W',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.extendObjectAsync(`${prefix}.energy`, {
                type: 'state',
                common: {
                    name: 'Lifetime energy',
                    type: 'number',
                    role: 'value.energy',
                    unit: 'kWh',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.extendObjectAsync(`${prefix}.temperature`, {
                type: 'state',
                common: {
                    name: 'Temperature',
                    type: 'number',
                    role: 'value.temperature',
                    unit: '°C',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.extendObjectAsync(`${prefix}.voltageAc`, {
                type: 'state',
                common: {
                    name: 'AC voltage',
                    type: 'number',
                    role: 'value.voltage',
                    unit: 'V',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.extendObjectAsync(`${prefix}.frequency`, {
                type: 'state',
                common: {
                    name: 'AC frequency',
                    type: 'number',
                    role: 'value.frequency',
                    unit: 'Hz',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.extendObjectAsync(`${prefix}.current`, {
                type: 'state',
                common: {
                    name: 'DC current',
                    type: 'number',
                    role: 'value.current',
                    unit: 'A',
                    read: true,
                    write: false,
                },
                native: {},
            });
        }
    }

    private async loadEnergySnapshot(): Promise<EnergySnapshot | undefined> {
        const [total, daily, baseline, dayKey] = await Promise.all([
            this.getStateAsync('inverter.energy'),
            this.getStateAsync('inverter.energyDaily'),
            this.getStateAsync('inverter.energyBaseline'),
            this.getStateAsync('inverter.energyDay'),
        ]);
        if (typeof total?.val !== 'number' || typeof baseline?.val !== 'number' || typeof dayKey?.val !== 'string') {
            return undefined;
        }
        return {
            total: total.val,
            daily: typeof daily?.val === 'number' ? daily.val : 0,
            baseline: baseline.val,
            dayKey: dayKey.val,
        };
    }

    private onUnload(callback: () => void): void {
        this.unloading = true;
        try {
            this.client?.stop();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
        }
        callback();
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined): EnvertechLocal =>
        new EnvertechLocal(options);
} else {
    (() => new EnvertechLocal())();
}
