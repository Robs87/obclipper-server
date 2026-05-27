# ObClipper Server

[![Docker Image](https://img.shields.io/badge/ghcr.io-obclipper--server-blue?logo=docker)](https://github.com/Robs87/obclipper-server/pkgs/container/obclipper-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](package.json)

English | [中文](README.md)

ObClipper is a web clipping backend that takes an article URL, scrapes the page content, converts it to Markdown, and uploads the result to Cloudflare R2 (S3-compatible storage). It is designed to work alongside a WeChat Mini Program and an Obsidian plugin.

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
  - [Docker (Recommended)](#docker-recommended)
  - [Running from Source](#running-from-source)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Generated Markdown Format](#generated-markdown-format)
- [Supported Sites](#supported-sites)
- [Contributing](#contributing)
- [License](#license)

## Architecture

```
┌───────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  WeChat Mini  │────▶│  obclipper-server │────▶│  Cloudflare R2   │
│  Program      │     │                  │     │  (S3-compatible) │
│  Share URL    │     │  1. Playwright   │     │                  │
└───────────────┘     │     Scrape page  │     │  articles/       │
                      │  2. Turndown     │     │    2024-01-01 -   │
                      │     HTML→MD     │     │    Article Title  │
                      │  3. Sharp        │     │    .md            │
                      │     Compress img │     │  images/          │
                      │  4. S3 Client    │     │    xxx.webp       │
                      │     Upload to R2 │     └────────┬─────────┘
                      └──────────────────┘              │
                                                        ▼
                                              ┌──────────────────┐
                                              │  Obsidian Plugin │
                                              │  Sync Markdown   │
                                              │  to local vault  │
                                              └──────────────────┘
```

The system has three components:

1. **WeChat Mini Program** — share article URLs to the service
2. **obclipper-server (this repo)** — scrape articles, convert to Markdown, upload to storage
3. **Obsidian Plugin** — sync Markdown files from R2/S3 into a local Obsidian vault

## Features

- Scrape any web article via Playwright + headless Chromium
- Special handling for WeChat Official Account (公众号) articles
- High-fidelity HTML → Markdown conversion with GFM extended syntax support
- Automatic image download, compression (max 1200px width, 85% quality), and re-upload
- Cloudflare R2 / any S3-compatible storage backend
- API Key authentication
- Auto-generated YAML frontmatter (title, author, source, date, etc.)

## Quick Start

### Docker (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/Robs87/obclipper-server.git
cd obclipper-server

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your settings

# 3. Build and start
docker compose up -d
```

The service will be available at `http://localhost:3080`.

You can also build and run manually:

```bash
docker build -t obclipper-server .

docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name obclipper \
  obclipper-server
```

### Running from Source

**Prerequisites:** Node.js 20+

```bash
# 1. Clone the repository
git clone https://github.com/Robs87/obclipper-server.git
cd obclipper-server

# 2. Install dependencies
npm install

# 3. Install Playwright browser
npx playwright install chromium

# 4. Configure environment variables
cp .env.example .env
# Edit .env with your settings

# 5. Start the service
# Development mode (auto-restart)
npm run dev

# Production mode
npm start
```

#### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default 3000) |
| `API_KEY` | API authentication key | Yes |
| `R2_ENDPOINT` | R2/S3 endpoint URL | Yes |
| `R2_ACCESS_KEY_ID` | Access key ID | Yes |
| `R2_SECRET_ACCESS_KEY` | Secret access key | Yes |
| `R2_BUCKET` | Bucket name | Yes |
| `R2_PUBLIC_URL` | Public access URL (custom domain) | Yes |
| `IMAGE_FOLDER` | Image storage path prefix | No (default `images`) |
| `ARTICLE_FOLDER` | Article storage path prefix | No (default `articles`) |

## Project Structure

```
obclipper-server/
├── src/
│   ├── index.js            # Express entry point, route definitions
│   ├── scraper.js          # Playwright scraper, content & metadata extraction
│   ├── converter.js        # HTML → Markdown conversion (Turndown + GFM)
│   ├── uploader.js         # Image compression (Sharp) + R2/S3 upload
│   └── middleware/
│       ├── auth.js         # API Key authentication middleware
│       └── errorHandler.js # Global error handling middleware
├── Dockerfile              # Docker image (node:20-slim + Chromium)
├── docker-compose.yml      # Docker Compose orchestration
├── package.json            # Dependencies and scripts
└── .env.example            # Environment variable template
```

## API Documentation

All protected endpoints require an `x-api-key` header.

### Health Check

```
GET /api/health
```

**Response:**
```json
{
  "success": true,
  "service": "obclipper-server",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Clip an Article

```
POST /api/clip
Content-Type: application/json
x-api-key: your-api-key

{
  "url": "https://mp.weixin.qq.com/s/xxxxx",
  "title": "Optional, custom title override",
  "author": "Optional, custom author override"
}
```

**Response:**
```json
{
  "success": true,
  "articleKey": "articles/2024-01-01 - Article Title.md",
  "articleUrl": "https://your-domain.com/articles/2024-01-01 - Article Title.md",
  "title": "Article Title",
  "author": "Author Name",
  "imageCount": 5,
  "uploadedImages": ["..."],
  "elapsed": "3.2s"
}
```

### List Articles

```
GET /api/articles
x-api-key: your-api-key
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "articles": [
    {
      "key": "articles/2024-01-01 - Article Title.md",
      "size": 12345,
      "lastModified": "2024-01-01T00:00:00.000Z",
      "url": "https://..."
    }
  ]
}
```

## Generated Markdown Format

```markdown
---
title: "Article Title"
author: "Author"
source: "WeChat Official Account"
url: "https://mp.weixin.qq.com/s/xxxxx"
date: 2024-01-01
clipped: 2024-01-01T12:00:00.000Z
tags: []
---

Article body, converted to Markdown...
```

## Supported Sites

- WeChat Official Account articles (mp.weixin.qq.com)
- Zhihu Columns
- Jianshu
- General blogs and news sites
- Any page with an `<article>` tag or common article container

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) for details on submitting bug reports, feature requests, and pull requests.

Found a security vulnerability? Please refer to our [Security Policy](SECURITY.md).

## License

[MIT](LICENSE) © 2024-2026 Robs87
