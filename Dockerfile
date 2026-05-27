FROM node:20-alpine

# 安装 Playwright Chromium 所需的系统依赖
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# 设置 Playwright 使用系统 Chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 复制源码
COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
