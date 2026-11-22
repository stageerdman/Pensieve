#!/usr/bin/env node
// Read-only check that a backup folder is an exact copy of its source.
// Compares file count, total bytes and a SHA-256 of every file; touches nothing.
// Usage: node scripts/verify-backup.mjs <source-dir> <backup-dir>
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readlink } from 'node:fs/promises';
import { join, relative } from 'node:path';

async function walk(root, dir = root, out = new Map()) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(root, full);
    if (entry.isDirectory()) await walk(root, full, out);
    else if (entry.isSymbolicLink()) out.set(rel, { size: 0, hash: `link:${await readlink(full)}` });
    else out.set(rel, { size: (await lstat(full)).size, hash: await sha256(full) });
  }
  return out;
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', (err) => reject(new Error(`sha256 failed for ${file}: ${err.message}`)));
  });
}

function summarize(files) {
  const manifest = createHash('sha256');
  let bytes = 0;
  for (const rel of [...files.keys()].sort()) {
    const { size, hash } = files.get(rel);
    bytes += size;
    manifest.update(`${rel}\0${size}\0${hash}\n`);
  }
  return { count: files.size, bytes, manifest: manifest.digest('hex') };
}

function differences(source, backup) {
  const problems = [];
  for (const [rel, s] of source) {
    const b = backup.get(rel);
    if (!b) problems.push(`missing in backup: ${rel}`);
    else if (b.size !== s.size || b.hash !== s.hash) problems.push(`content differs: ${rel}`);
  }
  for (const rel of backup.keys()) if (!source.has(rel)) problems.push(`extra in backup: ${rel}`);
  return problems;
}

async function main([sourceDir, backupDir]) {
  if (!sourceDir || !backupDir) throw new Error('usage: verify-backup.mjs <source-dir> <backup-dir>');
  const [source, backup] = await Promise.all([walk(sourceDir), walk(backupDir)]);
  console.log('source', JSON.stringify(summarize(source)));
  console.log('backup', JSON.stringify(summarize(backup)));
  const problems = differences(source, backup);
  problems.slice(0, 50).forEach((p) => console.log(p));
  console.log(problems.length ? `FAIL: ${problems.length} difference(s)` : 'OK: backup matches source exactly');
  process.exitCode = problems.length ? 1 : 0;
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`verify-backup: ${err.message}`);
  process.exitCode = 2;
});
