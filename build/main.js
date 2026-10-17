"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var utils = __toESM(require("@iobroker/adapter-core"));
var import_client = require("./lib/client");
var import_energy = require("./lib/energy");
var import_protocol = require("./lib/protocol");
class EnvertechLocal extends utils.Adapter {
  client;
  energy;
  unloading = false;
  constructor(options = {}) {
    super({
      ...options,
      name: "envertech-local"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    await this.setState("info.connection", false, true);
    let serial;
    try {
      serial = (0, import_protocol.normalizeSerial)(this.config.serial);
    } catch (error) {
      this.log.error(error.message);
      return;
    }
    const host = String(this.config.host || "").trim();
    const port = Number(this.config.port) || 14889;
    if (!host) {
      this.log.error("Please set the inverter IP address in the adapter configuration");
      return;
    }
    this.energy = await this.loadEnergySnapshot();
    await this.ensureBaseObjects();
    await this.setStateAsync("info.inverterId", { val: serial, ack: true });
    this.log.info(`Starting local read of ${host}:${port} (MID ${serial})`);
    this.client = new import_client.EnvertechClient({
      host,
      port,
      serial,
      pollIntervalMs: Math.max(15, Number(this.config.pollInterval) || 60) * 1e3,
      reconnectIntervalMs: Math.max(10, Number(this.config.reconnectInterval) || 30) * 1e3,
      clock: this.trackedClock(),
      log: (level, message) => {
        if (level === "debug") {
          this.log.debug(message);
        } else if (level === "warn") {
          this.log.warn(message);
        } else if (level === "error") {
          this.log.error(message);
        } else {
          this.log.info(message);
        }
      }
    });
    this.client.on("connection", (online) => {
      void this.setState("info.connection", online, true);
      if (!online && !this.unloading) {
        void this.setOfflinePower();
      }
    });
    this.client.on("data", (reading) => {
      void this.publish(reading);
    });
    this.client.on("error", (error) => {
      this.log.warn(error.message);
    });
    this.client.start();
  }
  /** Adapter-owned timers so compact mode clears them when the instance stops. */
  trackedClock() {
    return {
      interval: (handler, ms) => this.setInterval(handler, ms),
      cancelInterval: (handle) => {
        this.clearInterval(handle);
      },
      timeout: (handler, ms) => this.setTimeout(handler, ms),
      cancelTimeout: (handle) => {
        this.clearTimeout(handle);
      }
    };
  }
  async publish(reading) {
    this.energy = (0, import_energy.updateDailyEnergy)(reading.energy, this.energy);
    await this.ensureInverterObjects(reading.modules.length);
    await this.setStateAsync("info.lastUpdate", { val: Date.now(), ack: true });
    await this.setStateAsync("info.inverterId", { val: reading.inverterId, ack: true });
    await this.setStateAsync("inverter.power", { val: reading.power, ack: true });
    await this.setStateAsync("inverter.energy", { val: reading.energy, ack: true });
    await this.setStateAsync("inverter.energyDaily", { val: this.energy.daily, ack: true });
    await this.setStateAsync("inverter.energyBaseline", { val: this.energy.baseline, ack: true });
    await this.setStateAsync("inverter.energyDay", { val: this.energy.dayKey, ack: true });
    for (let index = 0; index < reading.modules.length; index++) {
      const module2 = reading.modules[index];
      const prefix = `module${index + 1}`;
      await this.setStateAsync(`${prefix}.id`, { val: module2.id, ack: true });
      await this.setStateAsync(`${prefix}.firmware`, { val: module2.firmware, ack: true });
      await this.setStateAsync(`${prefix}.voltageDc`, { val: module2.voltageDc, ack: true });
      await this.setStateAsync(`${prefix}.power`, { val: module2.power, ack: true });
      await this.setStateAsync(`${prefix}.energy`, { val: module2.energy, ack: true });
      await this.setStateAsync(`${prefix}.temperature`, { val: module2.temperature, ack: true });
      await this.setStateAsync(`${prefix}.voltageAc`, { val: module2.voltageAc, ack: true });
      await this.setStateAsync(`${prefix}.frequency`, { val: module2.frequency, ack: true });
      await this.setStateAsync(`${prefix}.current`, { val: module2.current, ack: true });
    }
    this.log.info(`Live data: ${reading.power} W, ${reading.energy} kWh, ${reading.modules.length} module(s)`);
  }
  async setOfflinePower() {
    const power = await this.getStateAsync("inverter.power");
    if ((power == null ? void 0 : power.val) != null) {
      await this.setStateAsync("inverter.power", { val: 0, ack: true });
    }
    for (const prefix of ["module1", "module2", "module3", "module4"]) {
      const state = await this.getStateAsync(`${prefix}.power`);
      if ((state == null ? void 0 : state.val) != null) {
        await this.setStateAsync(`${prefix}.power`, { val: 0, ack: true });
      }
    }
  }
  async ensureBaseObjects() {
    await this.extendObjectAsync("info.lastUpdate", {
      type: "state",
      common: {
        name: "Last successful update",
        type: "number",
        role: "value.time",
        read: true,
        write: false
      },
      native: {}
    });
    await this.extendObjectAsync("info.inverterId", {
      type: "state",
      common: { name: "Inverter ID", type: "string", role: "text", read: true, write: false },
      native: {}
    });
    await this.extendObjectAsync("inverter", {
      type: "channel",
      common: { name: "Inverter totals" },
      native: {}
    });
    await this.extendObjectAsync("inverter.power", {
      type: "state",
      common: {
        name: "AC power",
        type: "number",
        role: "value.power",
        unit: "W",
        read: true,
        write: false
      },
      native: {}
    });
    await this.extendObjectAsync("inverter.energy", {
      type: "state",
      common: {
        name: "Lifetime energy",
        type: "number",
        role: "value.energy",
        unit: "kWh",
        read: true,
        write: false
      },
      native: {}
    });
    await this.extendObjectAsync("inverter.energyDaily", {
      type: "state",
      common: {
        name: "Energy today",
        type: "number",
        role: "value.energy",
        unit: "kWh",
        read: true,
        write: false
      },
      native: {}
    });
    await this.extendObjectAsync("inverter.energyBaseline", {
      type: "state",
      common: {
        name: "Daily energy baseline",
        type: "number",
        role: "value.energy",
        unit: "kWh",
        read: true,
        write: false
      },
      native: {}
    });
    await this.extendObjectAsync("inverter.energyDay", {
      type: "state",
      common: { name: "Energy day key", type: "string", role: "text", read: true, write: false },
      native: {}
    });
  }
  async ensureInverterObjects(moduleCount) {
    for (let index = 1; index <= moduleCount; index++) {
      const prefix = `module${index}`;
      await this.extendObjectAsync(prefix, {
        type: "channel",
        common: { name: `Module ${index}` },
        native: {}
      });
      await this.extendObjectAsync(`${prefix}.id`, {
        type: "state",
        common: { name: "Module ID", type: "string", role: "text", read: true, write: false },
        native: {}
      });
      await this.extendObjectAsync(`${prefix}.firmware`, {
        type: "state",
        common: { name: "Firmware", type: "string", role: "text", read: true, write: false },
        native: {}
      });
      await this.extendObjectAsync(`${prefix}.voltageDc`, {
        type: "state",
        common: {
          name: "DC voltage",
          type: "number",
          role: "value.voltage",
          unit: "V",
          read: true,
          write: false
        },
        native: {}
      });
      await this.extendObjectAsync(`${prefix}.power`, {
        type: "state",
        common: {
          name: "AC power",
          type: "number",
          role: "value.power",
          unit: "W",
          read: true,
          write: false
        },
        native: {}
      });
      await this.extendObjectAsync(`${prefix}.energy`, {
        type: "state",
        common: {
          name: "Lifetime energy",
          type: "number",
          role: "value.energy",
          unit: "kWh",
          read: true,
          write: false
        },
        native: {}
      });
      await this.extendObjectAsync(`${prefix}.temperature`, {
        type: "state",
        common: {
          name: "Temperature",
          type: "number",
          role: "value.temperature",
          unit: "\xB0C",
          read: true,
          write: false
        },
        native: {}
      });
      await this.extendObjectAsync(`${prefix}.voltageAc`, {
        type: "state",
        common: {
          name: "AC voltage",
          type: "number",
          role: "value.voltage",
          unit: "V",
          read: true,
          write: false
        },
        native: {}
      });
      await this.extendObjectAsync(`${prefix}.frequency`, {
        type: "state",
        common: {
          name: "AC frequency",
          type: "number",
          role: "value.frequency",
          unit: "Hz",
          read: true,
          write: false
        },
        native: {}
      });
      await this.extendObjectAsync(`${prefix}.current`, {
        type: "state",
        common: {
          name: "DC current",
          type: "number",
          role: "value.current",
          unit: "A",
          read: true,
          write: false
        },
        native: {}
      });
    }
  }
  async loadEnergySnapshot() {
    const [total, daily, baseline, dayKey] = await Promise.all([
      this.getStateAsync("inverter.energy"),
      this.getStateAsync("inverter.energyDaily"),
      this.getStateAsync("inverter.energyBaseline"),
      this.getStateAsync("inverter.energyDay")
    ]);
    if (typeof (total == null ? void 0 : total.val) !== "number" || typeof (baseline == null ? void 0 : baseline.val) !== "number" || typeof (dayKey == null ? void 0 : dayKey.val) !== "string") {
      return void 0;
    }
    return {
      total: total.val,
      daily: typeof (daily == null ? void 0 : daily.val) === "number" ? daily.val : 0,
      baseline: baseline.val,
      dayKey: dayKey.val
    };
  }
  onUnload(callback) {
    var _a;
    this.unloading = true;
    try {
      (_a = this.client) == null ? void 0 : _a.stop();
    } catch (error) {
      this.log.error(`Error during unloading: ${error.message}`);
    }
    callback();
  }
}
if (require.main !== module) {
  module.exports = (options) => new EnvertechLocal(options);
} else {
  (() => new EnvertechLocal())();
}
//# sourceMappingURL=main.js.map
