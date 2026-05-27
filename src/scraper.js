/**
 * 文章抓取模块
 * 使用 Playwright 启动无头 Chromium 抓取网页内容，
 * 支持微信公众号、知乎、简书等中文站点的特殊处理
 */
const { chromium } = require('playwright');

/**
 * 抓取文章内容
 * @param {string} url - 文章 URL
 * @returns {Promise<{title: string, author: string, publishDate: string, content: string, coverImage: string, siteName: string}>}
 */
async function scrapeArticle(url) {
  let browser;
  try {
    // 启动无头浏览器
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
      ],
      // Docker 环境使用系统 Chromium（通过环境变量指定路径）
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      }),
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    // 设置较长超时（某些中文站点加载较慢）
    page.setDefaultTimeout(30000);

    // 导航到目标页面，等待网络空闲
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

    // 判断是否为微信公众号文章
    const isWeChat = url.includes('mp.weixin.qq.com');
    if (isWeChat) {
      // 微信文章需要等待内容渲染完成
      await page.waitForSelector('#js_content', { timeout: 15000 }).catch(() => {});
    }

    // 提取页面元数据和内容
    const result = await page.evaluate((isWeChatPage) => {
      // === 辅助函数 ===
      const getMetaContent = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.getAttribute('content')?.trim() : '';
      };

      const getJSONLD = () => {
        try {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of scripts) {
            const data = JSON.parse(script.textContent);
            // 可能是对象或数组
            const item = Array.isArray(data) ? data[0] : data;
            if (item['@type'] === 'Article' || item['@type'] === 'NewsArticle' || item['@type'] === 'BlogPosting') {
              return item;
            }
          }
        } catch (e) { /* 忽略 JSON 解析错误 */ }
        return null;
      };

      // === 1. 提取标题 ===
      let title =
        getMetaContent('meta[property="og:title"]') ||
        document.querySelector('.rich_media_title')?.textContent?.trim() || // 微信
        document.querySelector('h1')?.textContent?.trim() ||
        document.title;

      // === 2. 提取作者 ===
      let author =
        getMetaContent('meta[name="author"]') ||
        getMetaContent('meta[property="og:author"]') ||
        document.querySelector('.rich_media_meta_text')?.textContent?.trim() || // 微信
        document.querySelector('[rel="author"]')?.textContent?.trim() ||
        '';

      // === 3. 提取发布日期 ===
      let publishDate =
        getMetaContent('meta[property="article:published_time"]') ||
        getMetaContent('meta[name="publish_date"]') ||
        '';

      // === 4. 提取封面图 ===
      let coverImage =
        getMetaContent('meta[property="og:image"]') ||
        '';

      // === 5. 提取站点名称 ===
      let siteName =
        getMetaContent('meta[property="og:site_name"]') ||
        document.querySelector('.profile_nickname')?.textContent?.trim() || // 微信公众号名
        new URL(document.location.href).hostname;

      // === 6. 从 JSON-LD 补充信息 ===
      const jsonLD = getJSONLD();
      if (jsonLD) {
        if (!author && jsonLD.author) {
          author = typeof jsonLD.author === 'string' ? jsonLD.author : jsonLD.author.name || '';
        }
        if (!publishDate && jsonLD.datePublished) {
          publishDate = jsonLD.datePublished;
        }
        if (!coverImage && jsonLD.image) {
          coverImage = typeof jsonLD.image === 'string' ? jsonLD.image : jsonLD.image.url || '';
        }
      }

      // === 7. 提取正文 HTML ===
      let contentEl = null;

      // 按优先级尝试不同选择器
      const selectors = isWeChatPage
        ? ['#js_content', '.rich_media_content']
        : [
            'article',
            '[class*="article-content"]',
            '[class*="post-content"]',
            '[class*="entry-content"]',
            '[class*="content-inner"]',
            '.article',        // 知乎
            '.Post-RichText',  // 知乎
            '.article-detail', // 简书
            '.post-body',      // 通用博客
            'main',
          ];

      for (const sel of selectors) {
        contentEl = document.querySelector(sel);
        if (contentEl && contentEl.innerHTML.trim().length > 100) break;
      }

      // 最终回退到 body
      if (!contentEl || contentEl.innerHTML.trim().length < 100) {
        contentEl = document.body;
      }

      // 清理不需要的元素
      const clone = contentEl.cloneNode(true);
      clone
        .querySelectorAll('script, style, nav, footer, header, aside, .ad, .advertisement, .comment, .sidebar, [role="navigation"]')
        .forEach((el) => el.remove());

      let content = clone.innerHTML;

      // 微信文章特殊处理：恢复图片 data-src
      if (isWeChatPage) {
        content = content.replace(/data-src=/g, 'src=');
      }

      return { title, author, publishDate, content, coverImage, siteName };
    }, isWeChat);

    await browser.close();

    return {
      title: result.title || '未命名文章',
      author: result.author || '',
      publishDate: result.publishDate || new Date().toISOString(),
      content: result.content || '',
      coverImage: result.coverImage || '',
      siteName: result.siteName || '',
    };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    throw new Error(`文章抓取失败: ${error.message}`);
  }
}

module.exports = { scrapeArticle };
