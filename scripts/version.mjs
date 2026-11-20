import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];

if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('用法: node scripts/version.mjs 1.2.0');
  process.exit(1);
}

const [major, minor, patch] = version.split('.').map(Number);
const now = new Date();
const buildDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const versionCode = major * 10000 + minor * 100 + patch;

function applyVersion(relative, rules) {
  const file = resolve(root, relative);
  let text = readFileSync(file, 'utf8');
  for (const [pattern, replacement] of rules) {
    if (!pattern.test(text)) {
      console.error(`未匹配到 ${relative} 中的 ${pattern}`);
      process.exit(1);
    }
    text = text.replace(pattern, replacement);
  }
  writeFileSync(file, text);
  console.log(`已更新 ${relative}`);
}

applyVersion('package.json', [[/"version": "[^"]+"/, `"version": "${version}"`]]);

applyVersion('src/manifest.json', [
  [/"versionName": "[^"]+"/, `"versionName": "${version}"`],
  [/"versionCode": "[^"]+"/, `"versionCode": "${versionCode}"`]
]);

applyVersion('android/app/build.gradle', [
  [/versionCode \d+/, `versionCode ${versionCode}`],
  [/versionName '[^']+'/, `versionName '${version}'`]
]);

applyVersion('src/config/app.ts', [
  [/APP_VERSION = '[^']+'/, `APP_VERSION = '${version}'`],
  [/APP_BUILD = '[^']+'/, `APP_BUILD = '${buildDate}'`]
]);

console.log(`版本已统一为 ${version}（versionCode ${versionCode}）`);
