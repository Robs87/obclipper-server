/**
 * API 认证中间件
 * 通过 x-api-key 请求头或 query 参数验证 API 密钥
 */
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKey = process.env.API_KEY;

  // 如果未配置 API_KEY，生产环境应拒绝所有请求（fail-closed）
  if (!validKey) {
    console.error('[安全] 未配置 API_KEY 环境变量，拒绝所有认证请求');
    return res.status(500).json({
      success: false,
      error: '服务端配置错误：未设置 API_KEY，请联系管理员',
    });
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
