import fs from 'node:fs';
import crypto from 'node:crypto';

function align(value, boundary) {
  return Math.ceil(value / boundary) * boundary;
}

function readCString(buffer, start) {
  const end = buffer.indexOf(0, start);
  if (end < 0) throw new Error(`unterminated C string at byte ${start}`);
  return { value: buffer.toString('utf8', start, end), next: end + 1 };
}

function readUInt64BE(buffer, offset) {
  const value = buffer.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`uint64 exceeds JS safe integer at byte ${offset}`);
  }
  return Number(value);
}

// UnityFS uses raw LZ4 blocks (compression flags 2=LZ4, 3=LZ4HC).
// This decoder intentionally implements only the block format needed by UnityFS;
// it does not accept framed LZ4 data.
export function decompressLz4Block(input, expectedSize) {
  const output = Buffer.allocUnsafe(expectedSize);
  let ip = 0;
  let op = 0;

  while (ip < input.length) {
    const token = input[ip++];
    let literalLength = token >>> 4;
    if (literalLength === 15) {
      let extra;
      do {
        if (ip >= input.length) throw new Error('truncated LZ4 literal length');
        extra = input[ip++];
        literalLength += extra;
      } while (extra === 255);
    }

    if (ip + literalLength > input.length || op + literalLength > output.length) {
      throw new Error('LZ4 literal copy exceeds input/output boundary');
    }
    input.copy(output, op, ip, ip + literalLength);
    ip += literalLength;
    op += literalLength;

    // The final sequence may contain literals only.
    if (ip >= input.length) break;
    if (ip + 2 > input.length) throw new Error('truncated LZ4 match offset');

    const matchOffset = input[ip] | (input[ip + 1] << 8);
    ip += 2;
    if (matchOffset === 0 || matchOffset > op) {
      throw new Error(`invalid LZ4 match offset ${matchOffset}`);
    }

    let matchLength = token & 0x0f;
    if (matchLength === 15) {
      let extra;
      do {
        if (ip >= input.length) throw new Error('truncated LZ4 match length');
        extra = input[ip++];
        matchLength += extra;
      } while (extra === 255);
    }
    matchLength += 4;
    if (op + matchLength > output.length) {
      throw new Error('LZ4 match copy exceeds output boundary');
    }

    let source = op - matchOffset;
    for (let i = 0; i < matchLength; i += 1) {
      output[op++] = output[source++];
    }
  }

  if (op !== expectedSize) {
    throw new Error(`LZ4 decoded size mismatch: expected ${expectedSize}, got ${op}`);
  }
  return output;
}

function decompressByType(input, expectedSize, compressionType, label) {
  if (compressionType === 0) {
    if (input.length !== expectedSize) {
      throw new Error(`${label}: uncompressed size mismatch ${input.length} != ${expectedSize}`);
    }
    return input;
  }
  if (compressionType === 2 || compressionType === 3) {
    return decompressLz4Block(input, expectedSize);
  }
  if (compressionType === 1) {
    throw new Error(`${label}: UnityFS LZMA compression is unsupported by this self-contained scanner`);
  }
  throw new Error(`${label}: unsupported UnityFS compression type ${compressionType}`);
}

export function parseUnityFsBuffer(bundle) {
  let pos = 0;
  const signature = readCString(bundle, pos);
  pos = signature.next;
  if (signature.value !== 'UnityFS') {
    throw new Error(`not UnityFS: signature=${JSON.stringify(signature.value)}`);
  }
  if (pos + 4 > bundle.length) throw new Error('truncated UnityFS header');
  const formatVersion = bundle.readUInt32BE(pos);
  pos += 4;
  const unityVersion = readCString(bundle, pos);
  pos = unityVersion.next;
  const unityRevision = readCString(bundle, pos);
  pos = unityRevision.next;
  if (pos + 20 > bundle.length) throw new Error('truncated UnityFS size header');
  const declaredFileSize = readUInt64BE(bundle, pos);
  pos += 8;
  const compressedBlocksInfoSize = bundle.readUInt32BE(pos);
  pos += 4;
  const uncompressedBlocksInfoSize = bundle.readUInt32BE(pos);
  pos += 4;
  const flags = bundle.readUInt32BE(pos);
  pos += 4;

  if (declaredFileSize !== bundle.length) {
    throw new Error(`UnityFS declared size mismatch ${declaredFileSize} != ${bundle.length}`);
  }

  if (formatVersion >= 7) pos = align(pos, 16);
  const headerEnd = pos;
  const blocksInfoAtEnd = (flags & 0x80) !== 0;
  const blocksInfoPos = blocksInfoAtEnd ? bundle.length - compressedBlocksInfoSize : pos;
  if (blocksInfoPos < 0 || blocksInfoPos + compressedBlocksInfoSize > bundle.length) {
    throw new Error('UnityFS blocks-info range is outside bundle');
  }

  const compressedBlocksInfo = bundle.subarray(
    blocksInfoPos,
    blocksInfoPos + compressedBlocksInfoSize,
  );
  const blocksInfo = decompressByType(
    compressedBlocksInfo,
    uncompressedBlocksInfoSize,
    flags & 0x3f,
    'blocks-info',
  );

  let ip = 16; // uncompressed data hash
  if (ip + 4 > blocksInfo.length) throw new Error('truncated blocks-info block count');
  const blockCount = blocksInfo.readUInt32BE(ip);
  ip += 4;
  const blocks = [];
  let totalUncompressedSize = 0;
  for (let i = 0; i < blockCount; i += 1) {
    if (ip + 10 > blocksInfo.length) throw new Error(`truncated block descriptor ${i}`);
    const uncompressedSize = blocksInfo.readUInt32BE(ip);
    ip += 4;
    const compressedSize = blocksInfo.readUInt32BE(ip);
    ip += 4;
    const blockFlags = blocksInfo.readUInt16BE(ip);
    ip += 2;
    blocks.push({ uncompressedSize, compressedSize, flags: blockFlags });
    totalUncompressedSize += uncompressedSize;
  }

  if (ip + 4 > blocksInfo.length) throw new Error('truncated directory count');
  const directoryCount = blocksInfo.readUInt32BE(ip);
  ip += 4;
  const directories = [];
  for (let i = 0; i < directoryCount; i += 1) {
    if (ip + 20 > blocksInfo.length) throw new Error(`truncated directory descriptor ${i}`);
    const offset = readUInt64BE(blocksInfo, ip);
    ip += 8;
    const size = readUInt64BE(blocksInfo, ip);
    ip += 8;
    const entryFlags = blocksInfo.readUInt32BE(ip);
    ip += 4;
    const name = readCString(blocksInfo, ip);
    ip = name.next;
    directories.push({ offset, size, flags: entryFlags, name: name.value });
  }
  if (ip !== blocksInfo.length) {
    throw new Error(`blocks-info trailing bytes: parsed ${ip}, total ${blocksInfo.length}`);
  }

  let dataPos = blocksInfoAtEnd ? headerEnd : blocksInfoPos + compressedBlocksInfoSize;
  if ((flags & 0x200) !== 0) dataPos = align(dataPos, 16);

  const decompressed = Buffer.allocUnsafe(totalUncompressedSize);
  let outPos = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (dataPos + block.compressedSize > bundle.length) {
      throw new Error(`compressed block ${i} exceeds bundle boundary`);
    }
    const input = bundle.subarray(dataPos, dataPos + block.compressedSize);
    dataPos += block.compressedSize;
    const output = decompressByType(
      input,
      block.uncompressedSize,
      block.flags & 0x3f,
      `data block ${i}`,
    );
    output.copy(decompressed, outPos);
    outPos += output.length;
  }
  if (outPos !== totalUncompressedSize) {
    throw new Error(`decompressed bundle size mismatch ${outPos} != ${totalUncompressedSize}`);
  }

  for (const entry of directories) {
    if (entry.offset + entry.size > decompressed.length) {
      throw new Error(`directory entry ${entry.name} exceeds decompressed data boundary`);
    }
  }

  return {
    header: {
      signature: signature.value,
      formatVersion,
      unityVersion: unityVersion.value,
      unityRevision: unityRevision.value,
      declaredFileSize,
      compressedBlocksInfoSize,
      uncompressedBlocksInfoSize,
      flags,
      blockCount,
      directoryCount,
    },
    directories,
    decompressed,
  };
}

function countOccurrences(haystack, needle) {
  let count = 0;
  const offsets = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    offsets.push(at);
    from = at + Math.max(needle.length, 1);
  }
  return { count, offsets };
}

export function inspectUnityFsBundle(filePath, runtimePaths) {
  const raw = fs.readFileSync(filePath);
  const bundleSha256 = crypto.createHash('sha256').update(raw).digest('hex');
  const parsed = parseUnityFsBuffer(raw);
  const cabEntries = parsed.directories.filter((entry) => {
    const lower = entry.name.toLowerCase();
    return lower.startsWith('cab-') && !lower.endsWith('.ress') && !lower.endsWith('.resource');
  });
  if (cabEntries.length === 0) throw new Error('UnityFS contains no embedded CAB entry');

  const cabs = cabEntries.map((entry) => {
    const bytes = parsed.decompressed.subarray(entry.offset, entry.offset + entry.size);
    return {
      name: entry.name,
      sizeBytes: entry.size,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      bytes,
      lowerBytes: (() => {
        const lowered = Buffer.from(bytes);
        for (let i = 0; i < lowered.length; i += 1) {
          const value = lowered[i];
          if (value >= 0x41 && value <= 0x5a) lowered[i] = value + 0x20;
        }
        return lowered;
      })(),
    };
  });

  const results = [];
  for (const runtimePath of runtimePaths) {
    const normalized = runtimePath.toLowerCase();
    const needle = Buffer.from(normalized, 'utf8');
    const matches = [];
    for (const cab of cabs) {
      // Runtime paths stored by these bundles are ASCII/UTF-8 and were proven in
      // Stage 3-2 with case-normalized exact full-path byte comparison.
      const found = countOccurrences(cab.lowerBytes, needle);
      for (const offset of found.offsets) {
        matches.push({ embeddedCab: cab.name, runtimePathByteOffset: offset });
      }
    }
    results.push({ runtimePath: normalized, exactOccurrenceCount: matches.length, matches });
  }

  return {
    fileName: filePath.split(/[\\/]/).pop(),
    sizeBytes: raw.length,
    sha256: bundleSha256,
    unityFs: parsed.header,
    embeddedCabs: cabs.map(({ name, sizeBytes, sha256 }) => ({ name, sizeBytes, sha256 })),
    results,
  };
}
