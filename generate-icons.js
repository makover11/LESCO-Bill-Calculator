// generate-icons.js
// Generates icons/icon16.png, icons/icon32.png, icons/icon48.png, icons/icon128.png
// using pure Node.js (zlib) with zero external dependencies.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PNG CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function encodePNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Non-interlaced
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rawOffset = y * scanlineLength;
    rawData[rawOffset] = 0; // None filter
    const rgbaOffset = y * width * 4;
    rgbaBuffer.copy(rawData, rawOffset + 1, rgbaOffset, rgbaOffset + width * 4);
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Point in polygon test for lightning bolt
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Render icon at size N with supersampling (3x)
function renderIcon(size) {
  const scale = 3;
  const sW = size * scale;
  const sH = size * scale;
  const subBuffer = Buffer.alloc(sW * sH * 4);

  // Normalized lightning bolt polygon vertices (0.0 to 1.0)
  // Bold, dynamic electrical bolt
  const boltPolyNorm = [
    [0.55, 0.12],
    [0.32, 0.50],
    [0.48, 0.50],
    [0.38, 0.88],
    [0.72, 0.44],
    [0.54, 0.44],
    [0.64, 0.12]
  ];

  const boltPoly = boltPolyNorm.map(([x, y]) => [x * sW, y * sH]);

  const cx = sW / 2;
  const cy = sH / 2;
  const radius = (sW / 2) * 0.92;
  const cornerR = sW * 0.22;

  for (let y = 0; y < sH; y++) {
    for (let x = 0; x < sW; x++) {
      const idx = (y * sW + x) * 4;

      // Distance from rounded rect bounds
      // Compute rounded rectangle mask
      const dx = Math.max(0, Math.abs(x - cx) - (cx - cornerR));
      const dy = Math.max(0, Math.abs(y - cy) - (cy - cornerR));
      const distFromCorner = Math.sqrt(dx * dx + dy * dy);

      if (distFromCorner > cornerR) {
        // Outside rounded rect
        subBuffer[idx] = 0;
        subBuffer[idx + 1] = 0;
        subBuffer[idx + 2] = 0;
        subBuffer[idx + 3] = 0;
        continue;
      }

      // Background gradient: from Vibrant Electric Blue (top left) to Deep LESCO Navy (bottom right)
      const gradT = (x / sW * 0.4) + (y / sH * 0.6);
      let r = Math.round(17 * (1 - gradT) + 10 * gradT);
      let g = Math.round(89 * (1 - gradT) + 40 * gradT);
      let b = Math.round(175 * (1 - gradT) + 120 * gradT);
      let a = 255;

      // Subtle glossy rim border (outer 2px)
      const borderDist = cornerR - distFromCorner;
      if (borderDist < scale * 1.5 && (dx > 0 || dy > 0 || Math.abs(x - cx) > cx - scale * 2 || Math.abs(y - cy) > cy - scale * 2)) {
        r = Math.min(255, r + 45);
        g = Math.min(255, g + 60);
        b = Math.min(255, b + 75);
      }

      // Check lightning bolt
      const inBolt = pointInPoly(x, y, boltPoly);
      if (inBolt) {
        // Golden electric bolt with vertical gradient
        const boltGrad = y / sH;
        r = Math.round(255 * (1 - boltGrad * 0.2));
        g = Math.round(214 * (1 - boltGrad * 0.25) + 30);
        b = Math.round(30 * (1 - boltGrad));
        a = 255;
      }

      subBuffer[idx] = r;
      subBuffer[idx + 1] = g;
      subBuffer[idx + 2] = b;
      subBuffer[idx + 3] = a;
    }
  }

  // Downsample to target size
  const outBuffer = Buffer.alloc(size * size * 4);
  const sampleCount = scale * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const sIdx = ((y * scale + sy) * sW + (x * scale + sx)) * 4;
          const a = subBuffer[sIdx + 3];
          rSum += subBuffer[sIdx] * (a / 255);
          gSum += subBuffer[sIdx + 1] * (a / 255);
          bSum += subBuffer[sIdx + 2] * (a / 255);
          aSum += a;
        }
      }
      const finalA = Math.round(aSum / sampleCount);
      const oIdx = (y * size + x) * 4;
      if (finalA > 0) {
        outBuffer[oIdx] = Math.round((rSum / sampleCount) * (255 / finalA));
        outBuffer[oIdx + 1] = Math.round((gSum / sampleCount) * (255 / finalA));
        outBuffer[oIdx + 2] = Math.round((bSum / sampleCount) * (255 / finalA));
        outBuffer[oIdx + 3] = finalA;
      } else {
        outBuffer[oIdx] = 0;
        outBuffer[oIdx + 1] = 0;
        outBuffer[oIdx + 2] = 0;
        outBuffer[oIdx + 3] = 0;
      }
    }
  }

  return encodePNG(size, size, outBuffer);
}

// Generate all sizes
const ICONS_DIR = path.join(__dirname, 'icons');
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const pngBuf = renderIcon(size);
  const outPath = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Generated icon${size}.png (${pngBuf.length} bytes)`);
}
console.log('All icons generated successfully!');
