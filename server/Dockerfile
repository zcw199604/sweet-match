# 构建上下文由 deploy.sh 组装：server/ 目录 + 仓库根的 *-core.js + 核心依赖的 third_party/（适配器 import 它们）。
FROM node:22-alpine
ENV NODE_ENV=production
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --registry=${NPM_REGISTRY}
COPY server/ ./
COPY *-core.js /app/
COPY third_party/ /app/third_party/
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:2567/ >/dev/null || exit 1
CMD ["node", "index.js"]
