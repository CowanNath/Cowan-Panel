// 生产构建脚本：tsc 负责类型检查后，用 esbuild CLI 直接打包。
//
// 为什么不用 `vite build`：
//   - 某些受限环境（如本项目的开发沙箱）禁止 Node 子进程使用管道 stdio，
//     而 esbuild 的 JS service 必须走管道通信，会 EPERM；
//   - 用 CLI + 继承 stdio 的方式在各平台都能稳定运行。
//
// 跨平台：esbuild 的原生二进制由可选依赖 @esbuild/<platform>-<arch> 提供，
// 目录名与文件名在 Windows / Linux / macOS 上不同，脚本会自动探测，
// 因此同一份脚本可直接在 Windows 本地与 Linux Docker 容器内使用。
import { spawnSync } from 'node:child_process';
import {
  existsSync, readFileSync, writeFileSync, readdirSync, renameSync, rmSync, mkdirSync,
  cpSync, chmodSync, statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Windows 包的二进制在包根目录，Linux/macOS 在 bin/ 下 */
function binCandidates(pkgDir, binName) {
  return [path.join(pkgDir, 'bin', binName), path.join(pkgDir, binName)];
}

/**
 * 解析当前平台可用的 esbuild 可执行文件。
 * 查找顺序：ESBUILD_BINARY_PATH → pnpm 虚拟仓库 → hoisted node_modules → PATH。
 * 找不到时返回 null。
 */
export function resolveEsbuild({ root, platform = process.platform, arch = process.arch, env = process.env }) {
  const platformTag = `${platform}-${arch}`;
  const binName = platform === 'win32' ? 'esbuild.exe' : 'esbuild';

  // 1) 显式指定（CI 常用）
  if (env.ESBUILD_BINARY_PATH && existsSync(env.ESBUILD_BINARY_PATH)) {
    return env.ESBUILD_BINARY_PATH;
  }

  // 2) pnpm 虚拟仓库：node_modules/.pnpm/@esbuild+<tag>@<version>/node_modules/@esbuild/<tag>
  const store = path.join(root, 'node_modules', '.pnpm');
  if (existsSync(store)) {
    const prefix = `@esbuild+${platformTag}@`;
    for (const dir of readdirSync(store)) {
      if (!dir.startsWith(prefix)) continue;
      const pkgDir = path.join(store, dir, 'node_modules', '@esbuild', platformTag);
      for (const bin of binCandidates(pkgDir, binName)) {
        if (existsSync(bin)) return bin;
      }
    }
  }

  // 3) npm / yarn 的 hoisted 布局
  for (const dir of [
    path.join(root, 'node_modules', '@esbuild', platformTag),
    path.join(root, 'node_modules', `@esbuild/${platformTag}`),
  ]) {
    for (const bin of binCandidates(dir, binName)) {
      if (existsSync(bin)) return bin;
    }
  }

  // 4) PATH 上已有的 esbuild（全局安装 / 系统包管理器）
  if (spawnSync('esbuild', ['--version'], { stdio: 'ignore' }).status === 0) {
    return 'esbuild';
  }
  return null;
}

function main() {
  const root = path.resolve(import.meta.dirname, '..');
  const platformTag = `${process.platform}-${process.arch}`;

  const exe = resolveEsbuild({ root });
  if (!exe) {
    console.error(
      `[build] 未找到 esbuild（平台 ${platformTag}）。\n` +
        `       请先运行 pnpm install；容器中请确认可选依赖 @esbuild/${platformTag} 已安装；\n` +
        `       也可用环境变量 ESBUILD_BINARY_PATH 指定二进制路径。`,
    );
    process.exit(1);
  }
  if (process.platform !== 'win32') {
    // 从压缩包解出的二进制可能丢失执行位
    try {
      chmodSync(exe, statSync(exe).mode | 0o111);
    } catch {
      /* 忽略：只读文件系统或已有执行权限 */
    }
  }

  // 清空历史产物，避免旧哈希文件残留
  const distDir = path.join(root, 'dist');
  const assetsDir = path.join(distDir, 'assets');
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(assetsDir, { recursive: true });

  const started = Date.now();
  const args = [
    path.join(root, 'src', 'main.tsx'),
    `--outdir=${assetsDir}`,
    '--bundle',
    '--minify',
    '--format=esm',
    '--target=es2020',
    '--jsx=automatic',
    '--entry-names=[name]',
    '--chunk-names=[name]-[hash]',
    '--asset-names=[name]-[hash]',
    '--define:process.env.NODE_ENV="production"',
    '--log-level=warning',
  ];

  console.log(`[build] 平台 ${platformTag}，esbuild → ${exe}`);
  const r = spawnSync(exe, args, { stdio: 'inherit', cwd: root });
  if (r.error) {
    console.error('[build] 无法启动 esbuild：', r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`[build] esbuild 退出码 ${r.status}`);
    process.exit(r.status ?? 1);
  }

  // 给产物文件名加内容哈希，彻底避免浏览器缓存旧版本
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

  // 生成 dist/index.html：把 dev 用的 /src/main.tsx 换成打包产物
  const html = readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('/src/main.tsx', `/assets/${hashed['main.js'] ?? 'main.js'}`)
    .replace(
      '</head>',
      `    <link rel="stylesheet" href="/assets/${hashed['main.css'] ?? 'main.css'}" />\n  </head>`,
    );
  writeFileSync(path.join(distDir, 'index.html'), html);

  // 拷贝 public 下的静态资源（如默认壁纸 bg.jpg）到 dist 根目录
  const publicDir = path.join(root, 'public');
  if (existsSync(publicDir)) {
    cpSync(publicDir, distDir, { recursive: true });
  }

  const kb = (p) => `${(statSync(p).size / 1024).toFixed(1)}KB`;
  for (const name of Object.values(hashed)) {
    console.log(`[build] assets/${name}  ${kb(path.join(assetsDir, name))}`);
  }
  console.log(`[build] 完成 → dist/（${Date.now() - started}ms）`);
}

// 仅在被直接执行时构建（被测试 import 时不触发）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
