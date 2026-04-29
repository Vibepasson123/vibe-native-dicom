/* eslint-disable no-bitwise */
// Minimal pure-TypeScript PNG encoder for RGBA8 buffers.
//
// We don't have a zlib dep on the JS side, so the IDAT chunk uses
// "stored" deflate blocks (BTYPE=00) — uncompressed but legal per
// RFC 1950 / 1951. The result is larger on disk but we hand it to RN's
// <Image> via a base64 data URI immediately, never written to a file.
//
// This is a Phase 3.1 placeholder. Phase 3.2 replaces it with native
// rendering through Skia or Metal so we don't pay PNG encode cost per
// W/L slider tick.

const SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// CRC-32 (PNG variant — IEEE 802.3 polynomial). Computed lazily.
let crcTable: Uint32Array | null = null;
function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}
function crc32(bytes: Uint8Array): number {
  if (!crcTable) crcTable = buildCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (crcTable[((c ^ (bytes[i] ?? 0)) & 0xff) as number]! ^ (c >>> 8)) >>> 0;
  }

  return (c ^ 0xffffffff) >>> 0;
}

// Adler-32 (zlib checksum).
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + (bytes[i] ?? 0)) % 65521;
    b = (b + a) % 65521;
  }

  return ((b << 16) | a) >>> 0;
}

function writeUint32BE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 0xff;

  out[offset + 1] = (value >>> 16) & 0xff;

  out[offset + 2] = (value >>> 8) & 0xff;

  out[offset + 3] = value & 0xff;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeUint32BE(out, 0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  // CRC covers type + data, not length.
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(out.subarray(4, 8), 0);
  crcInput.set(data, 4);
  writeUint32BE(out, 8 + data.length, crc32(crcInput));
  return out;
}

/**
 * Build a "stored" deflate stream for `raw` — i.e. a zlib stream
 * (header + uncompressed deflate blocks + adler32 trailer). Each block
 * carries up to 65535 bytes.
 */
function buildStoredZlib(raw: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  let cursor = 0;
  while (cursor < raw.length) {
    const remaining = raw.length - cursor;
    const blockLen = Math.min(remaining, 65535);
    const isFinal = blockLen === remaining;
    const header = new Uint8Array(5);
    // BFINAL bit (1 if last block) + BTYPE=00 (stored).
    header[0] = isFinal ? 1 : 0;

    header[1] = blockLen & 0xff;

    header[2] = (blockLen >>> 8) & 0xff;

    header[3] = ~blockLen & 0xff;

    header[4] = (~blockLen >>> 8) & 0xff;
    blocks.push(header);
    blocks.push(raw.subarray(cursor, cursor + blockLen));
    cursor += blockLen;
  }
  // zlib header: CMF=0x78 (deflate, 32K window), FLG chosen so
  // (CMF*256+FLG) % 31 === 0. 0x78 0x01 satisfies that.
  const zlibHeader = new Uint8Array([0x78, 0x01]);
  const adler = adler32(raw);
  const adlerBytes = new Uint8Array(4);
  writeUint32BE(adlerBytes, 0, adler);

  let totalLen = zlibHeader.length + adlerBytes.length;
  for (const b of blocks) totalLen += b.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  out.set(zlibHeader, off);
  off += zlibHeader.length;
  for (const b of blocks) {
    out.set(b, off);
    off += b.length;
  }
  out.set(adlerBytes, off);
  return out;
}

/**
 * Encode RGBA8 pixels (4 bytes/pixel, row-major) into PNG bytes.
 * Each PNG scanline is prefixed with a 1-byte filter type — we use
 * filter type 0 (None) on every row. Cheaper to encode than the
 * adaptive filters; the IDAT is still RFC-compliant.
 */
export function encodeRgbaPng(
  rgba: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `encodeRgbaPng: expected ${width * height * 4} bytes, got ${rgba.length}`
    );
  }

  // IHDR.
  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, width);
  writeUint32BE(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression method (deflate)
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method (none)

  // Filtered scanlines: prepend 0x00 (filter None) to each row.
  const rowSize = width * 4;
  const filtered = new Uint8Array((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (rowSize + 1)] = 0;
    filtered.set(
      rgba.subarray(y * rowSize, (y + 1) * rowSize),
      y * (rowSize + 1) + 1
    );
  }

  const idatPayload = buildStoredZlib(filtered);

  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', idatPayload);
  const iendChunk = chunk('IEND', new Uint8Array(0));

  const total =
    SIGNATURE.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const out = new Uint8Array(total);
  let off = 0;
  out.set(SIGNATURE, off);
  off += SIGNATURE.length;
  out.set(ihdrChunk, off);
  off += ihdrChunk.length;
  out.set(idatChunk, off);
  off += idatChunk.length;
  out.set(iendChunk, off);
  return out;
}

/** Convert PNG bytes to a base64 data URI suitable for <Image source={{ uri }}>. */
export function pngBytesToDataUri(png: Uint8Array): string {
  const ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 3 <= png.length; i += 3) {
    const v = (png[i]! << 16) | (png[i + 1]! << 8) | png[i + 2]!;

    out +=
      ALPHABET[(v >>> 18) & 0x3f]! +
      ALPHABET[(v >>> 12) & 0x3f]! +
      ALPHABET[(v >>> 6) & 0x3f]! +
      ALPHABET[v & 0x3f]!;
  }
  if (i < png.length) {
    const a = png[i]!;
    const b = i + 1 < png.length ? png[i + 1]! : 0;

    const v = (a << 16) | (b << 8);

    out += ALPHABET[(v >>> 18) & 0x3f]! + ALPHABET[(v >>> 12) & 0x3f]!;

    out += i + 1 < png.length ? ALPHABET[(v >>> 6) & 0x3f]! : '=';
    out += '=';
  }
  return `data:image/png;base64,${out}`;
}
