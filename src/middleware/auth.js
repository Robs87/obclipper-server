/**
 * API 认证中间件
 * 通过 x-api-key 请求头或 query 参数验证 API 密钥
 */
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKey = process.env.API_KEY;

  // 如果未配置 API_KEY，则跳过验证（开发模式）
  if (!validKey) {
    console.warn('[警告] 未配置 API_KEY 环境变量，跳过认证检查');
    return next();
  }

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({
      success: false,
      error: '未授权：无效或缺失的 API Key',
    });
  }

  next();
}

module.exports = authMiddleware;
