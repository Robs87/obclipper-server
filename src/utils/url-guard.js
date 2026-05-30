/**
 * URL 安全校验工具
 * 防止 SSRF（服务端请求伪造）攻击
 */
const { URL } = require('url');
const net = require('net');

/** 允许的协议 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * 判断 IP 是否为内网地址
 * @param {string} hostname
 * @returns {boolean}
 */
function isPrivateIP(hostname) {
  // 去掉 IPv6 方括号
  const host = hostname.replace(/^\[|\]$/g, '');

  // IPv4 内网地址
  if (net.isIPv4(host)) {
    const parts = host.split('.').map(Number);
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0) return true;
    return false;
  }

  // IPv6 内网地址
  if (net.isIPv6(host)) {
    if (host === '::1') return true;           // loopback
    if (host.startsWith('fe80:')) return true;  // link-local
    if (host.startsWith('fc00:') || host.startsWith('fd00:')) return true; // ULA
    if (host === '::') return true;
    return false;
  }

  // 主机名检查
  const lower = host.toLowerCase();
  if (lower === 'localhost') return true;
  if (lower.endsWith('.local') || lower.endsWith('.internal')) return true;
  if (lower.endsWith('.localhost')) return true;

  return false;
}

/**
 * 检查 URL 是否应被阻止
 * @param {string} urlStr
 * @returns {string|null} 阻止原因，null 表示允许
 */
function isBlockedUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return '无效的 URL 格式';
  }

  // 协议检查
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return `不支持的协议: ${parsed.protocol}（仅允许 http/https）`;
  }

  // 内网 IP 检查
  const hostname = parsed.hostname;
  if (!hostname) return 'URL 缺少主机名';

  if (isPrivateIP(hostname)) {
    return `拒绝访问内网地址: ${hostname}`;
  }

  return null; // 允许
}

module.exports = { isBlockedUrl, isPrivateIP };
