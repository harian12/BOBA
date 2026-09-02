import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const iconDir = path.resolve('apps/desktop/src-tauri/icons');
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

function createPng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8 bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data: height scanlines, each scanline has 1 filter byte (0) + width * 4 bytes
  const raw = Buffer.alloc((1 + width * 4) * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    raw[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      raw[pxOffset] = 0x3b;     // R
      raw[pxOffset + 1] = 0x82; // G
      raw[pxOffset + 2] = 0xf6; // B
      raw[pxOffset + 3] = 0xff; // A
    }
  }

  const idatData = zlib.deflateSync(raw);
  const idatChunk = makeChunk('IDAT', idatData);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c;
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }

  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([len, body, crcBuf]);
}

const png32 = createPng(32, 32);
const png128 = createPng(128, 128);

// Minimal ICO wrapper
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type ICO
icoHeader.writeUInt16LE(1, 4); // 1 image

const icoEntry = Buffer.alloc(16);
icoEntry.writeUInt8(32, 0);
icoEntry.writeUInt8(32, 1);
icoEntry.writeUInt8(0, 2);
icoEntry.writeUInt8(0, 3);
icoEntry.writeUInt16LE(1, 4);
icoEntry.writeUInt16LE(32, 6);
icoEntry.writeUInt32LE(png32.length, 8);
icoEntry.writeUInt32LE(22, 12);

const icoBuffer = Buffer.concat([icoHeader, icoEntry, png32]);

fs.writeFileSync(path.join(iconDir, '32x32.png'), png32);
fs.writeFileSync(path.join(iconDir, '128x128.png'), png128);
fs.writeFileSync(path.join(iconDir, '128x128@2x.png'), png128);
fs.writeFileSync(path.join(iconDir, 'icon.png'), png128);
fs.writeFileSync(path.join(iconDir, 'icon.ico'), icoBuffer);

console.log('Valid PNG & ICO files generated.');
