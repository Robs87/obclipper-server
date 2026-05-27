# ObClipper Server

[![Docker Image](https://img.shields.io/badge/ghcr.io-obclipper--server-blue?logo=docker)](https://github.com/Robs87/obclipper-server/pkgs/container/obclipper-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](package.json)

[English](README_EN.md) | 中文

ObClipper 是一个文章剪藏后端服务：接收文章 URL → 抓取网页内容 → 转换为 Markdown → 上传至 Cloudflare R2（S3 兼容存储）。配合微信小程序和 Obsidian 插件使用。

## 目录

- [架构](#架构)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
  - [Docker 部署（推荐）](#docker-部署推荐)
  - [源码运行](#源码运行)
- [项目结构](#项目结构)
- [API 文档](#api-文档)
- [生成的 Markdown 格式](#生成的-markdown-格式)
- [支持的站点](#支持的站点)
- [Contributing](#contributing)
- [License](#license)

## 架构

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  微信小程序   │────▶│  obclipper-server │────▶│  Cloudflare R2   │
│  分享文章 URL │     │                  │     │  (S3 兼容存储)    │
└─────────────┘     │  1. Playwright    │     │                  │
                    │     抓取网页      │     │  articles/       │
                    │  2. Turndown      │     │    2024-01-01 -   │
                    │     HTML→MD      │     │    文章标题.md     │
                    │  3. Sharp         │     │  images/          │
                    │     图片压缩      │     │    xxx.webp       │
                    │  4. S3 Client     │     └────────┬─────────┘
                    │     上传 R2       │              │
                    └──────────────────┘              │
                                                      ▼
                                            ┌──────────────────┐
                                            │  Obsidian 插件    │
                                            │  同步 Markdown 到 │
                                            │  本地知识库       │
                                            └──────────────────┘
```

系统由三部分组成：

1. **微信小程序** — 分享文章 URL 到本服务
2. **obclipper-server（本服务）** — 抓取文章、转换 Markdown、上传存储
3. **Obsidian 插件** — 从 R2/S3 同步 Markdown 文件到本地知识库

## 功能特性

- 支持任意网页文章抓取（Playwright + Chromium）
- 针对微信公众号文章特殊优化
- HTML → Markdown 高质量转换（支持 GFM 扩展语法）
- 图片自动下载、压缩（最大 1200px，85% 质量）并上传
- Cloudflare R2 / S3 兼容存储
- API Key 认证保护
- 自动生成 YAML frontmatter（标题、作者、来源、日期等）

## 快速开始

### Docker 部署（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/Robs87/obclipper-server.git
cd obclipper-server

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填写配置

# 3. 构建并启动
docker compose up -d
```

服务将在 `http://localhost:3080` 启动。

也可以直接构建运行：

```bash
docker build -t obclipper-server .

docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name obclipper \
  obclipper-server
```

### 源码运行

**前置要求：** Node.js 20+

```bash
# 1. 克隆仓库
git clone https://github.com/Robs87/obclipper-server.git
cd obclipper-server

# 2. 安装依赖
npm install

# 3. 安装 Playwright 浏览器
npx playwright install chromium

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 填写配置

# 5. 启动服务
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

#### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `PORT` | 服务端口 | 否（默认 3000） |
| `API_KEY` | API 认证密钥 | 是 |
| `R2_ENDPOINT` | R2/S3 端点地址 | 是 |
| `R2_ACCESS_KEY_ID` | 访问密钥 ID | 是 |
| `R2_SECRET_ACCESS_KEY` | 访问密钥 | 是 |
| `R2_BUCKET` | 存储桶名称 | 是 |
| `R2_PUBLIC_URL` | 公开访问地址（自定义域名） | 是 |
| `IMAGE_FOLDER` | 图片存储路径前缀 | 否（默认 images） |
| `ARTICLE_FOLDER` | 文章存储路径前缀 | 否（默认 articles） |

## 项目结构

```
obclipper-server/
├── src/
│   ├── index.js            # Express 服务入口，路由定义
│   ├── scraper.js          # Playwright 网页抓取，提取正文和元数据
│   ├── converter.js        # HTML → Markdown 转换（Turndown + GFM）
│   ├── uploader.js         # 图片压缩（Sharp）+ R2/S3 上传
│   └── middleware/
│       ├── auth.js         # API Key 认证中间件
│       └── errorHandler.js # 全局错误处理中间件
├── Dockerfile              # Docker 镜像构建（node:20-slim + Chromium）
├── docker-compose.yml      # Docker Compose 编排
├── package.json            # 项目依赖和脚本
└── .env.example            # 环境变量模板
```

## API 文档

所有受保护的接口需要在请求头中携带 `x-api-key`。

### 健康检查

```
GET /api/health
```

**响应：**
```json
{
  "success": true,
  "service": "obclipper-server",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 剪藏文章

```
POST /api/clip
Content-Type: application/json
x-api-key: your-api-key

{
  "url": "https://mp.weixin.qq.com/s/xxxxx",
  "title": "可选，自定义标题",
  "author": "可选，自定义作者"
}
```

**响应：**
```json
{
  "success": true,
  "articleKey": "articles/2024-01-01 - 文章标题.md",
  "articleUrl": "https://your-domain.com/articles/2024-01-01 - 文章标题.md",
  "title": "文章标题",
  "author": "作者名",
  "imageCount": 5,
  "uploadedImages": ["..."],
  "elapsed": "3.2s"
}
```

### 文章列表

```
GET /api/articles
x-api-key: your-api-key
```

**响应：**
```json
{
  "success": true,
  "count": 10,
  "articles": [
    {
      "key": "articles/2024-01-01 - 文章标题.md",
      "size": 12345,
      "lastModified": "2024-01-01T00:00:00.000Z",
      "url": "https://..."
    }
  ]
}
```

## 生成的 Markdown 格式

```markdown
---
title: "文章标题"
author: "作者"
source: "微信公众号"
url: "https://mp.weixin.qq.com/s/xxxxx"
date: 2024-01-01
clipped: 2024-01-01T12:00:00.000Z
tags: []
---

正文内容（已转为 Markdown 格式）...
```

## 支持的站点

- 微信公众号（mp.weixin.qq.com）
- 知乎专栏
- 简书
- 通用博客和新闻网站
- 任何含有 article 标签或常见文章容器的网页

## Contributing

欢迎贡献！请阅读 [贡献指南](CONTRIBUTING.md) 了解如何提交 Bug 报告、功能请求和 Pull Request。

发现安全漏洞？请参阅 [安全策略](SECURITY.md)。

## License

[MIT](LICENSE) © 2024-2026 Robs87
