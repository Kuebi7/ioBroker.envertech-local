/// <reference types="mocha" />
import { expect } from 'chai';
import {
    buildAckMessage,
    buildPollMessage,
    extractFrames,
    parseStatusFrame,
} from './protocol';

const SAMPLE_STATUS_HEX =
    '68005668105132323232700179000000000000003232323270792f4700e6000349dc22b33a7e31f8020000000000000000000000323232337079302b00e40002c7f623193a7e31f80200000000000000000000009b16';

describe('protocol', () => {
    it('builds OpenEVT poll and ack messages', () => {
        expect(buildPollMessage('30819660').toString('ascii')).to.equal(
            '68001068107730819660000000009f16',
        );
        expect(buildAckMessage('30819660').toString('ascii')).to.equal(
            '68001068105030819660000000007816',
        );
    });

    it('rejects invalid serial numbers', () => {
        expect(() => buildPollMessage('123')).to.throw(/8 hex digits/);
    });

    it('decodes the documented EVT800 status frame', () => {
        const frame = Buffer.from(SAMPLE_STATUS_HEX, 'hex');
        const reading = parseStatusFrame(frame);
        expect(reading).to.not.equal(null);
        expect(reading?.inverterId).to.equal('32323232');
        expect(reading?.modules).to.have.length(2);
        expect(reading?.modules[0].voltageDc).to.equal(23.64);
        expect(reading?.modules[0].power).to.equal(3.59);
        expect(reading?.modules[0].energy).to.equal(26.31);
        expect(reading?.modules[0].temperature).to.equal(29.4);
        expect(reading?.modules[0].voltageAc).to.equal(233.97);
        expect(reading?.modules[0].frequency).to.equal(49.97);
        expect(reading?.modules[1].power).to.equal(3.56);
        expect(reading?.power).to.equal(7.2);
        expect(reading?.energy).to.equal(48.56);
    });

    it('extracts a binary frame from a stream', () => {
        const noise = Buffer.from([0x00, 0x11]);
        const frame = Buffer.from(SAMPLE_STATUS_HEX, 'hex');
        const tail = Buffer.from([0x68, 0x00]);
        const { frames, rest } = extractFrames(Buffer.concat([noise, frame, tail]));
        expect(frames).to.have.length(1);
        expect(frames[0].equals(frame)).to.equal(true);
        expect(rest.equals(tail)).to.equal(true);
    });

    it('decodes a 4-channel 0x1004 live frame', () => {
        const frame = Buffer.from(
            '68009668100430819660a2007a1100000000000030819660a27a000000000027261221e63a1631ff40000000000000000000000030819661a27a2f8c00b10067d4c1230c3a1631ff02000000000000000000000030819662a27a576619380063af0924cc3a1631ff00000000000000000000000030819663a27a40ac05c2005d6fc824733a1631ff020000000000000000000000ed16',
            'hex',
        );
        const reading = parseStatusFrame(frame);
        expect(reading?.inverterId).to.equal('30819660');
        expect(reading?.modules).to.have.length(4);
        expect(reading?.modules[0].power).to.equal(0);
        expect(reading?.modules[2].power).to.equal(100.88);
        expect(reading?.power).to.equal(126.7);
        expect(reading?.energy).to.equal(2688.8);
    });

    it('extracts an ASCII-HEX frame', () => {
        const ascii = Buffer.from(SAMPLE_STATUS_HEX, 'ascii');
        const { frames } = extractFrames(ascii);
        expect(frames).to.have.length(1);
        expect(parseStatusFrame(frames[0])?.modules[0].power).to.equal(3.59);
    });
});
