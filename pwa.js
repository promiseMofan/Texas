(() => {
  'use strict';

  const installButton = document.getElementById('install-button');
  let installPrompt = null;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  // iOS Safari does not expose beforeinstallprompt. Keep a visible helper
  // button on phones so the installation instructions are discoverable.
  if (installButton && isMobile && !isStandalone) {
    installButton.hidden = false;
  }

  const localDevelopment = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || localDevelopment)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!installPrompt) {
        showMobileInstallHelp();
        return;
      }
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      installButton.hidden = true;
    });
  }

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
  });

  function showMobileInstallHelp() {
    const message = isIOS
      ? '在 Safari 中点“分享” → “添加到主屏幕”，即可像 App 一样离线游玩。'
      : '在浏览器菜单中点“添加到主屏幕”或“安装应用”，即可离线游玩。';
    const toastRegion = document.getElementById('toast-region');
    if (!toastRegion) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }
})();
