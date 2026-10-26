# Cowan-Panel 构建脚本（Windows PowerShell）
# 用法: .\build.ps1          # 构建前端 + 后端单二进制
#       .\build.ps1 -FrontendOnly
param([switch]$FrontendOnly)

$ErrorActionPreference = "Stop"
$Root = $PSSplit = Split-Path $MyInvocation.MyCommand.Path -Parent
$env:PATH = "$Root\.tools\go\bin;$env:PATH"
$env:GOPROXY = "https://goproxy.cn,direct"
$env:GOMODCACHE = "$Root\.tools\gomodcache"

Write-Host "==> 构建前端..." -ForegroundColor Cyan
Push-Location "$Root\frontend"
if (-not (Test-Path node_modules)) { pnpm install }
pnpm build
Pop-Location

if ($FrontendOnly) { exit 0 }

Write-Host "==> 拷贝 dist 到 backend/web/dist ..." -ForegroundColor Cyan
Remove-Item -Recurse -Force "$Root\backend\web\dist" -ErrorAction SilentlyContinue
Copy-Item -Recurse "$Root\frontend\dist" "$Root\backend\web\dist"

Write-Host "==> 构建后端单二进制 ..." -ForegroundColor Cyan
Push-Location "$Root\backend"
go build -trimpath -ldflags "-s -w" -o cowan-panel.exe ./cmd/server
Pop-Location

Write-Host "完成: backend\cowan-panel.exe  (运行后访问 http://127.0.0.1:8100)" -ForegroundColor Green
