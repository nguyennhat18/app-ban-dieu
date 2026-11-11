// scripts/generate-icons.js
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function createPNG(width, height, pixelDataRGBA) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    scanlines.writeUInt8(0, rowOffset); // filter 0
    const pixelOffset = y * width * 4;
    pixelDataRGBA.copy(scanlines, rowOffset + 1, pixelOffset, pixelOffset + width * 4);
  }

  const idatData = zlib.deflateSync(scanlines);
  const idatChunk = createChunk('IDAT', idatData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([len, body, crcBuf]);
}

// Generate Kite Icon Image Data
function generateKitePixels(size) {
  const buf = Buffer.alloc(size * size * 4);

  // Helper to draw pixel RGBA
  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (Math.floor(y) * size + Math.floor(x)) * 4;
    // Simple alpha blending
    const srcA = a / 255;
    const dstA = buf[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA > 0) {
      buf[idx] = Math.round((r * srcA + buf[idx] * dstA * (1 - srcA)) / outA);
      buf[idx + 1] = Math.round((g * srcA + buf[idx + 1] * dstA * (1 - srcA)) / outA);
      buf[idx + 2] = Math.round((b * srcA + buf[idx + 2] * dstA * (1 - srcA)) / outA);
      buf[idx + 3] = Math.round(outA * 255);
    }
  }

  // Draw background: rounded square with vibrant gradient (Sky Blue -> Deep Indigo)
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Check rounded rect
      let inside = true;
      let d = 0;
      if (x < radius && y < radius) {
        d = Math.hypot(x - radius, y - radius);
        inside = d <= radius;
      } else if (x > size - radius && y < radius) {
        d = Math.hypot(x - (size - radius), y - radius);
        inside = d <= radius;
      } else if (x < radius && y > size - radius) {
        d = Math.hypot(x - radius, y - (size - radius));
        inside = d <= radius;
      } else if (x > size - radius && y > size - radius) {
        d = Math.hypot(x - (size - radius), y - (size - radius));
        inside = d <= radius;
      }

      if (inside) {
        const t = (x + y) / (size * 2);
        // Gradient: from #0284c7 (2, 132, 199) to #4338ca (67, 56, 202)
        const r = Math.round(2 + t * (67 - 2));
        const g = Math.round(132 + t * (56 - 132));
        const b = Math.round(199 + t * (202 - 199));
        setPixel(x, y, r, g, b, 255);
      }
    }
  }

  // Draw kite diamond: vertices top, right, bottom, left
  const cx = size * 0.48;
  const cy = size * 0.42;
  const top = { x: cx, y: cy - size * 0.26 };
  const bottom = { x: cx, y: cy + size * 0.26 };
  const left = { x: cx - size * 0.24, y: cy - size * 0.05 };
  const right = { x: cx + size * 0.24, y: cy - size * 0.05 };

  // Helper point-in-triangle
  function ptInTriangle(p, p0, p1, p2) {
    const dX = p.x - p2.x;
    const dY = p.y - p2.y;
    const dX21 = p2.x - p1.x;
    const dY12 = p1.y - p2.y;
    const D = dY12 * (p0.x - p2.x) + dX21 * (p0.y - p2.y);
    const s = dY12 * dX + dX21 * dY;
    const t = (p2.y - p0.y) * dX + (p0.x - p2.x) * dY;
    if (D < 0) return s <= 0 && t <= 0 && s + t >= D;
    return s >= 0 && t >= 0 && s + t <= D;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = { x, y };
      // 4 quadrants of kite:
      // Top-Left quadrant (top, left, center) -> Warm Red/Orange (#ef4444)
      if (ptInTriangle(p, top, left, { x: cx, y })) {
        setPixel(x, y, 239, 68, 68, 255);
      }
      // Top-Right quadrant -> Amber/Yellow (#f59e0b)
      if (ptInTriangle(p, top, right, { x: cx, y })) {
        setPixel(x, y, 245, 158, 11, 255);
      }
      // Bottom-Left quadrant -> Emerald/Teal (#10b981)
      if (ptInTriangle(p, bottom, left, { x: cx, y })) {
        setPixel(x, y, 16, 185, 129, 255);
      }
      // Bottom-Right quadrant -> Bright Cyan (#06b6d4)
      if (ptInTriangle(p, bottom, right, { x: cx, y })) {
        setPixel(x, y, 6, 182, 212, 255);
      }
    }
  }

  // Draw kite frame (white cross lines)
  function drawLine(x0, y0, x1, y1, width, r, g, b) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.hypot(dx, dy) * 2;
    for (let i = 0; i <= steps; i++) {
      const px = x0 + (dx * i) / steps;
      const py = y0 + (dy * i) / steps;
      for (let ox = -width; ox <= width; ox++) {
        for (let oy = -width; oy <= width; oy++) {
          if (ox * ox + oy * oy <= width * width) {
            setPixel(px + ox, py + oy, r, g, b, 255);
          }
        }
      }
    }
  }

  const lw = Math.max(1.5, size * 0.015);
  // Vertical spar
  drawLine(top.x, top.y, bottom.x, bottom.y, lw, 255, 255, 255);
  // Horizontal spar
  drawLine(left.x, left.y, right.x, right.y, lw, 255, 255, 255);

  // Draw kite tail curve with bows
  const tailSteps = 60;
  let lastX = bottom.x;
  let lastY = bottom.y;
  for (let i = 1; i <= tailSteps; i++) {
    const t = i / tailSteps;
    const tx = bottom.x + Math.sin(t * Math.PI * 2.2) * (size * 0.18) + t * (size * 0.22);
    const ty = bottom.y + t * (size * 0.38);
    drawLine(lastX, lastY, tx, ty, lw * 0.75, 254, 240, 138); // light yellow tail string
    lastX = tx;
    lastY = ty;

    // Bow ties on tail
    if (i === 15 || i === 32 || i === 50) {
      const bowColor = i === 15 ? [244, 63, 94] : i === 32 ? [250, 204, 21] : [59, 130, 246];
      const bowR = Math.max(3, size * 0.035);
      for (let bx = -bowR; bx <= bowR; bx++) {
        for (let by = -bowR; by <= bowR; by++) {
          if (Math.abs(bx) + Math.abs(by) <= bowR * 1.3) {
            setPixel(tx + bx, ty + by, bowColor[0], bowColor[1], bowColor[2], 255);
          }
        }
      }
    }
  }

  return buf;
}

// Generate 192 and 512 icons
const icon192Buf = createPNG(192, 192, generateKitePixels(192));
fs.writeFileSync(path.resolve('icons/icon-192.png'), icon192Buf);
console.log('Saved icons/icon-192.png');

const icon512Buf = createPNG(512, 512, generateKitePixels(512));
fs.writeFileSync(path.resolve('icons/icon-512.png'), icon512Buf);
console.log('Saved icons/icon-512.png');

// Also create icon-kite.svg
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#4338ca" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="2" dy="8" stdDeviation="8" flood-opacity="0.3"/>
    </filter>
  </defs>
  <!-- Background -->
  <rect width="512" height="512" rx="110" fill="url(#bg)"/>
  
  <!-- Kite Tail -->
  <path d="M 246 348 C 290 380, 290 420, 340 435 C 380 448, 360 480, 410 490" fill="none" stroke="#fef08a" stroke-width="6" stroke-linecap="round"/>
  <!-- Tail bows -->
  <polygon points="280,390 295,380 295,400" fill="#f43f5e"/>
  <polygon points="295,390 310,380 310,400" fill="#f43f5e"/>
  <polygon points="325,430 340,420 340,440" fill="#facc15"/>
  <polygon points="340,430 355,420 355,440" fill="#facc15"/>
  <polygon points="370,465 385,455 385,475" fill="#38bdf8"/>
  <polygon points="385,465 400,455 400,475" fill="#38bdf8"/>

  <!-- Kite Body -->
  <g filter="url(#shadow)">
    <!-- Top Left -->
    <polygon points="246,82 123,215 246,215" fill="#ef4444"/>
    <!-- Top Right -->
    <polygon points="246,82 369,215 246,215" fill="#f59e0b"/>
    <!-- Bottom Left -->
    <polygon points="123,215 246,348 246,215" fill="#10b981"/>
    <!-- Bottom Right -->
    <polygon points="369,215 246,348 246,215" fill="#06b6d4"/>
    <!-- Frame Spars -->
    <line x1="246" y1="82" x2="246" y2="348" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
    <line x1="123" y1="215" x2="369" y2="215" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>`;

fs.writeFileSync(path.resolve('icons/icon-kite.svg'), svg, 'utf8');
console.log('Saved icons/icon-kite.svg');
