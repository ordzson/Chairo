/**
 * QR encoder: byte mode, error correction level M, versions 1 to 10.
 *
 * The room QR has to be scannable by a real phone camera, and the page it
 * lives on ships to GitHub Pages, so the matrix is produced here instead of
 * pulling a runtime dependency into the bundle. Ten versions cover 213 bytes,
 * far beyond any join URL this game builds.
 */

export interface QrCode {
  readonly version: number;
  readonly size: number;
  /** Row-major dark/light modules, without the quiet zone. */
  readonly modules: readonly (readonly boolean[])[];
}

export class QrCapacityError extends Error {
  constructor(byteLength: number) {
    super(`El contenido de ${byteLength} bytes no cabe en un código QR de versión 10.`);
    this.name = 'QrCapacityError';
  }
}

interface VersionSpec {
  /** Error correction codewords per block. */
  readonly eccPerBlock: number;
  readonly group1Blocks: number;
  readonly group1Data: number;
  readonly group2Blocks: number;
  readonly group2Data: number;
}

/** Level M blocks per version, indexed from version 1. */
const VERSIONS: readonly VersionSpec[] = [
  { eccPerBlock: 10, group1Blocks: 1, group1Data: 16, group2Blocks: 0, group2Data: 0 },
  { eccPerBlock: 16, group1Blocks: 1, group1Data: 28, group2Blocks: 0, group2Data: 0 },
  { eccPerBlock: 26, group1Blocks: 1, group1Data: 44, group2Blocks: 0, group2Data: 0 },
  { eccPerBlock: 18, group1Blocks: 2, group1Data: 32, group2Blocks: 0, group2Data: 0 },
  { eccPerBlock: 24, group1Blocks: 2, group1Data: 43, group2Blocks: 0, group2Data: 0 },
  { eccPerBlock: 16, group1Blocks: 4, group1Data: 27, group2Blocks: 0, group2Data: 0 },
  { eccPerBlock: 18, group1Blocks: 4, group1Data: 31, group2Blocks: 0, group2Data: 0 },
  { eccPerBlock: 22, group1Blocks: 2, group1Data: 38, group2Blocks: 2, group2Data: 39 },
  { eccPerBlock: 22, group1Blocks: 3, group1Data: 36, group2Blocks: 2, group2Data: 37 },
  { eccPerBlock: 26, group1Blocks: 4, group1Data: 43, group2Blocks: 1, group2Data: 44 }
];

/** Alignment pattern centres per version, indexed from version 1. */
const ALIGNMENT_CENTERS: readonly (readonly number[])[] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
];

const PAD_BYTES = [0xec, 0x11] as const;

/** Galois field GF(256) with the QR primitive polynomial 0x11d. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

for (let index = 0, value = 1; index < 255; index += 1) {
  EXP[index] = value;
  LOG[value] = index;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255]!;

function multiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

function generatorPolynomial(degree: number): Uint8Array {
  let polynomial = Uint8Array.from([1]);
  for (let step = 0; step < degree; step += 1) {
    const next = new Uint8Array(polynomial.length + 1);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] = next[index]! ^ polynomial[index]!;
      next[index + 1] = next[index + 1]! ^ multiply(polynomial[index]!, EXP[step]!);
    }
    polynomial = next;
  }
  return polynomial;
}

function errorCorrection(data: Uint8Array, eccLength: number): Uint8Array {
  const generator = generatorPolynomial(eccLength);
  const remainder = new Uint8Array(data.length + eccLength);
  remainder.set(data);
  for (let index = 0; index < data.length; index += 1) {
    const factor = remainder[index]!;
    if (factor === 0) continue;
    for (let term = 0; term < generator.length; term += 1) {
      remainder[index + term] = remainder[index + term]! ^ multiply(generator[term]!, factor);
    }
  }
  return remainder.slice(data.length);
}

/** BCH(15, 5) check bits for the format string, and BCH(18, 6) for the version. */
function bch(value: number, generator: number, generatorBits: number): number {
  let remainder = value << (generatorBits - 1);
  const shifted = value << (generatorBits - 1);
  while (bitLength(remainder) >= generatorBits) {
    remainder ^= generator << (bitLength(remainder) - generatorBits);
  }
  return shifted | remainder;
}

function bitLength(value: number): number {
  let length = 0;
  let rest = value;
  while (rest !== 0) {
    length += 1;
    rest >>>= 1;
  }
  return length;
}

function dataCapacity(spec: VersionSpec): number {
  return spec.group1Blocks * spec.group1Data + spec.group2Blocks * spec.group2Data;
}

function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= VERSIONS.length; version += 1) {
    const spec = VERSIONS[version - 1]!;
    const headerBits = 4 + (version < 10 ? 8 : 16);
    if (headerBits + byteLength * 8 <= dataCapacity(spec) * 8) return version;
  }
  throw new QrCapacityError(byteLength);
}

function buildCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const spec = VERSIONS[version - 1]!;
  const capacity = dataCapacity(spec);
  const bits: number[] = [];
  const push = (value: number, length: number): void => {
    for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
  };

  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(capacity);
  for (let index = 0; index < bits.length / 8; index += 1) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[index * 8 + bit]!;
    data[index] = byte;
  }
  for (let index = bits.length / 8; index < capacity; index += 1) {
    data[index] = PAD_BYTES[(index - bits.length / 8) % 2]!;
  }

  // Split into blocks, compute their error correction, then interleave both.
  const blocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;
  const groups = [
    { count: spec.group1Blocks, size: spec.group1Data },
    { count: spec.group2Blocks, size: spec.group2Data }
  ];
  for (const group of groups) {
    for (let index = 0; index < group.count; index += 1) {
      const block = data.slice(offset, offset + group.size);
      offset += group.size;
      blocks.push(block);
      eccBlocks.push(errorCorrection(block, spec.eccPerBlock));
    }
  }

  const interleaved: number[] = [];
  const longestBlock = Math.max(...blocks.map(block => block.length));
  for (let index = 0; index < longestBlock; index += 1) {
    for (const block of blocks) if (index < block.length) interleaved.push(block[index]!);
  }
  for (let index = 0; index < spec.eccPerBlock; index += 1) {
    for (const block of eccBlocks) interleaved.push(block[index]!);
  }
  return Uint8Array.from(interleaved);
}

type Grid = (boolean | null)[][];

function reserveFunctionPatterns(grid: Grid, version: number): void {
  const size = grid.length;
  const finder = (top: number, left: number): void => {
    for (let row = -1; row <= 7; row += 1) {
      for (let column = -1; column <= 7; column += 1) {
        const y = top + row;
        const x = left + column;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        const outerRing = (row === 0 || row === 6) && column >= 0 && column <= 6;
        const sideRing = (column === 0 || column === 6) && row >= 0 && row <= 6;
        const core = row >= 2 && row <= 4 && column >= 2 && column <= 4;
        grid[y]![x] = outerRing || sideRing || core;
      }
    }
  };

  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (let index = 8; index < size - 8; index += 1) {
    const dark = index % 2 === 0;
    grid[6]![index] = dark;
    grid[index]![6] = dark;
  }

  for (const row of ALIGNMENT_CENTERS[version - 1]!) {
    for (const column of ALIGNMENT_CENTERS[version - 1]!) {
      const overlapsFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === size - 7) ||
        (row === size - 7 && column === 6);
      if (overlapsFinder) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          grid[row + dy]![column + dx] = Math.max(Math.abs(dy), Math.abs(dx)) !== 1;
        }
      }
    }
  }

  // Reserved areas: format information, the fixed dark module and, from
  // version 7, the version information blocks.
  for (let index = 0; index < 9; index += 1) {
    if (grid[8]![index] === null) grid[8]![index] = false;
    if (grid[index]![8] === null) grid[index]![8] = false;
  }
  for (let index = 0; index < 8; index += 1) {
    grid[8]![size - 1 - index] = false;
    grid[size - 1 - index]![8] = false;
  }
  grid[size - 8]![8] = true;

  if (version >= 7) {
    for (let index = 0; index < 18; index += 1) {
      const row = Math.floor(index / 3);
      const column = (index % 3) + size - 11;
      grid[row]![column] = false;
      grid[column]![row] = false;
    }
  }
}

const MASKS: readonly ((row: number, column: number) => boolean)[] = [
  (row, column) => (row + column) % 2 === 0,
  row => row % 2 === 0,
  (_row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0
];

function placeData(grid: Grid, codewords: Uint8Array, mask: number): void {
  const size = grid.length;
  const maskFn = MASKS[mask]!;
  let bitIndex = 7;
  let byteIndex = 0;
  let row = size - 1;
  let upward = true;

  for (let column = size - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;
    for (;;) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = column - offset;
        if (grid[row]![x] !== null) continue;
        let dark = byteIndex < codewords.length && ((codewords[byteIndex]! >>> bitIndex) & 1) === 1;
        if (maskFn(row, x)) dark = !dark;
        grid[row]![x] = dark;
        bitIndex -= 1;
        if (bitIndex < 0) {
          bitIndex = 7;
          byteIndex += 1;
        }
      }
      row += upward ? -1 : 1;
      if (row < 0 || row >= size) {
        row -= upward ? -1 : 1;
        upward = !upward;
        break;
      }
    }
  }
}

function placeFormatInformation(grid: Grid, mask: number): void {
  const size = grid.length;
  // Level M is 0b00, so the format data is the mask alone.
  const bits = bch(mask, 0x537, 11) ^ 0x5412;

  for (let index = 0; index < 15; index += 1) {
    const dark = ((bits >> index) & 1) === 1;
    if (index < 6) grid[index]![8] = dark;
    else if (index < 8) grid[index + 1]![8] = dark;
    else grid[size - 15 + index]![8] = dark;

    if (index < 8) grid[8]![size - 1 - index] = dark;
    else if (index < 9) grid[8]![15 - index] = dark;
    else grid[8]![14 - index] = dark;
  }
  grid[size - 8]![8] = true;
}

function placeVersionInformation(grid: Grid, version: number): void {
  if (version < 7) return;
  const size = grid.length;
  const bits = bch(version, 0x1f25, 13);
  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >> index) & 1) === 1;
    const row = Math.floor(index / 3);
    const column = (index % 3) + size - 11;
    grid[row]![column] = dark;
    grid[column]![row] = dark;
  }
}

function penalty(grid: Grid): number {
  const size = grid.length;
  const at = (row: number, column: number): boolean => grid[row]![column] === true;
  let score = 0;

  // Rule 1: runs of five or more modules of the same tone.
  for (let line = 0; line < size; line += 1) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let index = 1; index < size; index += 1) {
        const current = horizontal ? at(line, index) : at(index, line);
        const previous = horizontal ? at(line, index - 1) : at(index - 1, line);
        if (current === previous) {
          run += 1;
          continue;
        }
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  // Rule 2: every two by two block of one tone.
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const tone = at(row, column);
      if (tone === at(row, column + 1) && tone === at(row + 1, column) && tone === at(row + 1, column + 1)) {
        score += 3;
      }
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 sequences with four light modules beside them.
  const patterns = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true]
  ];
  for (let line = 0; line < size; line += 1) {
    for (let index = 0; index + 11 <= size; index += 1) {
      for (const pattern of patterns) {
        let horizontalMatch = true;
        let verticalMatch = true;
        for (let offset = 0; offset < 11; offset += 1) {
          if (at(line, index + offset) !== pattern[offset]) horizontalMatch = false;
          if (at(index + offset, line) !== pattern[offset]) verticalMatch = false;
        }
        if (horizontalMatch) score += 40;
        if (verticalMatch) score += 40;
      }
    }
  }

  // Rule 4: deviation from an even balance of dark and light.
  let dark = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) if (at(row, column)) dark += 1;
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** Encodes `content` and returns the matrix with the mask the standard prefers. */
export function encodeQrCode(content: string): QrCode {
  const bytes = new TextEncoder().encode(content);
  const version = chooseVersion(bytes.length);
  const codewords = buildCodewords(bytes, version);
  const size = version * 4 + 17;

  let best: { grid: Grid; score: number } | undefined;
  for (let mask = 0; mask < MASKS.length; mask += 1) {
    const grid: Grid = Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
    reserveFunctionPatterns(grid, version);
    placeData(grid, codewords, mask);
    placeFormatInformation(grid, mask);
    placeVersionInformation(grid, version);
    const score = penalty(grid);
    if (!best || score < best.score) best = { grid, score };
  }

  return {
    version,
    size,
    modules: best!.grid.map(row => row.map(module => module === true))
  };
}
