// Read container metadata without executing or changing image files.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './prepare-public.mjs';

function exifTags(data) {
  const tiff = data.subarray(data.subarray(0, 6).equals(Buffer.from('Exif\0\0')) ? 6 : 0);
  const little = tiff.toString('ascii', 0, 2) === 'II';
  if (!little && tiff.toString('ascii', 0, 2) !== 'MM') return { malformed: true };
  const u16 = offset => little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const u32 = offset => little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  try {
    if (u16(2) !== 42) return { malformed: true };
    const start = u32(4);
    const count = u16(start);
    const tags = Array.from({ length: count }, (_, i) => u16(start + 2 + i * 12));
    return { tags: tags.map(tag => '0x' + tag.toString(16)), gpsPointer: tags.includes(0x8825) };
  } catch { return { malformed: true }; }
}

const records = [];
function walk(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['site-dist', '.git'].includes(entry.name)) continue;
    const name = prefix + entry.name;
    if (entry.isDirectory()) { walk(join(directory, entry.name), name + '/'); continue; }
    if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
    const data = readFileSync(join(directory, entry.name));
    const metadata = [];
    if (data.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) {
      let offset = 2;
      while (offset + 4 <= data.length) {
        if (data[offset] !== 0xff) break;
        while (data[offset] === 0xff) offset++;
        const marker = data[offset++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const length = data.readUInt16BE(offset);
        if (length < 2 || offset + length > data.length) { metadata.push({ malformed: true }); break; }
        const payload = data.subarray(offset + 2, offset + length);
        if (marker === 0xe1) {
          metadata.push(payload.subarray(0, 6).equals(Buffer.from('Exif\0\0'))
            ? { type: 'EXIF', ...exifTags(payload) } : { type: 'APP1 (possible XMP)' });
        } else if (marker === 0xed || marker === 0xfe) metadata.push({ type: marker === 0xed ? 'IPTC/APP13' : 'Comment' });
        offset += length;
      }
    } else if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
      for (let offset = 12; offset + 8 <= data.length;) {
        const type = data.toString('ascii', offset, offset + 4);
        const length = data.readUInt32LE(offset + 4);
        if (offset + 8 + length > data.length) { metadata.push({ malformed: true }); break; }
        if (['EXIF', 'XMP '].includes(type)) metadata.push({ type, ...(type === 'EXIF' ? exifTags(data.subarray(offset + 8, offset + 8 + length)) : {}) });
        offset += 8 + length + (length % 2);
      }
    } else if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      for (let offset = 8; offset + 12 <= data.length;) {
        const length = data.readUInt32BE(offset);
        const type = data.toString('ascii', offset + 4, offset + 8);
        if (offset + 12 + length > data.length) { metadata.push({ malformed: true }); break; }
        if (['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)) metadata.push({ type, ...(type === 'eXIf' ? exifTags(data.subarray(offset + 8, offset + 8 + length)) : {}) });
        offset += 12 + length;
      }
    } else metadata.push({ unknownFormat: true });
    records.push({ file: name, bytes: data.length, metadata });
  }
}
walk(projectRoot);
console.log(JSON.stringify(records, null, 2));
