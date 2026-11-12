/**
 * Compact, self-contained, zero-dependency QR Code generator (ISO/IEC 18004).
 * Supports Byte mode, Error Correction Levels 'L' and 'M', Versions 1..15.
 * 100% offline — no external network calls or dependencies.
 */

// [ecCodewordsPerBlock, g1Blocks, g1DataCodewords, g2Blocks, g2DataCodewords]
const EC_TABLE = {
  L: [
    null,
    [7, 1, 19, 0, 0],     // V1  (26)
    [10, 1, 34, 0, 0],    // V2  (44)
    [15, 1, 55, 0, 0],    // V3  (70)
    [20, 1, 80, 0, 0],    // V4  (100)
    [26, 1, 108, 0, 0],   // V5  (134)
    [18, 2, 68, 0, 0],    // V6  (172)
    [20, 2, 78, 0, 0],    // V7  (196)
    [24, 2, 97, 0, 0],    // V8  (242)
    [30, 2, 116, 0, 0],   // V9  (292)
    [18, 2, 68, 2, 69],   // V10 (346)
    [20, 4, 81, 0, 0],    // V11 (404)
    [24, 2, 92, 2, 93],   // V12 (466)
    [26, 4, 107, 0, 0],   // V13 (532)
    [30, 3, 115, 1, 116], // V14 (581)
    [22, 5, 87, 1, 88]    // V15 (655)
  ],
  M: [
    null,
    [10, 1, 16, 0, 0],    // V1  (26)
    [16, 1, 28, 0, 0],    // V2  (44)
    [26, 1, 44, 0, 0],    // V3  (70)
    [18, 2, 32, 0, 0],    // V4  (100)
    [24, 2, 43, 0, 0],    // V5  (134)
    [16, 4, 27, 0, 0],    // V6  (172)
    [18, 4, 31, 0, 0],    // V7  (196)
    [22, 2, 38, 2, 39],   // V8  (242)
    [22, 3, 36, 2, 37],   // V9  (292)
    [26, 4, 43, 1, 44],   // V10 (346)
    [30, 1, 50, 4, 51],   // V11 (404)
    [22, 6, 36, 2, 37],   // V12 (466)
    [22, 8, 37, 1, 38],   // V13 (532)
    [24, 4, 40, 5, 41],   // V14 (581)
    [24, 5, 41, 5, 42]    // V15 (655)
  ]
};

const ALIGN_POSITIONS = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70]
];

const EC_FORMAT_BITS = {
  L: 1, // 01
  M: 0  // 00
};

// GF(256) with primitive polynomial 0x11D
const GF_EXP = new Uint8Array(255);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
}

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function rsGeneratorPoly(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEC(data, ecCount) {
  const gen = rsGeneratorPoly(ecCount);
  const work = new Uint8Array(data.length + ecCount);
  work.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const factor = work[i];
    if (factor !== 0) {
      for (let j = 0; j < gen.length; j++) {
        work[i + j] ^= gfMul(gen[j], factor);
      }
    }
  }
  return work.slice(data.length);
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) {
    bits.push(((value >>> i) & 1) === 1);
  }
}

function selectVersion(byteLength, ecLevel) {
  const table = EC_TABLE[ecLevel];
  for (let v = 1; v <= 15; v++) {
    const [, g1Blocks, g1Data, g2Blocks, g2Data] = table[v];
    const totalDataCodewords = g1Blocks * g1Data + g2Blocks * g2Data;
    const countBits = v <= 9 ? 8 : 16;
    const requiredBits = 4 + countBits + byteLength * 8;
    if (requiredBits <= totalDataCodewords * 8) {
      return v;
    }
  }
  throw new Error(`QR payload too large (${byteLength} bytes) for versions 1..15 at level ${ecLevel}`);
}

function buildCodewords(bytes, version, ecLevel) {
  const [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = EC_TABLE[ecLevel][version];
  const totalDataCodewords = g1Blocks * g1Data + g2Blocks * g2Data;
  const totalDataBits = totalDataCodewords * 8;
  const countBits = version <= 9 ? 8 : 16;

  const bits = [];
  appendBits(bits, 0b0100, 4); // Byte mode
  appendBits(bits, bytes.length, countBits);
  for (let i = 0; i < bytes.length; i++) {
    appendBits(bits, bytes[i], 8);
  }

  // Terminator (up to 4 zero bits)
  const terminatorLen = Math.min(4, totalDataBits - bits.length);
  appendBits(bits, 0, terminatorLen);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(false);
  }

  // Convert bits to bytes and add pad codewords 0xEC, 0x11
  const dataCodewords = new Uint8Array(totalDataCodewords);
  const dataByteLen = bits.length / 8;
  for (let i = 0; i < dataByteLen; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | (bits[i * 8 + j] ? 1 : 0);
    }
    dataCodewords[i] = b;
  }
  for (let i = dataByteLen; i < totalDataCodewords; i++) {
    dataCodewords[i] = (i - dataByteLen) % 2 === 0 ? 0xec : 0x11;
  }

  // Split into RS blocks
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let i = 0; i < g1Blocks; i++) {
    const block = dataCodewords.slice(offset, offset + g1Data);
    offset += g1Data;
    dataBlocks.push(block);
    ecBlocks.push(rsComputeEC(block, ecPerBlock));
  }
  for (let i = 0; i < g2Blocks; i++) {
    const block = dataCodewords.slice(offset, offset + g2Data);
    offset += g2Data;
    dataBlocks.push(block);
    ecBlocks.push(rsComputeEC(block, ecPerBlock));
  }

  // Interleave data and EC codewords
  const allCodewords = [];
  const maxDataLen = Math.max(g1Data, g2Data);
  for (let col = 0; col < maxDataLen; col++) {
    for (let b = 0; b < dataBlocks.length; b++) {
      if (col < dataBlocks[b].length) {
        allCodewords.push(dataBlocks[b][col]);
      }
    }
  }
  for (let col = 0; col < ecPerBlock; col++) {
    for (let b = 0; b < ecBlocks.length; b++) {
      allCodewords.push(ecBlocks[b][col]);
    }
  }

  return allCodewords;
}

function createMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(false));
}

function drawFinderAndSeparator(modules, isFunc, size, top, left) {
  for (let dy = -1; dy <= 7; dy++) {
    const r = top + dy;
    if (r < 0 || r >= size) continue;
    for (let dx = -1; dx <= 7; dx++) {
      const c = left + dx;
      if (c < 0 || c >= size) continue;
      let dark = false;
      if (dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6) {
        dark =
          dy === 0 ||
          dy === 6 ||
          dx === 0 ||
          dx === 6 ||
          (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4);
      }
      modules[r][c] = dark;
      isFunc[r][c] = true;
    }
  }
}

function drawAlignmentPattern(modules, isFunc, cy, cx) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.max(Math.abs(dy), Math.abs(dx));
      modules[cy + dy][cx + dx] = dist !== 1;
      isFunc[cy + dy][cx + dx] = true;
    }
  }
}

function drawFunctionPatterns(modules, isFunc, version) {
  const size = modules.length;

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    modules[6][i] = dark;
    isFunc[6][i] = true;
    modules[i][6] = dark;
    isFunc[i][6] = true;
  }

  // Finder patterns
  drawFinderAndSeparator(modules, isFunc, size, 0, 0);
  drawFinderAndSeparator(modules, isFunc, size, 0, size - 7);
  drawFinderAndSeparator(modules, isFunc, size, size - 7, 0);

  // Alignment patterns
  const pos = ALIGN_POSITIONS[version];
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const cy = pos[i];
      const cx = pos[j];
      const overlapsFinder =
        (cy <= 8 && cx <= 8) ||
        (cy <= 8 && cx >= size - 8) ||
        (cy >= size - 8 && cx <= 8);
      if (!overlapsFinder) {
        drawAlignmentPattern(modules, isFunc, cy, cx);
      }
    }
  }

  // Dark module
  modules[size - 8][8] = true;
  isFunc[size - 8][8] = true;

  // Reserve format info modules
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunc[8][i] = true;
      isFunc[i][8] = true;
    }
  }
  for (let i = size - 8; i < size; i++) {
    isFunc[8][i] = true;
    if (i > size - 8) {
      isFunc[i][8] = true;
    }
  }

  // Version info (versions 7+)
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const verBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((verBits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      modules[b][a] = bit;
      isFunc[b][a] = true;
      modules[a][b] = bit;
      isFunc[a][b] = true;
    }
  }
}

function drawFormatInfo(modules, ecLevel, maskPattern) {
  const size = modules.length;
  const data = (EC_FORMAT_BITS[ecLevel] << 3) | maskPattern;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  // Around top-left finder
  for (let i = 0; i <= 5; i++) {
    modules[8][i] = ((bits >>> (14 - i)) & 1) === 1;
  }
  modules[8][7] = ((bits >>> 8) & 1) === 1;
  modules[8][8] = ((bits >>> 7) & 1) === 1;
  modules[7][8] = ((bits >>> 6) & 1) === 1;
  for (let i = 0; i <= 5; i++) {
    modules[5 - i][8] = ((bits >>> (5 - i)) & 1) === 1;
  }

  // Bottom-left and top-right
  for (let i = 0; i <= 6; i++) {
    modules[size - 1 - i][8] = ((bits >>> (14 - i)) & 1) === 1;
  }
  for (let i = 0; i <= 7; i++) {
    modules[8][size - 8 + i] = ((bits >>> (7 - i)) & 1) === 1;
  }
}

function placeCodewords(modules, isFunc, codewords) {
  const size = modules.length;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  let dir = -1;

  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < size; step++) {
      const row = dir === -1 ? size - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = col - dx;
        if (!isFunc[row][c]) {
          let bit = false;
          if (bitIdx < totalBits) {
            bit = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          modules[row][c] = bit;
        }
      }
    }
    dir = -dir;
  }
}

function maskCondition(pattern, r, c) {
  switch (pattern) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function applyMask(modules, isFunc, pattern) {
  const size = modules.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunc[r][c] && maskCondition(pattern, r, c)) {
        modules[r][c] = !modules[r][c];
      }
    }
  }
}

function finderPatternPenalty(line) {
  let count = 0;
  const len = line.length;
  for (let i = 0; i <= len - 11; i++) {
    // 10111010000
    const p1 =
      line[i] &&
      !line[i + 1] &&
      line[i + 2] &&
      line[i + 3] &&
      line[i + 4] &&
      !line[i + 5] &&
      line[i + 6] &&
      !line[i + 7] &&
      !line[i + 8] &&
      !line[i + 9] &&
      !line[i + 10];
    // 00001011101
    const p2 =
      !line[i] &&
      !line[i + 1] &&
      !line[i + 2] &&
      !line[i + 3] &&
      line[i + 4] &&
      !line[i + 5] &&
      line[i + 6] &&
      line[i + 7] &&
      line[i + 8] &&
      !line[i + 9] &&
      line[i + 10];
    if (p1 || p2) count += 40;
  }
  return count;
}

function computePenalty(modules) {
  const size = modules.length;
  let penalty = 0;

  // Rule 1 & Rule 3: rows and columns
  const colLine = new Array(size);
  for (let r = 0; r < size; r++) {
    const row = modules[r];
    let runColor = row[0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (row[c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = row[c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
    penalty += finderPatternPenalty(row);
  }

  for (let c = 0; c < size; c++) {
    for (let r = 0; r < size; r++) colLine[r] = modules[r][c];
    let runColor = colLine[0];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (colLine[r] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = colLine[r];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
    penalty += finderPatternPenalty(colLine);
  }

  // Rule 2: 2x2 same-color blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = modules[r][c];
      if (
        color === modules[r][c + 1] &&
        color === modules[r + 1][c] &&
        color === modules[r + 1][c + 1]
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 4: dark module ratio
  let dark = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) dark++;
    }
  }
  const total = size * size;
  const k = Math.floor(Math.abs(dark * 20 - total * 10) / total);
  penalty += k * 10;

  return penalty;
}

/**
 * Encode text into a QR Code 2D boolean matrix (true = dark module).
 * Uses Byte mode, ISO/IEC 18004 Versions 1..15, Error Correction Level 'M' (default) or 'L'.
 *
 * @param {string} text
 * @param {{ ecLevel?: 'L' | 'M' }} [options]
 * @returns {boolean[][]}
 */
export function encodeQRMatrix(text, options = {}) {
  const ecLevel = options.ecLevel === 'L' ? 'L' : 'M';
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const version = selectVersion(bytes.length, ecLevel);
  const size = version * 4 + 17;
  const codewords = buildCodewords(bytes, version, ecLevel);

  const modules = createMatrix(size);
  const isFunc = createMatrix(size);
  drawFunctionPatterns(modules, isFunc, version);
  placeCodewords(modules, isFunc, codewords);

  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(modules, isFunc, mask);
    drawFormatInfo(modules, ecLevel, mask);
    const penalty = computePenalty(modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(modules, isFunc, mask);
  }

  applyMask(modules, isFunc, bestMask);
  drawFormatInfo(modules, ecLevel, bestMask);
  return modules;
}
