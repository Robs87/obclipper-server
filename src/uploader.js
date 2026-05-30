/**
 * S3 兼容存储上传模块（多用户版）
 * 每次请求从客户端传入的 storage 配置临时创建 S3Client
 * 支持：Cloudflare R2、AWS S3、MinIO、阿里云 OSS、腾讯云 COS
 */
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');
const { isBlockedUrl } = require('./utils/url-guard');

/**
 * 根据 storage 配置创建 S3 客户端
 * @param {object} storageConfig - 存储配置
 * @returns {S3Client}
 */
function createS3Client(storageConfig) {
  const { endpoint, accessKeyId, secretAccessKey, region } = storageConfig;

  // 判断是否需要 path-style（R2、MinIO、阿里云、腾讯云都需要）
  const isR2 = endpoint.includes('r2.cloudflarestorage.com');
  const isMinIO = endpoint.includes('minio') || endpoint.includes(':9000');
  const isAliyun = endpoint.includes('aliyuncs.com');
  const isTencent = endpoint.includes('myqcloud.com');
  const forcePathStyle = isR2 || isMinIO || isAliyun || isTencent;

  return new S3Client({
    region: region || 'auto',
    endpoint: endpoint || undefined,
    forcePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * 验证 storage 配置完整性
 * @param {object} storageConfig
 * @returns {{ valid: boolean, error?: string }}
 */
function validateStorageConfig(storageConfig) {
  if (!storageConfig) return { valid: false, error: '缺少 storage 配置' };
  const required = ['endpoint', 'accessKeyId', 'secretAccessKey', 'bucket'];
  for (const field of required) {
    if (!storageConfig[field]) {
      return { valid: false, error: `storage.${field} 不能为空` };
    }
  }
  return { valid: true };
}

/**
 * 测试存储连接
 * @param {object} storageConfig - 存储配置
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function testStorageConnection(storageConfig) {
  const validation = validateStorageConfig(storageConfig);
  if (!validation.valid) {
    return { success: false, message: validation.error };
  }

  try {
    const client = createS3Client(storageConfig);
    await client.send(new ListObjectsV2Command({
      Bucket: storageConfig.bucket,
      MaxKeys: 1,
    }));
    return { success: true, message: '连接成功' };
  } catch (err) {
    const msg = getStorageErrorMessage(err);
    return { success: false, message: msg };
  }
}

/**
 * 将 Markdown 和图片上传到用户的存储
 * @param {string} markdown - Markdown 内容（已含 frontmatter）
 * @param {string[]} images - 图片 URL 列表
 * @param {object} metadata - 文章元数据
 * @param {object} storageConfig - 用户的存储配置
 * @returns {Promise<{articleKey: string, articleUrl: string, uploadedImages: object[]}>}
 */
async function uploadToStorage(markdown, images, metadata, storageConfig) {
  const validation = validateStorageConfig(storageConfig);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const s3Client = createS3Client(storageConfig);
  const bucket = storageConfig.bucket;
  const publicUrl = (storageConfig.publicUrl || '').replace(/\/+$/, '');
  const imageFolder = (storageConfig.imageFolder || 'obclipper/images').replace(/^\/+|\/+$/g, '');
  const articleFolder = (storageConfig.articleFolder || 'obclipper/articles').replace(/^\/+|\/+$/g, '');

  const uploadedImages = [];
  let updatedMarkdown = markdown;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // === 1. 下载、压缩并上传图片 ===
  for (const imageUrl of images) {
    try {
      const imageBuffer = await downloadImage(imageUrl);

      let processedBuffer;
      let ext = 'jpg';
      try {
        const sharpInstance = sharp(imageBuffer);
        const metadata_info = await sharpInstance.metadata();
        ext = metadata_info.format === 'png' ? 'png' : 'jpg';

        const resized = sharpInstance.resize(1200, null, {
          fit: 'inside',
          withoutEnlargement: true,
        });

        // 根据原始格式分别处理，避免 PNG 被强制转 JPEG
        processedBuffer = ext === 'png'
          ? await resized.png({ compressionLevel: 8 }).toBuffer()
          : await resized.jpeg({ quality: 85 }).toBuffer();
      } catch (sharpErr) {
        console.warn(`[警告] 图片压缩失败，使用原始图片: ${sharpErr.message}`);
        processedBuffer = imageBuffer;
      }

      const imageKey = `${imageFolder}/${today}/${uuidv4()}.${ext}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: imageKey,
          Body: processedBuffer,
          ContentType: ext === 'png' ? 'image/png' : 'image/jpeg',
          CacheControl: 'public, max-age=31536000',
        })
      );

      const publicImageUrl = publicUrl ? `${publicUrl}/${imageKey}` : imageKey;

      updatedMarkdown = updatedMarkdown.replace(
        new RegExp(escapeRegex(imageUrl), 'g'),
        publicImageUrl
      );

      uploadedImages.push({ original: imageUrl, key: imageKey, url: publicImageUrl });
      console.log(`[上传] 图片已上传: ${imageKey}`);
    } catch (err) {
      console.error(`[错误] 图片处理失败 (${imageUrl}):`, err.message);
    }
  }

  // === 2. 上传 Markdown 文件 ===
  const safeTitle = (metadata.title || '未命名').replace(/[<>:"/\\|?*\n\r]/g, '_').substring(0, 80);
  const filename = `${today} - ${safeTitle}.md`;
  const articleKey = `${articleFolder}/${filename}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: articleKey,
      Body: Buffer.from(updatedMarkdown, 'utf-8'),
      ContentType: 'text/markdown; charset=utf-8',
      CacheControl: 'no-cache',
    })
  );

  const articleUrl = publicUrl ? `${publicUrl}/${articleKey}` : articleKey;
  console.log(`[上传] 文章已保存: ${articleKey}`);

  return { articleKey, articleUrl, uploadedImages };
}

/**
 * 下载远程图片（带 SSRF 防护、重定向限制、响应体大小限制）
 */
function downloadImage(url, _redirectCount = 0) {
  const MAX_REDIRECTS = 5;
  const MAX_BODY_SIZE = 20 * 1024 * 1024; // 20MB

  // SSRF 防护：校验 URL
  const blockReason = isBlockedUrl(url);
  if (blockReason) {
    return Promise.reject(new Error(`图片 URL 不安全，已拒绝: ${blockReason}`));
  }

  if (_redirectCount > MAX_REDIRECTS) {
    return Promise.reject(new Error(`图片下载重定向次数超限（${MAX_REDIRECTS} 次）`));
  }

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
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // 重定向：跟随但计数，并校验目标 URL
          const redirectUrl = new URL(res.headers.location, url).href;
          return downloadImage(redirectUrl, _redirectCount + 1).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`图片下载失败，状态码: ${res.statusCode}`));
        }

        // 检查 Content-Length
        const contentLength = parseInt(res.headers['content-length'], 10);
        if (contentLength && contentLength > MAX_BODY_SIZE) {
          res.destroy();
          return reject(new Error(`图片过大 (${(contentLength / 1024 / 1024).toFixed(1)}MB)，超过 20MB 限制`));
        }

        const chunks = [];
        let totalSize = 0;
        res.on('data', (chunk) => {
          totalSize += chunk.length;
          if (totalSize > MAX_BODY_SIZE) {
            res.destroy();
            return reject(new Error('图片下载超过 20MB 大小限制'));
          }
          chunks.push(chunk);
        });
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
 * 获取存储错误的中文提示
 */
function getStorageErrorMessage(err) {
  if (err.name === 'NoSuchBucket') return '存储桶不存在';
  if (err.name === 'AccessDenied') return '访问被拒绝，请检查权限';
  if (err.name === 'InvalidAccessKeyId') return 'Access Key ID 无效';
  if (err.name === 'SignatureDoesNotMatch') return 'Access Key Secret 错误';
  if (err.message?.includes('NetworkError') || err.message?.includes('fetch')) return '网络错误，请检查 Endpoint 地址';
  if (err.message?.includes('CORS')) return 'CORS 错误，请在存储服务中配置跨域策略';
  return err.message || '未知错误';
}

/**
 * 转义正则特殊字符
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { uploadToStorage, testStorageConnection, validateStorageConfig };
