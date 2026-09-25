# QC64 Web Driver

[中文](#中文) | [English](#english)

An open-source browser driver for the **M6 Lite+ (QC64)** magnetic-switch keyboard (VID `2233` / PID `006B`). It replaces the vendor's MMPanel app and runs in the browser over WebHID, with nothing to install.

**Online:** https://yangd1.github.io/qc64-web-driver/

---

## 中文

### 功能

- **灯光**：背光效果、颜色、亮度、速度，氛围灯
- **改键**：普通键、媒体键、鼠标键、FN、禁用；高级键 DKS / SNAP / CANCEL；一键预设（WASD DKS 等）；双层切换
- **磁轴触发**：每键触发/释放行程、快速触发（RT）、死区，支持批量选择
- **校准**：完整行程校准，实时显示每键进度
- **设置**：性能模式（野兽 / 鹰眼 / 开发者）、FPS 增强、自动校准；Win 锁、Fn/Alt 互换、自动关灯；高亮模式、饱和度；配置导出 / 导入 (JSON)
- **调试台**：查看收发的原始报文，发送自定义命令（已屏蔽恢复出厂与 IAP 升级命令）
- 中英双语界面

### 使用

1. 使用 Chrome / Edge 桌面版（需要 WebHID，Firefox / Safari 不支持）
2. **先完全退出 MMPanel**，否则它会占用设备，或者覆盖网页写入的配置
3. 打开 https://yangd1.github.io/qc64-web-driver/ ，点击「连接」，选择键盘

不接键盘时也能体验：在地址后加 `?demo`，例如 `http://localhost:5173/?demo`。

### 开发

```bash
git clone https://github.com/YangD1/qc64-web-driver.git
cd qc64-web-driver
pnpm install
pnpm dev      # 开发服务器
pnpm build    # 输出到 dist/
```

推送到 `main` 后，GitHub Actions 会自动部署到 GitHub Pages（需先在仓库 Settings → Pages 里把 Source 设为 “GitHub Actions”）。

### 协议

协议逆向笔记见 [docs/PROTOCOL.md](docs/PROTOCOL.md)，代码实现见 `src/protocol/`。

### 免责声明

这是非官方项目，与键盘厂商无关。协议通过逆向得到，写入设备的风险由你自行承担。

---

## English

### Features

- **Lighting**: backlight effect, color, brightness, speed and ambient light
- **Key remapping**:
  - regular, media, mouse and FN keys, or disable a key
  - advanced keys: DKS, SNAP and CANCEL
  - one-click presets such as WASD DKS
  - two layers
- **Actuation**: per-key actuation and release points, Rapid Trigger and dead zones, with multi-select
- **Calibration**: full-travel calibration with live per-key progress
- **Settings**:
  - performance mode (Beast / Hawk-eye / Developer), FPS boost and auto-calibration
  - Win lock, Fn/Alt swap and auto lights-off
  - highlight mode and saturation
  - profile export and import as JSON
- **Console**:
  - inspect raw traffic and send custom commands
  - factory-reset and IAP commands are blocked
- Chinese and English UI

### Usage

1. Use desktop Chrome or Edge. WebHID is required, so Firefox and Safari won't work.
2. **Quit MMPanel completely first.** Otherwise it may hold the device or overwrite your changes.
3. Open https://yangd1.github.io/qc64-web-driver/, click **Connect** and pick the keyboard.

To try it without a keyboard, append `?demo` to the URL.

### Development

```bash
git clone https://github.com/YangD1/qc64-web-driver.git
cd qc64-web-driver
pnpm install
pnpm dev
pnpm build
```

Pushing to `main` deploys to GitHub Pages through GitHub Actions. First set Settings → Pages → Source to "GitHub Actions".

### Protocol

See [docs/PROTOCOL.md](docs/PROTOCOL.md) for the reverse-engineering notes (written in Chinese) and `src/protocol/` for the implementation.

### Disclaimer

This is an unofficial project with no affiliation to the keyboard vendor. The protocol was reverse-engineered, so you write to your device at your own risk.

## License

[MIT](LICENSE)
