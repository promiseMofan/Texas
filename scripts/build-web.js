#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assets = require('./web-assets');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'dist', 'web');
const hash = crypto.createHash('sha256');

// Validate before replacing the generated output. Only web assets are shipped.
for (const asset of assets) {
  hash.update(asset).update(fs.readFileSync(path.join(root, asset)));
}
const revision = hash.digest('hex').slice(0, 16);
fs.rmSync(destination, { recursive: true, force: true });
for (const asset of assets) {
  const target = path.join(destination, asset);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let content = fs.readFileSync(path.join(root, asset));
  if (asset === 'sw.js') content = content.toString().replace(/const BUILD_REVISION = '[^']+';/, "const BUILD_REVISION = '" + revision + "';");
  fs.writeFileSync(target, content);
}
fs.writeFileSync(path.join(destination, '.nojekyll'), '');
fs.writeFileSync(path.join(destination, '_headers'), '/sw.js\n  Cache-Control: no-cache\n/manifest.webmanifest\n  Cache-Control: no-cache\n');
console.log('手机安装网站已生成：dist/web（版本 ' + revision + '）');
console.log('支持 HTTPS 根目录或子目录部署，iPhone / Android 均可安装并自动横竖屏。');
