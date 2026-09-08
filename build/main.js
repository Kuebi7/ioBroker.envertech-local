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
const utils = __importStar(require("@iobroker/adapter-core"));
const client_1 = require("./lib/client");
const energy_1 = require("./lib/energy");
const protocol_1 = require("./lib/protocol");
class EnvertechLocal extends utils.Adapter {
    client;
    energy;
    unloading = false;
    constructor(options = {}) {
        super({
            ...options,
            name: 'envertech-local',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    async onReady() {
        await this.setState('info.connection', false, true);
        let serial;
        try {
            serial = (0, protocol_1.normalizeSerial)(this.config.serial);
        }
        catch (error) {
            this.log.error(error.message);
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
        this.client = new client_1.EnvertechClient({
            host,
            port,
            serial,
            pollIntervalMs: Math.max(15, Number(this.config.pollInterval) || 60) * 1000,
            reconnectIntervalMs: Math.max(10, Number(this.config.reconnectInterval) || 30) * 1000,
            log: (level, message) => {
                if (level === 'debug') {
                    this.log.debug(message);
                }
                else if (level === 'warn') {
                    this.log.warn(message);
                }
                else if (level === 'error') {
                    this.log.error(message);
                }
                else {
                    this.log.info(message);
                }
            },
        });
        this.client.on('connection', (online) => {
            void this.setState('info.connection', online, true);
            if (!online && !this.unloading) {
                void this.setOfflinePower();
            }
        });
        this.client.on('data', (reading) => {
            void this.publish(reading);
        });
        this.client.on('error', (error) => {
            this.log.warn(error.message);
        });
        this.client.start();
    }
    async publish(reading) {
        this.energy = (0, energy_1.updateDailyEnergy)(reading.energy, this.energy);
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
    async setOfflinePower() {
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
    async ensureBaseObjects() {
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
    async ensureInverterObjects(moduleCount) {
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
    async loadEnergySnapshot() {
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
    onUnload(callback) {
        this.unloading = true;
        try {
            this.client?.stop();
        }
        catch (error) {
            this.log.error(`Error during unloading: ${error.message}`);
        }
        callback();
    }
}
if (require.main !== module) {
    module.exports = (options) => new EnvertechLocal(options);
}
else {
    (() => new EnvertechLocal())();
}
//# sourceMappingURL=main.js.map