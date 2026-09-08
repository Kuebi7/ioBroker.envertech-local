"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CMD_LIVE_DATA = exports.CMD_STATUS = exports.CMD_ACK = exports.CMD_POLL = exports.FRAME_END = exports.FRAME_START = exports.DEFAULT_PORT = void 0;
exports.normalizeSerial = normalizeSerial;
exports.buildPollMessage = buildPollMessage;
exports.buildAckMessage = buildAckMessage;
exports.buildBinaryAck = buildBinaryAck;
exports.decodeMaybeHex = decodeMaybeHex;
exports.extractFrames = extractFrames;
exports.parseStatusFrame = parseStatusFrame;
exports.DEFAULT_PORT = 14889;
exports.FRAME_START = 0x68;
exports.FRAME_END = 0x16;
exports.CMD_POLL = 0x1077;
exports.CMD_ACK = 0x1050;
exports.CMD_STATUS = 0x1051;
exports.CMD_LIVE_DATA = 0x1004;
const SERIAL_RE = /^[0-9a-fA-F]{8}$/;
function normalizeSerial(serial) {
    const value = String(serial || '')
        .trim()
        .replace(/[^0-9a-fA-F]/g, '');
    if (!SERIAL_RE.test(value)) {
        throw new Error(`Serial must be 8 hex digits, got "${serial}"`);
    }
    return value.toUpperCase();
}
function buildPollMessage(serial) {
    return buildControlMessage(serial, '77', '9f');
}
function buildAckMessage(serial) {
    return buildControlMessage(serial, '50', '78');
}
function buildControlMessage(serial, command, checksum) {
    const sn = normalizeSerial(serial);
    return Buffer.from(`6800106810${command}${sn}00000000${checksum}16`, 'ascii');
}
function buildBinaryAck(idBytes) {
    if (idBytes.length < 4) {
        throw new Error('ACK id needs 4 bytes');
    }
    return Buffer.from([
        exports.FRAME_START,
        0x00,
        0x10,
        exports.FRAME_START,
        0x10,
        0x50,
        idBytes[0],
        idBytes[1],
        idBytes[2],
        idBytes[3],
        0x00,
        0x00,
        0x00,
        0x00,
        0x78,
        exports.FRAME_END,
    ]);
}
function decodeMaybeHex(data) {
    if (data.length < 2 || data.length % 2 !== 0) {
        return data;
    }
    const asText = data.toString('ascii');
    if (!/^[0-9a-fA-F]+$/.test(asText)) {
        return data;
    }
    return Buffer.from(asText, 'hex');
}
function extractFrames(buffer) {
    const frames = [];
    let data = buffer;
    const hexCandidate = tryDecodeLeadingHex(data);
    if (hexCandidate) {
        data = hexCandidate;
    }
    let offset = 0;
    while (offset < data.length) {
        if (data[offset] !== exports.FRAME_START) {
            offset += 1;
            continue;
        }
        if (offset + 3 > data.length) {
            break;
        }
        const totalLength = data.readUInt16BE(offset + 1);
        if (totalLength < 8 || totalLength > 512) {
            offset += 1;
            continue;
        }
        if (offset + totalLength > data.length) {
            break;
        }
        const frame = data.subarray(offset, offset + totalLength);
        if (frame[frame.length - 1] === exports.FRAME_END) {
            frames.push(Buffer.from(frame));
            offset += totalLength;
        }
        else {
            offset += 1;
        }
    }
    return { frames, rest: Buffer.from(data.subarray(offset)) };
}
function tryDecodeLeadingHex(data) {
    if (data.length < 4) {
        return null;
    }
    // ASCII-HEX frames start with "68"
    if (data[0] !== 0x36 || data[1] !== 0x38) {
        return null;
    }
    let hexLen = 0;
    while (hexLen < data.length && isHexChar(data[hexLen])) {
        hexLen += 1;
    }
    if (hexLen < 16 || hexLen % 2 !== 0) {
        return null;
    }
    const decoded = Buffer.from(data.subarray(0, hexLen).toString('ascii'), 'hex');
    const rest = data.subarray(hexLen);
    return rest.length ? Buffer.concat([decoded, rest]) : decoded;
}
function isHexChar(value) {
    return ((value >= 0x30 && value <= 0x39) ||
        (value >= 0x41 && value <= 0x46) ||
        (value >= 0x61 && value <= 0x66));
}
function parseStatusFrame(frame) {
    if (frame.length < 40 || frame[0] !== exports.FRAME_START || frame[frame.length - 1] !== exports.FRAME_END) {
        return null;
    }
    const command = frame.readUInt16BE(4);
    const isLive = command === exports.CMD_STATUS || command === exports.CMD_LIVE_DATA;
    if (!isLive && frame.length < 86) {
        return null;
    }
    const inverterId = formatId(frame.subarray(6, 10));
    const modules = [];
    for (let offset = 20; offset + 20 <= frame.length - 2; offset += 32) {
        const block = frame.subarray(offset, offset + 32);
        const module = parseModule(block);
        if (module) {
            modules.push(module);
        }
    }
    if (!modules.length) {
        return null;
    }
    const power = round(modules.reduce((sum, module) => sum + module.power, 0), 1);
    const energy = round(modules.reduce((sum, module) => sum + module.energy, 0), 2);
    return { inverterId, modules, power, energy };
}
function parseModule(block) {
    if (block.length < 20) {
        return null;
    }
    const id = formatId(block.subarray(0, 4));
    if (id === '00000000') {
        return null;
    }
    const voltageDc = round(block.readUInt16BE(6) / 512, 2);
    const power = round(block.readUInt16BE(8) / 64, 2);
    const energy = round(block.readUInt32BE(10) / 8192, 2);
    const temperature = round(block.readUInt16BE(14) / 128 - 40, 2);
    const voltageAc = round(block.readUInt16BE(16) / 64, 2);
    const frequency = round(block.readUInt16BE(18) / 256, 2);
    const current = voltageDc > 0 ? round(power / voltageDc, 2) : 0;
    return {
        id,
        firmware: `${block[4]}/${block[5]}`,
        voltageDc,
        power,
        energy,
        temperature,
        voltageAc,
        frequency,
        current,
    };
}
function formatId(bytes) {
    return bytes.toString('hex').toUpperCase();
}
function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
//# sourceMappingURL=protocol.js.map