# ---- 前端构建 ----
FROM node:20-alpine AS frontend
WORKDIR /app/frontend

# 平台无关：build.mjs 会自动选择 @esbuild/<platform>-<arch> 原生二进制
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# ---- 后端构建 ----
FROM golang:1.23-alpine AS backend
WORKDIR /app/backend
# 国内网络可保留 goproxy.cn，其它环境可改为 proxy.golang.org
ENV GOPROXY=https://goproxy.cn,direct
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# web/dist 仅用于 embed，构建时用前端产物覆盖
RUN rm -rf web/dist && mkdir -p web/dist
COPY --from=frontend /app/frontend/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /cowan-panel ./cmd/server

# ---- 运行镜像 ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
ENV TZ=Asia/Shanghai COWAN_DATA=/app/data COWAN_PORT=8100
COPY --from=backend /cowan-panel /app/cowan-panel
VOLUME /app/data
EXPOSE 8100
WORKDIR /app
ENTRYPOINT ["/app/cowan-panel"]
