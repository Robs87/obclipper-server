#!/bin/bash
# ObClipper Server — Unraid 一键部署脚本
# 用法: bash deploy-unraid.sh <API_KEY>
#
# 该脚本会：
# 1. 停止并删除旧容器（如存在）
# 2. 拉取最新镜像
# 3. 安装 Unraid 模板
# 4. 创建并启动容器
# 5. 运行健康检查和剪藏测试

set -euo pipefail

# ===== 配置 =====
CONTAINER_NAME="obclipper-server"
IMAGE="ghcr.io/robs87/obclipper-server:latest"
HOST_PORT="3090"
CONTAINER_PORT="3000"
CORS_ORIGINS="https://mp.weixin.qq.com"
TEMPLATE_DIR="/boot/config/plugins/dockerMan/templates-user"

if [ $# -lt 1 ]; then
    echo "❌ 用法: $0 <API_KEY>"
    echo "   例如: $0 'your-secret-api-key'"
    exit 1
fi

API_KEY="$1"

echo "=========================================="
echo "  ObClipper Server — Unraid 部署"
echo "=========================================="

# 1. 停止并删除旧容器
echo ""
echo "📦 [1/5] 清理旧容器..."
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
    echo "   ✅ 旧容器已删除"
else
    echo "   ℹ️  无旧容器"
fi

# 2. 拉取最新镜像
echo ""
echo "📥 [2/5] 拉取最新镜像..."
docker pull "$IMAGE"
echo "   ✅ 镜像就绪"

# 3. 安装 Unraid 模板
echo ""
echo "📋 [3/5] 安装 Unraid 模板..."
mkdir -p "$TEMPLATE_DIR"

cat > "${TEMPLATE_DIR}/obclipper-server.xml" << 'XMLEOF'
<?xml version="1.0"?>
<Container version="2">
  <Name>obclipper-server</Name>
  <Repository>ghcr.io/robs87/obclipper-server:latest</Repository>
  <Registry>https://ghcr.io/v2/robs87/obclipper-server</Registry>
  <Network>bridge</Network>
  <MyIP></MyIP>
  <Shell>bash</Shell>
  <Privileged>false</Privileged>
  <Support></Support>
  <Project></Project>
  <Overview>ObClipper 网页剪藏服务端 - 抓取网页、转换 Markdown、上传到 S3/R2 存储</Overview>
  <Category>Tools:</Category>
  <WebUI>https://obclipper.332626.xyz:9090/api/health</WebUI>
  <TemplateURL></TemplateURL>
  <Icon>/usr/local/emhttp/plugins/dynamix.docker.manager/images/question.png</Icon>
  <ExtraParams>--restart unless-stopped</ExtraParams>
  <PostArgs></PostArgs>
  <CPUset></CPUset>
  <DateInstalled></DateInstalled>
  <DonateText></DonateText>
  <DonateLink></DonateLink>
  <Requires></Requires>
  <Config Name="API Key" Target="API_KEY" Default="" Mode="env" Description="API 认证密钥（必填）" Type="Variable" Display="always" Required="true" Mask="true">YOUR_API_KEY_HERE</Config>
  <Config Name="WebUI Port" Target="3000" Default="3000" Mode="tcp" Description="容器内部端口" Type="Port" Display="always" Required="true" Mask="false">3090</Config>
  <Config Name="CORS Origins" Target="CORS_ORIGINS" Default="https://mp.weixin.qq.com" Mode="env" Description="允许的 CORS 来源（逗号分隔）" Type="Variable" Display="always" Required="false" Mask="false">https://mp.weixin.qq.com</Config>
</Container>
XMLEOF

echo "   ✅ 模板已写入 ${TEMPLATE_DIR}/obclipper-server.xml"

# 4. 创建并启动容器
echo ""
echo "🚀 [4/5] 启动容器..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    -e "API_KEY=${API_KEY}" \
    -e "PORT=${CONTAINER_PORT}" \
    -e "CORS_ORIGINS=${CORS_ORIGINS}" \
    "$IMAGE"

echo "   ✅ 容器已启动"

# 等待服务就绪
echo ""
echo "⏳ 等待服务启动..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${HOST_PORT}/api/health" > /dev/null 2>&1; then
        echo "   ✅ 服务就绪（${i}秒）"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "   ❌ 服务启动超时"
        echo ""
        echo "=== 容器日志 ==="
        docker logs --tail 50 "$CONTAINER_NAME"
        exit 1
    fi
    sleep 1
done

# 5. 测试
echo ""
echo "🧪 [5/5] 运行测试..."

# 5a. 健康检查
echo ""
echo "--- 健康检查 ---"
HEALTH=$(curl -sf "http://localhost:${HOST_PORT}/api/health")
echo "$HEALTH"
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "✅ 健康检查通过"
else
    echo "❌ 健康检查失败"
    exit 1
fi

# 5b. 认证测试（无 key 应返回 401）
echo ""
echo "--- 认证测试（无 key → 应 401）---"
AUTH_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:${HOST_PORT}/api/clip" -X POST -H "Content-Type: application/json" -d '{"url":"https://example.com"}')
if [ "$AUTH_STATUS" = "401" ]; then
    echo "✅ 认证拦截正常 (401)"
else
    echo "⚠️  认证测试异常: HTTP $AUTH_STATUS（期望 401）"
fi

# 5c. 剪藏测试
echo ""
echo "--- 剪藏测试（example.com）---"
CLIP_RESULT=$(curl -sf "http://localhost:${HOST_PORT}/api/clip" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${API_KEY}" \
    -d '{
        "url": "https://example.com",
        "storage": {
            "endpoint": "https://b0dae9e582947acf335ed8902f9b04ed.r2.cloudflarestorage.com",
            "accessKeyId": "test",
            "secretAccessKey": "test",
            "bucket": "test",
            "publicUrl": "https://test.r2.dev"
        }
    }' 2>&1) || true

# 解析结果
if echo "$CLIP_RESULT" | grep -q '"title"'; then
    echo "✅ 剪藏成功！"
    echo "$CLIP_RESULT" | head -c 500
elif echo "$CLIP_RESULT" | grep -q '"error"'; then
    ERROR_MSG=$(echo "$CLIP_RESULT" | grep -o '"error":"[^"]*"' | head -1)
    if echo "$ERROR_MSG" | grep -qi "storage\|bucket\|credential\|access\|signature"; then
        echo "✅ 剪藏流程正常（存储连接预期失败，因为用了测试凭据）"
        echo "   错误: $ERROR_MSG"
    else
        echo "⚠️  剪藏异常: $ERROR_MSG"
    fi
else
    echo "⚠️  剪藏返回:"
    echo "$CLIP_RESULT" | head -c 500
fi

# 5d. Chromium 检查
echo ""
echo "--- Chromium 检查 ---"
CHROMIUM_CHECK=$(docker exec "$CONTAINER_NAME" bash -c "which chromium && chromium --version" 2>&1) || true
echo "$CHROMIUM_CHECK"
if echo "$CHROMIUM_CHECK" | grep -qi "chromium"; then
    echo "✅ Chromium 可用"
else
    echo "⚠️  Chromium 可能不可用"
fi

echo ""
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
echo ""
echo "  容器: $CONTAINER_NAME"
echo "  镜像: $IMAGE"
echo "  端口: ${HOST_PORT} → ${CONTAINER_PORT}"
echo "  API:  https://obclipper.332626.xyz:9090"
echo "  模板: ${TEMPLATE_DIR}/obclipper-server.xml"
echo ""
echo "  管理命令:"
echo "    docker logs -f $CONTAINER_NAME    # 查看日志"
echo "    docker restart $CONTAINER_NAME    # 重启"
echo "    docker stop $CONTAINER_NAME       # 停止"
echo ""
