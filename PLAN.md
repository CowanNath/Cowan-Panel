# Cowan-Panel 项目规划（精简轻量版）

自托管 NAS / 服务器导航面板（仿 sun-panel，取其精华并现代化重构）。**单用户、无认证、轻量优先**。

## 1. 技术选型

| 层 | 选型 | 说明 |
|---|---|---|
| 后端 | Go 1.22+ / Gin | 单二进制、低内存占用 |
| 数据库 | SQLite (GORM + `glebarez/sqlite` 纯Go驱动) | 免 CGO，零依赖 |
| 前端 | React 18 + Vite + TS + Ant Design | - |
| 拖拽 | dnd-kit | 分组/卡片排序 |
| 部署 | Docker 多阶段构建；前端 dist 用 `embed` 打进二进制 | 产物 = 单二进制，数据挂 `/app/data` |

不做：用户系统 / JWT、搜索栏、多语言、访客模式、反向代理。API 无鉴权，仅内网或反代层自行加防护。

## 2. 目录结构

```
Cowan-Panel/
├── backend/
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── model/        # Group / Item / Setting
│   │   ├── handler/      # CRUD、导入导出、上传
│   │   ├── service/      # 业务逻辑、sun-panel JSON 解析
│   │   └── probe/        # 在线状态探测
│   └── web/              # embed 前端 dist
├── frontend/src/
│   ├── pages/            # Home(导航) / Settings(设置+导入导出)
│   ├── components/       # GroupCard / BookmarkCard / StatusDot
│   ├── api/
│   └── stores/
├── Dockerfile  docker-compose.yml
└── PLAN.md
```

## 3. 功能范围

### MVP
- [ ] 分组：增删改、拖拽排序
- [ ] 书签卡片：名称、URL、图标、描述、卡片背景色、拖拽排序、新标签打开
- [ ] 图标：上传 + URL 引用 + favicon 一键抓取
- [ ] 主题：暗色/亮色、自定义壁纸、卡片样式设置
- [ ] **sun-panel JSON 导入 / 导出**（见 §4）
- [ ] 数据整体导出备份 / 恢复（本系统自身格式）
- [ ] 前端嵌入后端，单二进制运行

### 第二阶段
- [ ] 在线状态探测：定时 TCP/HTTP 探测，绿/红状态点（可开关、可设间隔）
- [ ] Dockerfile + compose + README

## 4. sun-panel JSON 导入/导出（核心需求）

导出格式实测（v1.8.1）：
```jsonc
{
  "version": 1, "appName": "Sun-Panel-Config", "exportTime": "...", "appVersion": "1.8.1", "md5": "...",
  "icons": [                          // 注意：icons = 分组数组
    {
      "title": "AI", "sort": 3,
      "children": [{
        "icon": { "itemType": 2, "src": "/uploads/....svg", "text": "", "backgroundColor": "" },
        "sort": 1, "title": "DeepSeek", "url": "https://chat.deepseek.com/",
        "lanUrl": "", "description": "", "openMethod": 2, "cardType": 1,
        "backgroundColor": "#2a2a2a6b", "expandParam": {}
      }],
      "cardStyle": { "style": 1, "textColor": "#ffffff", ... }
    }
  ],
  "bulletins": [], "settings": { ... }
}
```

**导入规则：**
- `icons[]` → Group，`children[]` → Item，字段直接映射（title/url/description/sort/backgroundColor/openMethod）
- 图标 `src` 处理：
  - http(s) 外链 → 保留原样
  - `/uploads/...` 本地路径 → JSON 不含文件本体，导入时**自动尝试抓取该站点 favicon**，失败则回退为"首字母 + 主题色"占位图标
  - `itemType: 0`（无图标）→ 同上占位
- 忽略 `bulletins`、`md5` 校验（仅提示）
- 导入模式可选：覆盖 / 追加

**导出规则：**
- 导出为与上述**完全同构**的 JSON（`appName: "Cowan-Panel-Config"`），即：可双向互导，也能把自己数据再导回 sun-panel

## 5. 数据模型

```go
Group   { ID, Name, Sort, CreatedAt }
Item    { ID, GroupID, Name, URL, IconURL, Description, Sort,
          CardBackgroundColor, OpenInNewTab, CheckEnabled,
          LastStatus, LastCheckedAt }
Setting { Key, Value }   // 站点标题、壁纸、主题、卡片样式、探测间隔
```

## 6. API（`/api` 前缀，无鉴权）

```
GET/POST/PUT/DELETE /api/groups[/:id]   PUT /api/groups/sort
GET/POST/PUT/DELETE /api/items[/:id]    PUT /api/items/sort
POST /api/items/check                   # 手动探测单个
GET  /api/status                        # 全部状态（前端轮询或 SSE）
POST /api/icons/upload                  GET /api/assets/:file
POST /api/favicon/fetch                 # {url} → 抓 favicon 存本地
GET  /api/settings      PUT /api/settings
POST /api/import/sunpanel               # 上传 JSON，body: {mode: overwrite|append}
GET  /api/export/sunpanel               # 下载 sun-panel 兼容 JSON
GET  /api/export/full   POST /api/import/full
```

## 7. 里程碑

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M1 骨架 | 前后端脚手架、SQLite、API 通 | dev 跑通 |
| M2 核心 | 分组/卡片 CRUD、拖拽排序、图标上传/favicon 抓取、主题壁纸 | 首页可正常摆导航 |
| M3 导入导出 | sun-panel JSON 双向互导，**用你的真实备份文件验证导入** | 你的 200+ 书签完整迁入 |
| M4 探测 | 定时探测 + 状态点 | 卡片有实时状态 |
| M5 交付 | Dockerfile、compose、README | `docker compose up -d` 一键运行 |
