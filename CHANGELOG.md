# Changelog

本项目的所有重要变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2024-01-01

### 新增

- 文章剪藏后端服务初始版本 (`feat: obclipper-server`)
- 网页文章抓取（Playwright + Chromium）
- HTML → Markdown 转换（Turndown，支持 GFM）
- 图片自动下载、压缩并上传至 Cloudflare R2
- API Key 认证保护
- 自动生成 YAML frontmatter
- Docker 部署支持
- 文章列表查询接口

### 修复

- Docker 改用 `node:20-slim` 修复 Chromium 崩溃 (`fix: Docker 改用 node:20-slim`)
- 环境变量读取添加 `trim()` 防止路径空格导致 R2 key 错误 (`fix: 环境变量读取添加 trim()`)
- 添加 `.dockerignore` 防止本地 `node_modules` 覆盖容器依赖 (`fix: 添加 .dockerignore`)
