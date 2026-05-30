/**
 * HTML 转 Markdown 转换模块
 * 使用 Turndown 配合 GFM 插件，将 HTML 转为干净的 Markdown
 */
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

/**
 * 将 HTML 转换为 Markdown
 * @param {string} html - 原始 HTML 内容
 * @param {object} metadata - 文章元数据 { title, author, publishDate, url, siteName }
 * @returns {Promise<{markdown: string, images: string[]>}}
 */
async function convertToMarkdown(html, metadata) {
  // 初始化 Turndown 并配置 GFM 支持（表格、删除线、任务列表）
  const turndown = new TurndownService({
    headingStyle: 'atx',        // 使用 # 风格标题
    codeBlockStyle: 'fenced',   // 使用 ``` 围栏代码块
    bulletListMarker: '-',      // 无序列表使用 -
    emDelimiter: '*',           // 斜体使用 *
    strongDelimiter: '**',      // 粗体使用 **
  });

  turndown.use(gfm);

  // 移除不需要的元素
  turndown.remove(['script', 'style', 'noscript', 'iframe']);

  // 自定义图片规则：保留 alt 文本
  turndown.addRule('images', {
    filter: 'img',
    replacement: (content, node) => {
      const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
      const alt = node.getAttribute('alt') || '图片';
      if (!src || src.startsWith('data:')) return ''; // 跳过 base64 图片
      return `![${alt}](${src})`;
    },
  });

  // 执行转换
  let markdown = turndown.turndown(html);

  // 清理多余空行（超过 2 个连续空行合并为 2 个）
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  // 去除首尾空白
  markdown = markdown.trim();

  // 提取所有图片 URL
  const imageRegex = /!\[.*?\]\((.*?)\)/g;
  const images = [];
  let match;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const imgUrl = match[1];
    // 过滤掉 base64 和无效 URL
    if (imgUrl && !imgUrl.startsWith('data:') && imgUrl.startsWith('http')) {
      images.push(imgUrl);
    }
  }

  // 生成 YAML frontmatter
  const frontmatter = generateFrontmatter(metadata);

  // 拼接最终 Markdown
  const fullMarkdown = `${frontmatter}\n\n${markdown}`;

  return { markdown: fullMarkdown, images };
}

/**
 * 生成 YAML frontmatter
 */
function generateFrontmatter({ title, author, publishDate, url, siteName }) {
  const date = publishDate ? new Date(publishDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  const lines = [
    '---',
    `title: "${escapeYaml(title)}"`,
    `author: "${escapeYaml(author || '未知')}"`,
    `source: "${escapeYaml(siteName || '')}"`,
    `url: "${escapeYaml(url || '')}"`,
    `date: ${date}`,
    `clipped: ${new Date().toISOString()}`,
    `tags: []`,
    '---',
  ];

  return lines.join('\n');
}

/**
 * 转义 YAML 字符串中的特殊字符
 * 防止通过标题/作者等字段注入额外 YAML 字段
 */
function escapeYaml(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')    // 反斜杠
    .replace(/"/g, '\\"')      // 双引号
    .replace(/\n/g, ' ')       // 换行
    .replace(/\r/g, '')        // 回车
    .replace(/:/g, '\\:')      // 冒号（防止被解析为 key: value）
    .replace(/\{/g, '\\{')     // 花括号（YAML 流映射）
    .replace(/\}/g, '\\}')
    .replace(/\[/g, '\\[')     // 方括号（YAML 流序列）
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')      // 百分号（YAML 指令）
    .replace(/@/g, '\\@')      // @ 符号（YAML 保留）
    .replace(/`/g, '\\`');      // 反引号
}

module.exports = { convertToMarkdown };
