"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var energy_exports = {};
__export(energy_exports, {
  localDayKey: () => localDayKey,
  updateDailyEnergy: () => updateDailyEnergy
});
module.exports = __toCommonJS(energy_exports);
function localDayKey(date = /* @__PURE__ */ new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function updateDailyEnergy(total, previous, now = /* @__PURE__ */ new Date()) {
  const dayKey = localDayKey(now);
  if (!Number.isFinite(total) || total < 0) {
    return previous != null ? previous : { total: 0, daily: 0, baseline: 0, dayKey };
  }
  if (!previous || previous.dayKey !== dayKey) {
    return {
      total,
      daily: 0,
      baseline: total,
      dayKey
    };
  }
  const daily = Math.max(0, round2(total - previous.baseline));
  return { total, daily, baseline: previous.baseline, dayKey };
}
function round2(value) {
  return Math.round(value * 100) / 100;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  localDayKey,
  updateDailyEnergy
});
//# sourceMappingURL=energy.js.map
