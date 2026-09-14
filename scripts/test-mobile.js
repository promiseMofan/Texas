#!/usr/bin/env node
'use strict';

// Integration tests use real browser engines and isolated, disposable profiles.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { webkit, chromium, devices } = require('playwright');
const Session = require('../src/session-store');
const assets = new Set(require('./web-assets'));
const root = path.resolve(__dirname, '..', 'dist', 'web');
const screenshots = path.resolve(__dirname, '..', 'dist', 'mobile-checks');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const settings = { speed: 'fast', sound: false, confirmAllin: false, difficulty: 'normal' };
let updateRevision = false;
let blockIcon = true;
let serverPort;

if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('先执行 npm run build:web');
fs.mkdirSync(screenshots, { recursive: true });

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const asset = url.pathname.replace(/^\/(Texas|broken)\//, '').replace(/^\//, '') || 'index.html';
  if (!assets.has(asset)) { response.writeHead(404); response.end(); return; }
  if (url.pathname.startsWith('/broken/') && asset === 'assets/icon-512.png' && blockIcon) {
    response.writeHead(503); response.end('Test: download unavailable'); return;
  }
  let content = fs.readFileSync(path.join(root, asset));
  if (asset === 'sw.js' && updateRevision && url.pathname.startsWith('/Texas/')) {
    content = content.toString().replace(/const BUILD_REVISION = '[^']+';/, "const BUILD_REVISION = 'integration-update';");
  }
  response.writeHead(200, { 'Content-Type': mime[path.extname(asset)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  response.end(content);
});

async function stopOrigin() {
  await new Promise((resolve) => {
    server.close(resolve);
    if (server.closeAllConnections) server.closeAllConnections();
  });
}

async function startOrigin() {
  await new Promise((resolve) => server.listen(serverPort || 0, '127.0.0.1', resolve));
  serverPort = server.address().port;
}

async function newContext(browser, profile, extra = {}) {
  const context = await browser.newContext({ ...profile, reducedMotion: 'reduce', ...extra });
  await context.addInitScript((preferences) => {
    if (!localStorage.getItem('holdem-settings')) localStorage.setItem('holdem-settings', JSON.stringify(preferences));
  }, settings);
  return context;
}

async function readSave(page) {
  const raw = await page.evaluate(() => localStorage.getItem('holdem-session-v1'));
  const saved = Session.parse(raw);
  assert(saved, 'The persisted game must be valid at every resumable boundary');
  return saved;
}

async function waitForDecision(page) {
  await page.waitForFunction(() => !document.getElementById('check-call-button').disabled ||
    !document.getElementById('show-result-button').hidden, null, { timeout: 45000 });
}

async function checkBounds(page, name, landscape = false) {
  const result = await page.evaluate(() => {
    const selectors = ['.player-panel', '.seat-bottom .card', '.community-cards .card', '.action-buttons'];
    const rectangles = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((element) => {
      const rect = element.getBoundingClientRect();
      return { selector, x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, width: rect.width };
    }));
    const buttons = Array.from(document.querySelectorAll('.action-buttons button:not([hidden])')).map((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, height: rect.height };
    });
    const stage = document.querySelector('.felt-stage').getBoundingClientRect();
    const human = document.querySelector('#seat-0 .player-panel').getBoundingClientRect();
    const pot = document.querySelector('.pot-display').getBoundingClientRect();
    const hand = document.querySelector('#seat-0 .card');
    return {
      width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth, rectangles, buttons,
      stageBottom: stage.bottom, humanBottom: human.bottom,
      potBottom: pot.bottom, handTop: hand ? hand.getBoundingClientRect().top : null
    };
  });
  assert(result.pageWidth <= result.width + 1, name + ': no horizontal page overflow');
  for (const rect of result.rectangles) {
    assert(rect.width > 0 && rect.x >= -1 && rect.right <= result.width + 1, name + ': visible ' + JSON.stringify(rect));
  }
  for (const button of result.buttons) {
    assert(button.height >= 44, name + ': touch targets are at least 44px tall');
    if (landscape) assert(button.bottom <= result.height + 1, name + ': action buttons fit in landscape without scrolling: ' + JSON.stringify({ button, height: result.height }));
  }
  assert(result.humanBottom <= result.stageBottom + 1, name + ': human chips are not clipped by the action panel');
  if (result.handTop !== null) assert(result.potBottom <= result.handTop + 1, name + ': the pot does not overlap the human hand');
}

async function playToResult(page) {
  for (let action = 0; action < 80; action += 1) {
    await waitForDecision(page);
    if (await page.locator('#show-result-button').isVisible()) return readSave(page);
    await page.locator('#check-call-button').click();
  }
  throw new Error('Hand did not finish within 80 human decisions');
}

async function runGame(browser, profile, name, origin) {
  const context = await newContext(browser, profile);
  let page = await context.newPage();
  const errors = [];
  const listen = (target) => target.on('pageerror', (error) => errors.push(error.message));
  listen(page);
  await page.goto(origin + '/Texas/');
  await page.locator('#offline-status[data-state="ready"]').waitFor({ state: 'attached', timeout: 30000 });
  if (name === 'iphone') {
    await page.locator('#install-from-start').click();
    await page.locator('#install-steps').waitFor({ state: 'visible' });
    const instructions = await page.locator('#install-steps').innerText();
    assert(instructions.includes('Safari'), 'iPhone install instructions: ' + instructions + ' / ' + await page.evaluate(() => navigator.userAgent));
    await page.locator('#close-install').click();
  }
  await page.locator('#start-game-button').click();
  await page.locator('#card-animation-layer > *').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.setViewportSize({ width: profile.viewport.height, height: profile.viewport.width });
  await waitForDecision(page);
  await checkBounds(page, name + ' landscape', true);
  await page.screenshot({ path: path.join(screenshots, name + '-landscape.png') });
  const beforeRotation = await readSave(page);
  await page.setViewportSize(profile.viewport);
  await checkBounds(page, name + ' portrait');
  await page.screenshot({ path: path.join(screenshots, name + '-portrait.png') });
  const afterRotation = await readSave(page);
  assert.deepStrictEqual(afterRotation.state.players, beforeRotation.state.players, 'Rotation keeps hands and chips');
  assert.deepStrictEqual(afterRotation.state.deck, beforeRotation.state.deck, 'Rotation keeps the deck');

  for (const viewport of name === 'iphone'
    ? [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 375, height: 667 }, { width: 667, height: 375 }, { width: 430, height: 932 }, { width: 932, height: 430 }, { width: 844, height: 270 }, { width: 568, height: 270 }]
    : [{ width: 360, height: 740 }, { width: 740, height: 360 }, { width: 412, height: 915 }, { width: 915, height: 412 }, { width: 740, height: 280 }]) {
    await page.setViewportSize(viewport);
    await checkBounds(page, name + ' ' + viewport.width + 'x' + viewport.height, viewport.width > viewport.height);
  }
  await page.screenshot({ path: path.join(screenshots, name + '-compact-landscape.png') });
  await page.setViewportSize(profile.viewport);

  // A new standalone window must boot with no network and restore the same turn.
  // Stop the actual origin server. WebKit's emulated offline switch can abort
  // navigations before dispatching the service worker; a closed server tests
  // real loss of connectivity, including cold worker startup.
  await stopOrigin();
  await page.reload();
  await page.close();
  page = await context.newPage();
  listen(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.goto(origin + '/Texas/?source=homescreen');
  await waitForDecision(page);
  assert.strictEqual(await page.locator('#difficulty-modal').getAttribute('aria-hidden'), 'true');
  const offline = await readSave(page);
  assert.deepStrictEqual(offline.state.players, afterRotation.state.players, 'Offline cold start restores the current turn');
  assert.strictEqual(await page.evaluate(() => fetch('./network-probe').then(() => true, () => false)), false, 'Network is actually unavailable');
  await page.locator('#offline-status[data-state="ready"]').waitFor({ state: 'attached', timeout: 30000 });

  const result = await playToResult(page);
  assert.strictEqual(result.resume.type, 'result');
  assert.strictEqual(result.state.players.reduce((sum, player) => sum + player.chips, 0), 8000);
  await page.reload();
  await page.locator('#show-result-button').waitFor({ state: 'visible' });
  const reloaded = await readSave(page);
  assert.deepStrictEqual(reloaded.stats, result.stats, 'Reload does not count or pay out a result twice');
  assert.deepStrictEqual(reloaded.state.awards, result.state.awards);

  // Reload during dealing: resume from the saved deck with no second blind payment.
  await page.locator('#show-result-button').click();
  await page.locator('#next-hand-button').click();
  const pendingDeal = await readSave(page);
  assert.strictEqual(pendingDeal.resume.type, 'deal');
  await page.reload();
  await waitForDecision(page);
  const resumedDeal = await readSave(page);
  assert.strictEqual(resumedDeal.state.handNumber, pendingDeal.state.handNumber);
  const expectedDeck = pendingDeal.state.deck.slice();
  const expectedHands = [[], [], [], []];
  for (let round = 0; round < 2; round += 1) {
    let seat = pendingDeal.state.smallBlindIndex;
    for (let dealt = 0; dealt < pendingDeal.state.players.filter((player) => player.inHand).length; dealt += 1) {
      expectedHands[seat].push(expectedDeck.pop());
      do { seat = (seat + 1) % 4; } while (!pendingDeal.state.players[seat].inHand);
    }
  }
  assert.deepStrictEqual(resumedDeal.state.players.map((player) => player.hand), expectedHands, 'Interrupted deal keeps the exact cards');

  if (!resumedDeal.state.handComplete) {
    await page.locator('#fold-button').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('holdem-session-v1')).resume.type === 'after-action');
    const folded = await readSave(page);
    await page.reload();
    await page.locator('#show-result-button').waitFor({ state: 'visible', timeout: 60000 });
    assert.strictEqual((await readSave(page)).stats.folds, folded.stats.folds, 'Interrupted fold is not counted twice');
  }

  assert.deepStrictEqual(errors, [], name + ': no uncaught browser errors');
  await startOrigin();
  console.log('✓ ' + name + ': portrait/landscape, rotate during dealing, offline cold start, full hand, reload during deal/fold, saved results');
  return { context, page };
}

async function checkUpdate(page, context) {
  await context.setOffline(false);
  await page.setViewportSize({ width: 390, height: 844 });
  const saved = await readSave(page);
  await page.evaluate(async () => {
    const cache = await caches.open('another-app-keep');
    await cache.put('./another-app', new Response('keep'));
  });
  updateRevision = true;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(() => !document.getElementById('update-app').hidden, null, { timeout: 30000 });
  assert.deepStrictEqual((await readSave(page)).state.players, saved.state.players, 'Preparing an update does not interrupt the hand');
  await page.locator('#settings-button').click();
  await page.locator('#install-from-settings').click();
  await page.locator('#update-app').click();
  await page.waitForFunction(() => document.getElementById('offline-status').dataset.state === 'ready' &&
    !document.getElementById('install-modal').classList.contains('open'), null, { timeout: 30000 });
  assert.deepStrictEqual((await readSave(page)).stats, saved.stats, 'Accepting an update retains stats');
  assert.deepStrictEqual((await readSave(page)).state.players, saved.state.players, 'Accepting an update retains chips');
  const keys = await page.evaluate(() => caches.keys());
  assert(keys.includes('another-app-keep'), 'Updating must preserve caches from other apps');
  assert(keys.some((key) => key.endsWith(':integration-update')), 'The new worker is active');
  console.log('✓ PWA update is explicit, preserves game progress, and isolates caches by scope');
}

async function checkStorageAndCacheFailures(browser, origin) {
  const context = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  await context.addInitScript((preferences) => {
    localStorage.setItem('holdem-settings', JSON.stringify(preferences));
    Storage.prototype.setItem = () => { throw new DOMException('Test quota exceeded', 'QuotaExceededError'); };
  }, settings);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/broken/');
  await page.locator('#start-game-button').click();
  await waitForDecision(page);
  assert((await page.locator('#save-status').textContent()).includes('无法保存'));
  await page.locator('#offline-status[data-state="error"]').waitFor({ state: 'attached', timeout: 30000 });
  assert.deepStrictEqual(errors, [], 'Storage or cache failure must not break the game');
  blockIcon = false;
  await page.locator('#settings-button').click();
  await page.locator('#install-from-settings').click();
  await page.locator('#retry-offline').click();
  await page.locator('#offline-status[data-state="ready"]').waitFor({ state: 'attached', timeout: 35000 });
  console.log('✓ Denied local storage remains playable; failed offline download is visible and can be retried');
  await context.close();
}

(async () => {
  const browsers = [];
  try {
    await startOrigin();
    const origin = 'http://127.0.0.1:' + server.address().port;
    const safari = await webkit.launch({ headless: true });
    browsers.push(safari);
    const chrome = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL } : {}) });
    browsers.push(chrome);
    const iphone = await runGame(safari, devices['iPhone 13'], 'iphone', origin);
    const android = await runGame(chrome, devices['Pixel 7'], 'android', origin);
    await checkUpdate(iphone.page, iphone.context);
    await checkStorageAndCacheFailures(safari, origin);
    const desktop = await newContext(chrome, { viewport: { width: 1440, height: 900 } });
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(origin + '/');
    await desktopPage.locator('#start-game-button').click();
    await waitForDecision(desktopPage);
    await checkBounds(desktopPage, 'desktop');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
    assert.strictEqual(manifest.orientation, 'any');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.start_url, './');
    await android.context.close();
    await iphone.context.close();
    await desktop.close();
    console.log('✓ Desktop layout and manifest also verified. Screenshots: dist/mobile-checks');
  } finally {
    await Promise.all(browsers.map((browser) => browser.close()));
    await stopOrigin();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
