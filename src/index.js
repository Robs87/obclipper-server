/**
 * ObClipper 后端服务入口
 * 提供文章剪藏 API：抓取网页 → 转换 Markdown → 上传至 R2
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { scrapeArticle } = require('./scraper');
const { convertToMarkdown } = require('./converter');
const { uploadToR2, listArticles } = require('./uploader');

const app = express();
const PORT = process.env.PORT || 3000;

// === 全局中间件 ===
app.use(helmet());                        // 安全头
app.use(cors());                          // 跨域支持
app.use(express.json({ limit: '1mb' }));  // JSON 请求体解析

// === 公开路由（无需认证） ===

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'obclipper-server',
    timestamp: new Date().toISOString(),
  });
});

// === 受保护路由（需要 API Key） ===
app.use('/api', authMiddleware);

/**
 * POST /api/clip - 剪藏文章
 * 请求体: { url: string, title?: string, author?: string }
 * 返回: { success, articleKey, articleUrl, title, uploadedImages }
 */
app.post('/api/clip', async (req, res, next) => {
  const startTime = Date.now();
  try {
    const { url, title: customTitle, author: customAuthor } = req.body;

    // 参数校验
    if (!url) {
      return res.status(400).json({ success: false, error: '缺少必填参数: url' });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ success: false, error: '无效的 URL 格式' });
    }

    console.log(`[剪藏] 开始处理: ${url}`);

    // 步骤 1: 抓取文章
    console.log('[剪藏] 步骤 1/3 - 抓取文章内容...');
    const article = await scrapeArticle(url);

    // 允许客户端覆盖标题和作者
    if (customTitle) article.title = customTitle;
    if (customAuthor) article.author = customAuthor;

    // 步骤 2: 转换为 Markdown
    console.log('[剪藏] 步骤 2/3 - 转换为 Markdown...');
    const { markdown, images } = await convertToMarkdown(article.content, {
      title: article.title,
      author: article.author,
      publishDate: article.publishDate,
      url,
      siteName: article.siteName,
    });

    console.log(`[剪藏] 发现 ${images.length} 张图片`);

    // 步骤 3: 上传到 R2
    console.log('[剪藏] 步骤 3/3 - 上传到 R2...');
    const { articleKey, articleUrl, uploadedImages } = await uploadToR2(markdown, images, {
      title: article.title,
      author: article.author,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[剪藏] 完成！耗时 ${elapsed}s`);

    res.json({
      success: true,
      articleKey,
      articleUrl,
      title: article.title,
      author: article.author,
      imageCount: uploadedImages.length,
      uploadedImages,
      elapsed: `${elapsed}s`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/articles - 列出已保存的文章
 */
app.get('/api/articles', async (req, res, next) => {
  try {
    const articles = await listArticles();
    res.json({ success: true, count: articles.length, articles });
  } catch (error) {
    next(error);
  }
});

// === 错误处理 ===
app.use(errorHandler);

// === 启动服务 ===
app.listen(PORT, () => {
  console.log(`\n🚀 ObClipper 服务已启动: http://localhost:${PORT}`);
  console.log(`   健康检查: GET /api/health`);
  console.log(`   剪藏文章: POST /api/clip`);
  console.log(`   文章列表: GET /api/articles\n`);
});

module.exports = app;
