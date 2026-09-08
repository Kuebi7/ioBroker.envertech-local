/// <reference types="mocha" />
import { expect } from 'chai';
import { localDayKey, updateDailyEnergy } from './energy';

describe('energy', () => {
    it('starts a new day with zero daily production', () => {
        const snapshot = updateDailyEnergy(12.5, undefined, new Date('2026-09-08T08:00:00'));
        expect(snapshot.dayKey).to.equal('2026-09-08');
        expect(snapshot.baseline).to.equal(12.5);
        expect(snapshot.daily).to.equal(0);
    });

    it('adds production on the same day', () => {
        const first = updateDailyEnergy(12.5, undefined, new Date('2026-09-08T08:00:00'));
        const second = updateDailyEnergy(13.1, first, new Date('2026-09-08T12:00:00'));
        expect(second.daily).to.equal(0.6);
        expect(second.baseline).to.equal(12.5);
    });

    it('resets the baseline after midnight', () => {
        const first = updateDailyEnergy(12.5, undefined, new Date('2026-09-08T22:00:00'));
        const next = updateDailyEnergy(12.8, first, new Date('2026-09-09T08:00:00'));
        expect(next.dayKey).to.equal('2026-09-09');
        expect(next.baseline).to.equal(12.8);
        expect(next.daily).to.equal(0);
    });

    it('formats the local day key', () => {
        expect(localDayKey(new Date(2026, 8, 8))).to.equal('2026-09-08');
    });
});
