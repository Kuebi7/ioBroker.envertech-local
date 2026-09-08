"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localDayKey = localDayKey;
exports.updateDailyEnergy = updateDailyEnergy;
function localDayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function updateDailyEnergy(total, previous, now = new Date()) {
    const dayKey = localDayKey(now);
    if (!Number.isFinite(total) || total < 0) {
        return previous ?? { total: 0, daily: 0, baseline: 0, dayKey };
    }
    if (!previous || previous.dayKey !== dayKey) {
        return {
            total,
            daily: 0,
            baseline: total,
            dayKey,
        };
    }
    const daily = Math.max(0, round2(total - previous.baseline));
    return { total, daily, baseline: previous.baseline, dayKey };
}
function round2(value) {
    return Math.round(value * 100) / 100;
}
//# sourceMappingURL=energy.js.map