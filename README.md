# 德州扑克单机版

一款无需联网的中文德州扑克桌面游戏。你将与三名不同风格的电脑玩家对局。

## 功能

- 标准无限注德州扑克流程：盲注、翻牌、转牌、河牌、摊牌
- 可见荷官与逐张发牌、烧牌翻牌、弃牌入弃牌区动画
- 下注、跟注、过牌、弃牌和全下
- 多人全下与边池结算
- 三种电脑策略风格及动态思考
- 简单、一般、困难三档AI难度
- 困难模式使用蒙特卡洛胜率估计与离线训练的抽象MCCFR混合策略
- 本地战绩、音效和游戏速度设置
- macOS DMG 与 Windows EXE 安装包
- 手机浏览器/PWA：iPhone（Safari）与 Android（Chrome）可添加到主屏幕，支持离线游玩

## 开发运行

```bash
npm install
npm start
```

## 测试与打包

```bash
npm test
npm run train:ai
npm run dist:mac
npm run dist:win
```

打包结果位于 `dist` 文件夹。

## 手机端安装（推荐：PWA）

项目的牌局逻辑不依赖 Electron，已经提供了手机适配布局、Web App Manifest 和离线缓存。发布到一个 HTTPS 网站后，苹果和安卓都可以直接安装：

1. 把整个项目（至少包含 `index.html`、`styles.css`、`renderer.js`、`src/`、`assets/`、`manifest.webmanifest`、`sw.js`、`pwa.js`）部署到 HTTPS 静态网站，例如 GitHub Pages、Vercel、Netlify 或自己的服务器。
2. iPhone 用 Safari 打开网址，点“分享” → “添加到主屏幕”。首次打开后就可以像 App 一样离线玩。
3. Android 用 Chrome 打开网址，点地址栏的“安装”或菜单里的“添加到主屏幕/安装应用”。

把改动提交并推送到 `main` 后，在 GitHub 仓库的 **Settings → Pages → Build and deployment** 中，将 Source 选择为 **Deploy from a branch**，分支选择 **main**，目录选择 **/(root)** 并保存。发布完成后，本仓库预计可通过 `https://promisemofan.github.io/Texas/` 打开。

本地只想先看手机布局，可以在电脑项目目录执行：

```bash
npm run serve
```

终端会打印同一 Wi-Fi 下的手机访问地址。这个地址适合联调界面；要让 Service Worker 真正缓存并离线安装，正式地址必须使用 HTTPS（本机 `localhost`/`127.0.0.1` 开发环境除外）。

## 原生 APK / iOS 安装包

PWA 是目前成本最低、同时覆盖 iPhone 和 Android 的方案，不需要 App Store 审核，也不需要分别维护两套牌局代码。如果必须生成 Android APK 或提交苹果 App Store，可以在这套 Web 版本稳定后再用 Capacitor 包装；Android 需要 Android Studio，iOS 需要 macOS + Xcode 和苹果开发者账号。Electron 生成的 DMG/EXE 不能直接安装到手机。

AI训练在开发阶段离线完成，App运行时只读取生成的平均策略，不联网，也不会读取任何电脑玩家不应知道的底牌。
