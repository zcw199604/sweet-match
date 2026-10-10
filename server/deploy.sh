#!/usr/bin/env bash
# 把房间服务打成镜像并在远端重启容器。用法：server/deploy.sh <ssh 主机别名>
# 可用环境变量：ALLOWED_ORIGINS（逗号分隔的网页来源，默认只放行线上前端）、NPM_REGISTRY、PORT（宿主机回环端口，默认 2567）
# 要连线上服务做本地调试：ALLOWED_ORIGINS=https://game.zcw.work,http://localhost:4173 server/deploy.sh <host>
set -euo pipefail
HOST="${1:?用法: deploy.sh <ssh-host>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME=arcade-server
PORT="${PORT:-2567}"
ORIGINS="${ALLOWED_ORIGINS-https://game.zcw.work}"   # 显式传空串表示不限制（只给本地试验用）
REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
REMOTE_DIR='$HOME/arcade-server-build'

echo "→ 打包上下文"
tar -C "$ROOT" --exclude='server/node_modules' --exclude='server/test' -czf - server/package.json server/package-lock.json server/*.js server/adapters server/Dockerfile $(cd "$ROOT" && ls *-core.js) third_party/xiangqi third_party/doudizhu third_party/junqi third_party/minesweeper \
  | ssh "$HOST" "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR && tar -C $REMOTE_DIR -xzf - && mv $REMOTE_DIR/server/Dockerfile $REMOTE_DIR/Dockerfile"

echo "→ 构建并重启容器"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd $REMOTE_DIR
sudo docker build -q --build-arg NPM_REGISTRY=$REGISTRY -t $NAME:latest .
sudo docker rm -f $NAME >/dev/null 2>&1 || true
sudo docker run -d --name $NAME --restart unless-stopped \
  -p 127.0.0.1:$PORT:2567 \
  -e ALLOWED_ORIGINS='$ORIGINS' \
  --memory 512m --cpus 2 \
  --log-opt max-size=10m --log-opt max-file=3 \
  --label com.centurylinklabs.watchtower.enable=false \
  $NAME:latest
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -m 2 127.0.0.1:$PORT/ >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
sudo docker ps --filter name=$NAME --format '{{.Names}} {{.Status}} {{.Ports}}'
if [ -z "\${ok:-}" ]; then echo '!! 服务没有起来，最近日志：' >&2; sudo docker logs --tail 20 $NAME >&2; exit 1; fi
echo '服务已就绪'
REMOTE
