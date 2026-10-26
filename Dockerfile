# ---- 前端构建 ----
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --no-frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# ---- 后端构建 ----
FROM golang:1.23-alpine AS backend
WORKDIR /app/backend
ENV GOPROXY=https://goproxy.cn,direct
COPY backend/go.mod backend/go.sum* ./
RUN go mod download || true
COPY backend/ ./
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
