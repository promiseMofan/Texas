#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const portArgIndex = process.argv.indexOf('--port');
const port = Number(portArgIndex >= 0 ? process.argv[portArgIndex + 1] : 4173) || 4173;
const host = process.argv.includes('--localhost') ? '127.0.0.1' : '0.0.0.0';
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function safePath(requestUrl) {
  const pathname = decodeURIComponent((requestUrl || '/').split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  return resolved.startsWith(root + path.sep) || resolved === root ? resolved : null;
}

const server = http.createServer((request, response) => {
  const filePath = safePath(request.url);
  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (!statError && stat.isDirectory()) {
      response.writeHead(301, { Location: request.url.replace(/\/?$/, '/') + 'index.html' });
      response.end();
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500);
        response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      response.end(data);
    });
  });
});

server.listen(port, host, () => {
  console.log(`手机测试服务已启动：http://localhost:${port}`);
  if (host !== '127.0.0.1') {
    for (const [interfaceName, interfaces] of Object.entries(os.networkInterfaces())) {
      for (const network of interfaces || []) {
        if (network.family === 'IPv4' && !network.internal) {
          console.log(`同一 Wi-Fi 下用手机打开：http://${network.address}:${port}（网卡 ${interfaceName}）`);
        }
      }
    }
  }
  console.log('按 Ctrl+C 停止服务。');
});
