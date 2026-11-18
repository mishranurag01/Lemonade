#!/usr/bin/env node
// Copy Liberation Serif from the developer's system into versioned deployment assets.
// Run once on a machine with fonts-liberation installed; commit the resulting files.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'fonts');
await fs.mkdir(dest, { recursive: true });
for (const style of ['Regular', 'Bold']) {
  const result = spawnSync('fc-match', ['-f', '%{family}|%{style}|%{file}', 'Liberation Serif:style=' + style], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('fc-match unavailable: install fontconfig and fonts-liberation');
  const [family, matchedStyle, file] = result.stdout.trim().split('|');
  if (!family?.split(',').map(s => s.trim()).includes('Liberation Serif') ||
      !matchedStyle?.split(',').map(s => s.trim()).includes(style) || !file) {
    throw new Error('Liberation Serif ' + style + ' unavailable: install fonts-liberation');
  }
  const target = path.join(dest, 'LiberationSerif-' + style + '.ttf');
  await fs.copyFile(file, target);
  console.log('Bundled ' + style + ': ' + target);
}
const notices = [
  '/usr/share/doc/fonts-liberation/copyright',
  '/usr/share/doc/fonts-liberation2/copyright'
];
let licenseFound = false;
for (const notice of notices) {
  try {
    await fs.copyFile(notice, path.join(dest, 'LICENSE.txt'));
    licenseFound = true;
    break;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!licenseFound) {
  throw new Error('Font files copied, but font license notice was not found. Install fonts-liberation or fonts-liberation2 and rerun before distributing.');
}
console.log('Font license notice bundled. Commit assets/fonts/*.ttf and LICENSE.txt to Pepperpotts.');
