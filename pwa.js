(() => {
  'use strict';

  if (window.desktop || location.protocol === 'file:') return;

  const byId = (id) => document.getElementById(id);
  const installButton = byId('install-button');
  const modal = byId('install-modal');
  const status = byId('offline-status');
  const retryButton = byId('retry-offline');
  const updateButton = byId('update-app');
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inAppBrowser = /MicroMessenger|QQ\/|FBAN|FBAV|Instagram|DingTalk|AlipayClient/i.test(navigator.userAgent);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const localDevelopment = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
  const secure = location.protocol === 'https:' || localDevelopment;
  let registration;
  let installPrompt;
  let lastFocus;
  let updating = false;
  let preparing;
  let cached = false;

  function showStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
    retryButton.hidden = state !== 'error';
    byId('offline-summary').hidden = false;
    byId('offline-summary').textContent = message;
    byId('version-line').textContent = '德州扑克单机版 · ' + message;
  }

  function showInstallHelp() {
    lastFocus = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    byId('close-install').focus({ preventScroll: true });
    if (registration && !preparing) verifyOffline();
  }

  function closeInstallHelp() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }

  async function offerInstall() {
    if (!installPrompt) { showInstallHelp(); return; }
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) { showInstallHelp(); }
  }

  [installButton, byId('install-from-start'), byId('install-from-settings')].forEach((button) => {
    button.hidden = false;
    button.addEventListener('click', button.id === 'install-from-settings' ? showInstallHelp : offerInstall);
  });
  byId('close-install').addEventListener('click', closeInstallHelp);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeInstallHelp(); });
  document.addEventListener('keydown', (event) => {
    if (!modal.classList.contains('open')) return;
    if (event.key === 'Escape') closeInstallHelp();
    if (event.key !== 'Tab') return;
    const focusable = Array.from(modal.querySelectorAll('button, a[href]')).filter((element) => !element.hidden && !element.disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  if (!isIOS) {
    byId('install-title').textContent = '安装到手机';
    byId('install-intro').textContent = 'Android 推荐使用 Chrome，安装后可从主屏幕直接打开。';
    byId('install-steps').innerHTML = '<li>用 <strong>Chrome</strong> 打开本页，点右上角<strong>⋮ 菜单</strong>。</li>' +
      '<li>选择<strong>添加到主屏幕 → 安装</strong>或<strong>安装应用</strong>。也可点击本页的安装按钮。</li>' +
      '<li>从主屏幕打开游戏，首次保持联网，看到<strong>已可离线游玩</strong>后就能断网玩。</li>';
  }
  if (inAppBrowser) {
    byId('install-intro').textContent = '请先点当前浏览器右上角菜单，选择“在' + (isIOS ? ' Safari ' : '系统浏览器') + '中打开”，再按下面步骤安装。';
  }
  if (standalone()) {
    installButton.hidden = true;
    byId('install-from-start').hidden = true;
    byId('install-title').textContent = '已安装到主屏幕';
    byId('install-intro').textContent = '横竖屏跟随系统旋转，牌局自动保存在当前设备。';
    byId('install-steps').hidden = true;
  }
  const address = byId('install-address');
  if (secure) address.href = new URL('./', location.href).href;
  address.textContent = secure ? address.href : '打开 HTTPS 正式安装网址';

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    if (!standalone()) installButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
    byId('install-from-start').hidden = true;
  });

  function checkWorker(worker, type = 'OFFLINE_STATUS') {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = window.setTimeout(() => {
        channel.port1.close();
        reject(new Error('offline status timed out'));
      }, type === 'REPAIR_OFFLINE' ? 20000 : 8000);
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timer);
        channel.port1.close();
        resolve(event.data);
      };
      worker.postMessage({ type }, [channel.port2]);
    });
  }

  async function verifyOffline() {
    if (!registration || !registration.active) return;
    try {
      const result = await checkWorker(registration.active);
      cached = result.ready === true;
      showStatus(cached ? '已可离线游玩' : '离线内容尚未完整保存，请联网重试', cached ? 'ready' : 'error');
    } catch (error) {
      showStatus('离线准备尚未完成；若是旧版本，请关闭本页和游戏后重新打开', 'error');
    }
  }

  function offerUpdate() {
    if (!registration.waiting) return;
    updateButton.hidden = false;
    byId('install-from-settings').textContent = '新版本已就绪 · 安装与离线状态';
  }

  function waitForActivation(registration) {
    if (registration.active) return Promise.resolve();
    const worker = registration.installing || registration.waiting;
    if (!worker) return Promise.reject(new Error('No installing worker'));
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        window.clearTimeout(timer);
        worker.removeEventListener('statechange', check);
        if (error) reject(error);
        else resolve();
      };
      const check = () => {
        if (worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('Offline download failed'));
      };
      const timer = window.setTimeout(() => finish(new Error('Offline download timed out')), 20000);
      worker.addEventListener('statechange', check);
      check();
    });
  }

  async function prepareOffline() {
    if (preparing) return preparing;
    if (!secure) {
      showStatus('当前为 HTTP 预览地址，无法离线安装。请打开下方正式网址', 'unavailable');
      return;
    }
    if (!('serviceWorker' in navigator)) {
      showStatus('此浏览器不支持离线安装，请用 Safari 或 Chrome 打开', 'unavailable');
      return;
    }
    preparing = (async () => {
      if (!cached) showStatus('正在准备离线内容，请保持联网…', 'loading');
      try {
        registration = await navigator.serviceWorker.getRegistration(new URL('./', location.href).href);
        if (registration && registration.active) await verifyOffline();
        registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
        offerUpdate();
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') offerUpdate();
            if (worker.state === 'activated') verifyOffline();
            if (worker.state === 'redundant' && !cached) showStatus('离线内容下载失败，请联网重试', 'error');
          });
        });
        // Unlike navigator.serviceWorker.ready, this also settles on failure,
        // so Retry can immediately start a new installation attempt.
        await waitForActivation(registration);
        await verifyOffline();
      } catch (error) {
        if (!cached) showStatus('离线内容尚未准备好，请联网后重试', 'error');
      }
    })();
    try { await preparing; } finally { preparing = null; }
  }

  retryButton.addEventListener('click', async () => {
    if (preparing) await preparing;
    showStatus('正在重新准备离线内容…', 'loading');
    if (registration) {
      try {
        if (registration.active) await checkWorker(registration.active, 'REPAIR_OFFLINE');
        await registration.update();
      } catch (error) { /* prepareOffline reports a useful status below. */ }
    }
    await prepareOffline();
  });
  updateButton.addEventListener('click', () => {
    if (!registration || !registration.waiting) return;
    if (!window.dispatchEvent(new Event('holdem:before-update', { cancelable: true }))) {
      updateButton.textContent = '暂时无法保存进度，请稍后再更新';
      return;
    }
    updating = true;
    updateButton.disabled = true;
    updateButton.textContent = '正在更新…';
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload();
    else verifyOffline();
  });
  window.addEventListener('online', prepareOffline);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !registration || preparing) return;
    verifyOffline();
    registration.update().catch(() => {});
  });
  prepareOffline();
})();
