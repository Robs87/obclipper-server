# ObClipper 服务端

ObClipper 是一个文章剪藏系统的服务端组件，负责接收文章 URL，抓取网页内容，转换为 Markdown 格式，并上传至 Cloudflare R2（或 S3 兼容存储）。

## 系统架构

```
微信小程序 → [本服务] → R2/S3 存储 ← Obsidian 插件同步
```

系统由三部分组成：
1. **微信小程序**：分享文章 URL 到本服务
2. **本服务（obclipper-server）**：抓取文章、转换 Markdown、上传存储
3. **Obsidian 插件**：从 R2/S3 同步 Markdown 文件到本地知识库

## 功能特性

- 🌐 支持任意网页文章抓取
- 📱 针对微信公众号文章特殊优化
- 🔄 HTML → Markdown 高质量转换（支持 GFM 扩展语法）
- 🖼️ 图片自动下载、压缩（最大 1200px，85% 质量）并上传
- ☁️ Cloudflare R2 / S3 兼容存储
- 🔒 API Key 认证保护
- 📝 自动生成 YAML frontmatter（标题、作者、来源、日期等）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

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

### 4. 启动服务

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
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
  "uploadedImages": [...],
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

## Docker 部署

```bash
# 构建镜像
docker build -t obclipper-server .

# 运行容器
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name obclipper \
  obclipper-server
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

- ✅ 微信公众号（mp.weixin.qq.com）
- ✅ 知乎专栏
- ✅ 简书
- ✅ 通用博客和新闻网站
- ✅ 任何含有 article 标签或常见文章容器的网页
