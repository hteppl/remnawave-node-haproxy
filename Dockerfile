FROM node:24.20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24.20-alpine

RUN apk add --no-cache haproxy tini && mkdir -p /var/run/haproxy /etc/haproxy /var/lib/haproxy

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

ENV NODE_ENV=production \
    NODE_PORT=2222 \
    HAPROXY_BIN=/usr/sbin/haproxy \
    HAPROXY_CONFIG_PATH=/etc/haproxy/haproxy.cfg \
    HAPROXY_RUNTIME_DIR=/var/run/haproxy

# tini reaps the HAProxy master when the node process exits.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
