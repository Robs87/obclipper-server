/**
 * ObClipper 后端服务入口（多用户版）
 * 提供文章剪藏 API：抓取网页 → 转换 Markdown → 上传至用户指定的 S3 存储
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { scrapeArticle } = require('./scraper');
const { convertToMarkdown } = require('./converter');
const { uploadToStorage, testStorageConnection, validateStorageConfig } = require('./uploader');

const app = express();
const PORT = process.env.PORT || 3000;

// === 全局中间件 ===
app.use(helmet());

// CORS 限制：仅允许配置的来源（逗号分隔的域名列表）
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:3000']; // 默认仅允许本地
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
}));

app.use(express.json({ limit: '2mb' })); // 加大到 2MB（含 storage 配置）

// === 速率限制 ===
// 剪藏接口：每 IP 每分钟最多 10 次（Playwright 抓取是重操作）
const clipLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '请求过于频繁，请稍后再试' },
  // 始终按 IP 限流，防止通过伪造不同 x-api-key 绕过
  keyGenerator: (req) => req.ip,
});

// 测试连接接口：每 IP 每分钟最多 20 次
const testLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '请求过于频繁，请稍后再试' },
});

// 通用 API：每 IP 每分钟最多 60 次
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '请求过于频繁，请稍后再试' },
});

// === 公开路由（无需认证） ===

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'obclipper-server',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// === 受保护路由（需要 API Key） ===
app.use('/api', authMiddleware);

/**
 * POST /api/test-storage - 测试存储连接
 * 请求体: { storage: StorageConfig }
 * 返回: { success, message }
 */
app.post('/api/test-storage', testLimiter, async (req, res, next) => {
  try {
    const { storage } = req.body;

    const validation = validateStorageConfig(storage);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const result = await testStorageConnection(storage);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clip - 剪藏文章
 * 请求体: { url, title?, author?, storage: StorageConfig }
 * 返回: { success, articleKey, articleUrl, title, uploadedImages }
 */
app.post('/api/clip', clipLimiter, async (req, res, next) => {
  const startTime = Date.now();
  try {
    const { url, title: customTitle, author: customAuthor, storage } = req.body;

    // 参数校验
    if (!url) {
      return res.status(400).json({ success: false, error: '缺少必填参数: url' });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ success: false, error: '无效的 URL 格式' });
    }

    // 校验 storage 配置
    const storageValidation = validateStorageConfig(storage);
    if (!storageValidation.valid) {
      return res.status(400).json({ success: false, error: storageValidation.error });
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

    // 步骤 3: 上传到用户的存储
    console.log('[剪藏] 步骤 3/3 - 上传到存储...');
    const { articleKey, articleUrl, uploadedImages } = await uploadToStorage(
      markdown,
      images,
      { title: article.title, author: article.author },
      storage
    );

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

// === 错误处理 ===
app.use(errorHandler);

// === 启动服务 ===
app.listen(PORT, () => {
  console.log(`\n🚀 ObClipper 服务已启动: http://localhost:${PORT}`);
  console.log(`   版本: 2.0.0 (多用户版)`);
  console.log(`   健康检查: GET /api/health`);
  console.log(`   测试存储: POST /api/test-storage`);
  console.log(`   剪藏文章: POST /api/clip`);
  console.log(`   速率限制: 剪藏 10次/分, 测试 20次/分, 通用 60次/分\n`);
});

module.exports = app;
