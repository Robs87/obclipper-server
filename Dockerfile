FROM node:20-slim

# 安装 Playwright Chromium 所需的系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# 设置 Playwright 使用系统 Chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 复制源码
COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
