# Cowan-Panel

轻量级自托管 NAS / 服务器导航面板，灵感来自 [sun-panel](https://github.com/hslr-s/sun-panel)（已停更），现代化重构：**单用户、无鉴权、单二进制、Docker 一键部署**。支持 sun-panel 配置 JSON 双向导入导出，可无缝迁移。

## 特性

- 🗂 分组 + 书签卡片，拖拽排序，自定义图标 / 描述 / 卡片底色
- 🖼 暗色 / 亮色主题、自定义壁纸
- 🔍 favicon 一键抓取，支持图标上传与外链
- 💓 服务在线状态探测（可开关、可设间隔），卡片状态点
- 📦 **sun-panel JSON 导入 / 导出**（与 sun-panel v1 格式同构，双向互导）+ 自有全量备份
- 🚀 前端嵌入后端，产物为单二进制；低内存占用

## 快速开始

### Docker（推荐）

```bash
docker compose up -d
# 访问 http://127.0.0.1:8100
```

### 本地开发 / 构建

依赖：Node 20+ / pnpm、Go 1.23+（Windows 可放入 `.tools/go`，`build.ps1` 会自动使用）

```powershell
.\build.ps1            # 构建前端 + 单二进制 backend\cowan-panel.exe
.\backend\cowan-panel.exe   # 默认 127.0.0.1:8100，数据在 ./data
```

前端单独开发：

```powershell
cd frontend
pnpm install
pnpm dev    # 已配置代理到 127.0.0.1:8100
```

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `COWAN_PORT` | `8100` | 监听端口 |
| `COWAN_DATA` | `./data` | 数据目录（SQLite、上传图标） |

## 从 sun-panel 迁移

1. 在 sun-panel 中导出配置，得到 `*.sun-panel.json`
2. Cowan-Panel 设置页 → 数据 → 导入 sun-panel JSON（可选覆盖 / 追加）
3. 说明：sun-panel 的 JSON 不包含图标文件本体（`/uploads/...` 仅是路径），导入后此类图标会显示为占位图标，可在设置页逐个"抓取 favicon"补全；外链图标不受影响

## API 概览

详见 [PLAN.md](PLAN.md) §6。全部位于 `/api` 前缀，无鉴权——请仅部署在内网，或在反向代理层自行加防护。

## 目录结构

见 [PLAN.md](PLAN.md) §2。

## License

MIT
