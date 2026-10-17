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
var protocol_exports = {};
__export(protocol_exports, {
  CMD_ACK: () => CMD_ACK,
  CMD_LIVE_DATA: () => CMD_LIVE_DATA,
  CMD_POLL: () => CMD_POLL,
  CMD_STATUS: () => CMD_STATUS,
  DEFAULT_PORT: () => DEFAULT_PORT,
  FRAME_END: () => FRAME_END,
  FRAME_START: () => FRAME_START,
  buildAckMessage: () => buildAckMessage,
  buildBinaryAck: () => buildBinaryAck,
  buildPollMessage: () => buildPollMessage,
  decodeMaybeHex: () => decodeMaybeHex,
  extractFrames: () => extractFrames,
  normalizeSerial: () => normalizeSerial,
  parseStatusFrame: () => parseStatusFrame
});
module.exports = __toCommonJS(protocol_exports);
const DEFAULT_PORT = 14889;
const FRAME_START = 104;
const FRAME_END = 22;
const CMD_POLL = 4215;
const CMD_ACK = 4176;
const CMD_STATUS = 4177;
const CMD_LIVE_DATA = 4100;
const SERIAL_RE = /^[0-9a-fA-F]{8}$/;
function normalizeSerial(serial) {
  const value = String(serial || "").trim().replace(/[^0-9a-fA-F]/g, "");
  if (!SERIAL_RE.test(value)) {
    throw new Error(`Serial must be 8 hex digits, got "${serial}"`);
  }
  return value.toUpperCase();
}
function buildPollMessage(serial) {
  return buildControlMessage(serial, "77", "9f");
}
function buildAckMessage(serial) {
  return buildControlMessage(serial, "50", "78");
}
function buildControlMessage(serial, command, checksum) {
  const sn = normalizeSerial(serial);
  return Buffer.from(`6800106810${command}${sn}00000000${checksum}16`, "ascii");
}
function buildBinaryAck(idBytes) {
  if (idBytes.length < 4) {
    throw new Error("ACK id needs 4 bytes");
  }
  return Buffer.from([
    FRAME_START,
    0,
    16,
    FRAME_START,
    16,
    80,
    idBytes[0],
    idBytes[1],
    idBytes[2],
    idBytes[3],
    0,
    0,
    0,
    0,
    120,
    FRAME_END
  ]);
}
function decodeMaybeHex(data) {
  if (data.length < 2 || data.length % 2 !== 0) {
    return data;
  }
  const asText = data.toString("ascii");
  if (!/^[0-9a-fA-F]+$/.test(asText)) {
    return data;
  }
  return Buffer.from(asText, "hex");
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
    if (data[offset] !== FRAME_START) {
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
    if (frame[frame.length - 1] === FRAME_END) {
      frames.push(Buffer.from(frame));
      offset += totalLength;
    } else {
      offset += 1;
    }
  }
  return { frames, rest: Buffer.from(data.subarray(offset)) };
}
function tryDecodeLeadingHex(data) {
  if (data.length < 4) {
    return null;
  }
  if (data[0] !== 54 || data[1] !== 56) {
    return null;
  }
  let hexLen = 0;
  while (hexLen < data.length && isHexChar(data[hexLen])) {
    hexLen += 1;
  }
  if (hexLen < 16 || hexLen % 2 !== 0) {
    return null;
  }
  const decoded = Buffer.from(data.subarray(0, hexLen).toString("ascii"), "hex");
  const rest = data.subarray(hexLen);
  return rest.length ? Buffer.concat([decoded, rest]) : decoded;
}
function isHexChar(value) {
  return value >= 48 && value <= 57 || value >= 65 && value <= 70 || value >= 97 && value <= 102;
}
function parseStatusFrame(frame) {
  if (frame.length < 40 || frame[0] !== FRAME_START || frame[frame.length - 1] !== FRAME_END) {
    return null;
  }
  const command = frame.readUInt16BE(4);
  const isLive = command === CMD_STATUS || command === CMD_LIVE_DATA;
  if (!isLive && frame.length < 86) {
    return null;
  }
  const inverterId = formatId(frame.subarray(6, 10));
  const modules = [];
  for (let offset = 20; offset + 20 <= frame.length - 2; offset += 32) {
    const block = frame.subarray(offset, offset + 32);
    const module2 = parseModule(block);
    if (module2) {
      modules.push(module2);
    }
  }
  if (!modules.length) {
    return null;
  }
  const power = round(
    modules.reduce((sum, module2) => sum + module2.power, 0),
    1
  );
  const energy = round(
    modules.reduce((sum, module2) => sum + module2.energy, 0),
    2
  );
  return { inverterId, modules, power, energy };
}
function parseModule(block) {
  if (block.length < 20) {
    return null;
  }
  const id = formatId(block.subarray(0, 4));
  if (id === "00000000") {
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
    current
  };
}
function formatId(bytes) {
  return bytes.toString("hex").toUpperCase();
}
function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CMD_ACK,
  CMD_LIVE_DATA,
  CMD_POLL,
  CMD_STATUS,
  DEFAULT_PORT,
  FRAME_END,
  FRAME_START,
  buildAckMessage,
  buildBinaryAck,
  buildPollMessage,
  decodeMaybeHex,
  extractFrames,
  normalizeSerial,
  parseStatusFrame
});
//# sourceMappingURL=protocol.js.map
