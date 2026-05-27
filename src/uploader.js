/**
 * S3/R2 上传模块
 * 负责下载图片、压缩、上传到 R2，以及上传 Markdown 文件
 */
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');

// 初始化 S3 客户端（兼容 Cloudflare R2）
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET?.trim();
const PUBLIC_URL = process.env.R2_PUBLIC_URL?.trim();
const IMAGE_FOLDER = (process.env.IMAGE_FOLDER || 'images').trim();
const ARTICLE_FOLDER = (process.env.ARTICLE_FOLDER || 'articles').trim();

/**
 * 将 Markdown 和图片上传到 R2
 * @param {string} markdown - Markdown 内容（已含 frontmatter）
 * @param {string[]} images - 图片 URL 列表
 * @param {object} metadata - 文章元数据
 * @returns {Promise<{articleKey: string, articleUrl: string, uploadedImages: object[]}>}
 */
async function uploadToR2(markdown, images, metadata) {
  const uploadedImages = [];
  let updatedMarkdown = markdown;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // === 1. 下载、压缩并上传图片 ===
  for (const imageUrl of images) {
    try {
      // 下载图片
      const imageBuffer = await downloadImage(imageUrl);

      // 使用 sharp 压缩图片：最大宽度 1200px，质量 85%
      let processedBuffer;
      let ext = 'jpg';
      try {
        const sharpInstance = sharp(imageBuffer);
        const metadata_info = await sharpInstance.metadata();
        ext = metadata_info.format === 'png' ? 'png' : 'jpg';

        processedBuffer = await sharpInstance
          .resize(1200, null, {
            fit: 'inside',        // 保持比例，不超过 1200 宽
            withoutEnlargement: true, // 不放大小图
          })
          .jpeg({ quality: 85 })
          .png({ compressionLevel: 8 })
          .toBuffer();
      } catch (sharpErr) {
        // sharp 处理失败时使用原始图片
        console.warn(`[警告] 图片压缩失败，使用原始图片: ${sharpErr.message}`);
        processedBuffer = imageBuffer;
      }

      // 生成存储 key: images/YYYY-MM-DD/uuid.ext
      const imageKey = `${IMAGE_FOLDER}/${today}/${uuidv4()}.${ext}`;

      // 上传到 R2
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: imageKey,
          Body: processedBuffer,
          ContentType: ext === 'png' ? 'image/png' : 'image/jpeg',
          CacheControl: 'public, max-age=31536000', // 缓存 1 年
        })
      );

      // 构建公开访问 URL
      const publicImageUrl = `${PUBLIC_URL}/${imageKey}`;

      // 替换 Markdown 中的图片 URL
      updatedMarkdown = updatedMarkdown.replace(
        new RegExp(escapeRegex(imageUrl), 'g'),
        publicImageUrl
      );

      uploadedImages.push({ original: imageUrl, key: imageKey, url: publicImageUrl });
      console.log(`[上传] 图片已上传: ${imageKey}`);
    } catch (err) {
      console.error(`[错误] 图片处理失败 (${imageUrl}):`, err.message);
      // 图片失败不中断整体流程
    }
  }

  // === 2. 上传 Markdown 文件 ===
  // 生成文件名：YYYY-MM-DD - 标题.md
  const safeTitle = (metadata.title || '未命名').replace(/[<>:"/\\|?*\n\r]/g, '_').substring(0, 80);
  const filename = `${today} - ${safeTitle}.md`;
  const articleKey = `${ARTICLE_FOLDER}/${filename}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: articleKey,
      Body: Buffer.from(updatedMarkdown, 'utf-8'),
      ContentType: 'text/markdown; charset=utf-8',
      CacheControl: 'no-cache',
    })
  );

  const articleUrl = `${PUBLIC_URL}/${articleKey}`;
  console.log(`[上传] 文章已保存: ${articleKey}`);

  return { articleKey, articleUrl, uploadedImages };
}

/**
 * 列出 R2 中的文章
 * @returns {Promise<object[]>}
 */
async function listArticles() {
  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `${ARTICLE_FOLDER}/`,
    })
  );

  return (response.Contents || []).map((item) => ({
    key: item.Key,
    size: item.Size,
    lastModified: item.LastModified,
    url: `${PUBLIC_URL}/${item.Key}`,
  }));
}

/**
 * 下载远程图片
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ObClipper/1.0)',
          Referer: new URL(url).origin,
        },
        timeout: 15000,
      },
      (res) => {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadImage(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`图片下载失败，状态码: ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('图片下载超时'));
    });
  });
}

/**
 * 转义正则特殊字符
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { uploadToR2, listArticles };
