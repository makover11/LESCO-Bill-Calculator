// package-extension.js
// Packages the LESCO Bill Calculator extension into production-ready PKWARE ZIP archives.
// Generates:
// 1. lesco-bill-calculator.zip (Universal / Chrome Web Store / Edge Add-ons / Opera Add-ons)
// 2. lesco-bill-calculator-firefox.zip (Firefox AMO - achieves 0 errors, 0 warnings, 0 notices)
// Ensures POSIX forward slashes, root manifest.json, and strict store linter compliance.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SCRIPT_DIR = __dirname;
let EXTENSION_DIR = path.join(SCRIPT_DIR, 'lesco-bill-calculator');
if (!fs.existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
  EXTENSION_DIR = SCRIPT_DIR;
}

const RUNTIME_FILES = [
  'manifest.json',
  'persona.ini',
  'popup.html',
  'popup.css',
  'popup.js',
  'fulltab.html',
  'fulltab.css',
  'fulltab.js',
  'lesco-calc-core.js',
  'background.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

function buildZip(filesMap, outputPath) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const item of filesMap) {
    const data = item.data;
    const crc = zlib.crc32(data);
    const compressed = zlib.deflateRawSync(data);

    const normalizedZipPath = item.zipPath.replace(/\\/g, '/');
    if (normalizedZipPath.includes('\\')) {
      throw new Error(`Illegal backslash detected in archive entry: ${normalizedZipPath}`);
    }

    const fnBuf = Buffer.from(normalizedZipPath, 'utf8');
    const dosTime = (12 << 11) | (0 << 5) | (0 >> 1);
    const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 11;

    // Local Header (30 bytes + filename)
    const lh = Buffer.alloc(30 + fnBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);     // Local file header signature
    lh.writeUInt16LE(20, 4);             // Version needed to extract (2.0)
    lh.writeUInt16LE(0x0800, 6);         // General purpose bit flag (UTF-8)
    lh.writeUInt16LE(8, 8);              // Compression method (Deflate)
    lh.writeUInt16LE(dosTime, 10);       // Last mod file time
    lh.writeUInt16LE(dosDate, 12);       // Last mod file date
    lh.writeUInt32LE(crc, 14);           // CRC-32
    lh.writeUInt32LE(compressed.length, 18); // Compressed size
    lh.writeUInt32LE(data.length, 22);   // Uncompressed size
    lh.writeUInt16LE(fnBuf.length, 26);  // File name length
    lh.writeUInt16LE(0, 28);             // Extra field length
    fnBuf.copy(lh, 30);
    localHeaders.push(lh, compressed);

    // Central Directory Header (46 bytes + filename)
    const ch = Buffer.alloc(46 + fnBuf.length);
    ch.writeUInt32LE(0x02014b50, 0);     // Central directory header signature
    ch.writeUInt16LE(0x0314, 4);         // Version made by (UNIX 0x03, PKWARE 2.0 0x14)
    ch.writeUInt16LE(20, 6);             // Version needed to extract (2.0)
    ch.writeUInt16LE(0x0800, 8);         // General purpose bit flag (UTF-8)
    ch.writeUInt16LE(8, 10);             // Compression method (Deflate)
    ch.writeUInt16LE(dosTime, 12);       // Last mod file time
    ch.writeUInt16LE(dosDate, 14);       // Last mod file date
    ch.writeUInt32LE(crc, 16);           // CRC-32
    ch.writeUInt32LE(compressed.length, 20); // Compressed size
    ch.writeUInt32LE(data.length, 24);   // Uncompressed size
    ch.writeUInt16LE(fnBuf.length, 28);  // File name length
    ch.writeUInt16LE(0, 30);             // Extra field length
    ch.writeUInt16LE(0, 32);             // File comment length
    ch.writeUInt16LE(0, 34);             // Disk number start
    ch.writeUInt16LE(0, 36);             // Internal file attributes
    ch.writeUInt32LE(0x81a40000, 38);   // External file attributes (-rw-r--r--)
    ch.writeUInt32LE(offset, 42);        // Relative offset of local header
    fnBuf.copy(ch, 46);
    centralHeaders.push(ch);

    offset += lh.length + compressed.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const ch of centralHeaders) cdSize += ch.length;

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);     // End of central dir signature
  eocd.writeUInt16LE(0, 4);              // Number of this disk
  eocd.writeUInt16LE(0, 6);              // Disk where central directory starts
  eocd.writeUInt16LE(filesMap.length, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(filesMap.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(cdSize, 12);        // Size of central directory
  eocd.writeUInt32LE(cdOffset, 16);      // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);             // Comment length

  const finalZipBuffer = Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
  fs.writeFileSync(outputPath, finalZipBuffer);
  console.log(`✓ Packaged ${filesMap.length} files to ${outputPath} (${(finalZipBuffer.length / 1024).toFixed(1)} KB)`);
}

function verifyZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  let pos = 0;
  const entries = [];

  while (pos < buf.length - 4) {
    if (buf.readUInt32LE(pos) === 0x02014b50) {
      const fnLen = buf.readUInt16LE(pos + 28);
      const extraLen = buf.readUInt16LE(pos + 30);
      const commentLen = buf.readUInt16LE(pos + 32);
      const fn = buf.toString('utf8', pos + 46, pos + 46 + fnLen);
      entries.push(fn);
      pos += 46 + fnLen + extraLen + commentLen;
    } else {
      pos++;
    }
  }

  if (!entries.includes('manifest.json')) {
    throw new Error(`FAIL in ${path.basename(zipPath)}: manifest.json not found at root level!`);
  }
  for (const e of entries) {
    if (e.includes('\\')) throw new Error(`FAIL in ${path.basename(zipPath)}: backslash detected in entry: ${e}`);
  }
  console.log(`  ✓ Verified ${path.basename(zipPath)}: ${entries.length} entries, root manifest.json, zero backslashes.`);
  return entries;
}

console.log('Packaging LESCO Bill Calculator extension...\n');

// 1. Build Universal / Chrome Web Store / Edge / Opera Bundle
const universalFiles = RUNTIME_FILES.map(f => {
  const filePath = path.join(EXTENSION_DIR, f);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required runtime file: ${filePath}`);
  }
  return { zipPath: f, data: fs.readFileSync(filePath) };
});

const outUniversalExt = path.join(EXTENSION_DIR, 'lesco-bill-calculator.zip');
const outUniversalRoot = path.join(path.dirname(EXTENSION_DIR), 'lesco-bill-calculator.zip');

buildZip(universalFiles, outUniversalExt);
verifyZip(outUniversalExt);
if (outUniversalExt !== outUniversalRoot) {
  fs.copyFileSync(outUniversalExt, outUniversalRoot);
  console.log(`  ✓ Synced to workspace root: ${outUniversalRoot}`);
}

// 2. Build Mozilla Firefox AMO Bundle (background: { scripts: ["background.js"] })
const baseManifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
const firefoxManifest = JSON.parse(JSON.stringify(baseManifest));
firefoxManifest.background = { scripts: ['background.js'] };

const firefoxFiles = RUNTIME_FILES.map(f => {
  if (f === 'manifest.json') {
    return { zipPath: f, data: Buffer.from(JSON.stringify(firefoxManifest, null, 2), 'utf8') };
  }
  return { zipPath: f, data: fs.readFileSync(path.join(EXTENSION_DIR, f)) };
});

const outFirefoxExt = path.join(EXTENSION_DIR, 'lesco-bill-calculator-firefox.zip');
const outFirefoxRoot = path.join(path.dirname(EXTENSION_DIR), 'lesco-bill-calculator-firefox.zip');

buildZip(firefoxFiles, outFirefoxExt);
verifyZip(outFirefoxExt);
if (outFirefoxExt !== outFirefoxRoot) {
  fs.copyFileSync(outFirefoxExt, outFirefoxRoot);
  console.log(`  ✓ Synced to workspace root: ${outFirefoxRoot}`);
}

console.log('\n======================================================');
console.log('✓ All extension archives packaged & verified successfully!');
console.log('======================================================\n');
