/**
 * 全局错误处理中间件
 * 捕获所有未处理的错误并返回统一格式的 JSON 响应
 */
function errorHandler(err, req, res, _next) {
  const timestamp = new Date().toISOString();
  const statusCode = err.statusCode || 500;

  // 打印错误日志（含时间戳）
  console.error(`[${timestamp}] 错误:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    error: statusCode === 500 ? '服务器内部错误' : err.message,
    timestamp,
  });
}

module.exports = errorHandler;
