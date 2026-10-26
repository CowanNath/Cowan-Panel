// 生产构建脚本：tsc 负责类型检查后，用 esbuild CLI 直接打包。
// 之所以不用 `vite build`：当前沙箱环境禁止 Node 子进程使用管道 stdio，
// esbuild service 必须管道通信会 EPERM；而 CLI 以继承 stdio 方式可正常运行。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function findEsbuildExe() {
  const pnpmDir = path.join(root, 'node_modules', '.pnpm');
  if (existsSync(pnpmDir)) {
    for (const d of readdirSync(pnpmDir)) {
      if (!d.startsWith('@esbuild+win32-x64@')) continue;
      const p = path.join(pnpmDir, d, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
      if (existsSync(p)) return p;
    }
  }
  // 普通 node_modules 布局兜底
  const direct = path.join(root, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
  if (existsSync(direct)) return direct;
  throw new Error('未找到 @esbuild/win32-x64/esbuild.exe，请先 pnpm install');
}

const exe = findEsbuildExe();
// 每次构建前清空 assets，避免旧哈希产物残留
rmSync(path.join(root, 'dist', 'assets'), { recursive: true, force: true });
const args = [
  path.join(root, 'src', 'main.tsx'),
  `--outdir=${path.join(root, 'dist', 'assets')}`,
  '--bundle',
  '--minify',
  '--format=esm',
  '--target=es2020',
  '--jsx=automatic',
  '--entry-names=[name]',
  '--chunk-names=[name]-[hash]',
  '--asset-names=[name]-[hash]',
  '--define:process.env.NODE_ENV="production"',
];

console.log('[build] esbuild', path.basename(exe));
const r = spawnSync(exe, args, { stdio: 'inherit', cwd: root });
if (r.status !== 0) {
  console.error('[build] esbuild 失败');
  process.exit(r.status ?? 1);
}

// 生成 dist/index.html：把 dev 用的 /src/main.tsx 换成打包产物
// 同时给产物文件名加内容哈希，彻底避免浏览器缓存旧版本
const assetsDir = path.join(root, 'dist', 'assets');
const hashed = {};
for (const f of readdirSync(assetsDir)) {
  const ext = path.extname(f);
  if (!['.js', '.css'].includes(ext)) continue;
  const data = readFileSync(path.join(assetsDir, f));
  const hash = createHash('md5').update(data).digest('hex').slice(0, 8);
  const name = `${path.basename(f, ext)}-${hash}${ext}`;
  renameSync(path.join(assetsDir, f), path.join(assetsDir, name));
  hashed[f] = name;
}

const html = readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('/src/main.tsx', `/assets/${hashed['main.js'] ?? 'main.js'}`)
  .replace(
    '</head>',
    `    <link rel="stylesheet" href="/assets/${hashed['main.css'] ?? 'main.css'}" />\n  </head>`,
  );
writeFileSync(path.join(root, 'dist', 'index.html'), html);

// 拷贝 public 下的静态资源（如默认壁纸 bg.jpg）到 dist 根目录
const publicDir = path.join(root, 'public');
if (existsSync(publicDir)) {
  mkdirSync(path.join(root, 'dist'), { recursive: true });
  cpSync(publicDir, path.join(root, 'dist'), { recursive: true });
}

console.log('[build] 完成 → dist/', hashed);
