# Cowan-Panel

轻量级自托管 NAS / 服务器导航面板，灵感来自 [sun-panel](https://github.com/hslr-s/sun-panel)（已停更），现代化重构：**单用户、无鉴权、单二进制、Docker 一键部署**。支持 sun-panel 配置 JSON 双向导入导出，可无缝迁移。

## 特性

- 🗂 分组 + 书签卡片，拖拽排序，自定义图标 / 描述 / 卡片底色
- 🖼 暗色 / 亮色主题、自定义壁纸
- 🔍 favicon 一键抓取，支持图标上传与外链
- 💓 一键在线探测：首页右下角按钮，点一次并发探测全部站点，卡片状态灯即时更新（无后台定时任务）
- 📦 **sun-panel JSON 导入 / 导出**（与 sun-panel v1 格式同构，双向互导）+ 自有全量备份
- 🚀 前端嵌入后端，产物为单二进制；低内存占用

## 快速开始

### Docker（推荐）

```bash
docker compose up -d
# 访问 http://127.0.0.1:8100
```

### 本地开发 / 构建

依赖：Node 20.19+ / pnpm 11、Go 1.23+（Windows 可放入 `.tools/go`，`build.ps1` 会自动使用）

```powershell
.\build.ps1            # 构建前端 + 单二进制 backend\cowan-panel.exe
.\backend\cowan-panel.exe   # 默认 127.0.0.1:8100，数据在 ./data
```

前端单独构建：

```powershell
cd frontend
pnpm install
pnpm build        # tsc 类型检查 + esbuild 打包，产物在 dist/
pnpm test:build   # esbuild 跨平台解析逻辑的单元测试
pnpm dev          # 开发模式（Vite，代理到 127.0.0.1:8100）
```

> 为什么不用 `vite build`：部分受限环境禁止 Node 子进程使用管道 stdio，esbuild 的 JS service 会 EPERM；
> [tools/build.mjs](frontend/tools/build.mjs) 改用 esbuild CLI（继承 stdio），并按平台自动解析原生二进制：
> `@esbuild/win32-x64`（Windows）、`@esbuild/linux-x64|arm64`（容器）、`@esbuild/darwin-*`（macOS）。
> 也支持用环境变量 `ESBUILD_BINARY_PATH` 显式指定。

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `COWAN_PORT` | `8100` | 监听端口 |
| `COWAN_DATA` | `./data` | 数据目录（SQLite、上传图标） |

## 从 sun-panel 迁移

1. 在 sun-panel 中导出配置，得到 `*.sun-panel.json`
2. Cowan-Panel 设置页 → 数据 → 导入 sun-panel JSON（可选覆盖 / 追加）
3. 说明：sun-panel 的 JSON 不包含图标文件本体（`/uploads/...` 仅是路径），导入后此类图标会显示为占位图标，可在设置页逐个"抓取 favicon"补全；外链图标不受影响

## 在线探测

首页右下角「探测」按钮：点一次会对**全部卡片**做并发探测（TCP 3s，失败回退 HTTP HEAD/GET），卡片右上角显示 🟢 在线 / 🔴 离线，完成后提示在线/离线数量。没有后台定时任务。

网络走向可分别控制：

| 对象 | 行为 |
|---|---|
| 外网分组（默认） | 探测直连；在「设置 → 网络」打开「在线探测走代理」后，走该页配置的 HTTP 代理 |
| 内网分组 | 在「设置 → 分组与卡片」编辑分组时勾选「内网分组」，该组卡片探测**始终直连**，不受代理开关影响 |

图标抓取（favicon）始终使用「网络」页配置的代理；探测是否走代理由上面的开关 + 分组属性决定。

## API 概览

详见 [PLAN.md](PLAN.md) §6。全部位于 `/api` 前缀，无鉴权——请仅部署在内网，或在反向代理层自行加防护。

## 目录结构

见 [PLAN.md](PLAN.md) §2。

## License

MIT
