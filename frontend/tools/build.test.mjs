// esbuild 跨平台解析的单元测试：用临时目录模拟各平台的 node_modules 布局。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveEsbuild } from './build.mjs';

function fakeRoot() {
  return mkdtempSync(path.join(tmpdir(), 'cowan-build-test-'));
}

function touch(file) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '');
}

test('pnpm 布局：Linux 使用 <pkg>/bin/esbuild', () => {
  const root = fakeRoot();
  try {
    const bin = path.join(
      root, 'node_modules', '.pnpm', '@esbuild+linux-x64@0.21.5',
      'node_modules', '@esbuild', 'linux-x64', 'bin', 'esbuild',
    );
    touch(bin);
    assert.equal(resolveEsbuild({ root, platform: 'linux', arch: 'x64', env: {} }), bin);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pnpm 布局：Windows 使用包根目录的 esbuild.exe', () => {
  const root = fakeRoot();
  try {
    const bin = path.join(
      root, 'node_modules', '.pnpm', '@esbuild+win32-x64@0.21.5',
      'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe',
    );
    touch(bin);
    assert.equal(resolveEsbuild({ root, platform: 'win32', arch: 'x64', env: {} }), bin);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hoisted 布局：macOS arm64 使用 bin/esbuild', () => {
  const root = fakeRoot();
  try {
    const bin = path.join(root, 'node_modules', '@esbuild', 'darwin-arm64', 'bin', 'esbuild');
    touch(bin);
    assert.equal(resolveEsbuild({ root, platform: 'darwin', arch: 'arm64', env: {} }), bin);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('优先使用环境变量 ESBUILD_BINARY_PATH', () => {
  const root = fakeRoot();
  try {
    const custom = path.join(root, 'custom-esbuild');
    touch(custom);
    assert.equal(
      resolveEsbuild({ root, platform: 'linux', arch: 'arm64', env: { ESBUILD_BINARY_PATH: custom } }),
      custom,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('找不到时返回 null（不会误用其它平台的二进制）', () => {
  const root = fakeRoot();
  try {
    // 只有 Windows 二进制，却按 Linux 查找
    touch(path.join(
      root, 'node_modules', '.pnpm', '@esbuild+win32-x64@0.21.5',
      'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe',
    ));
    assert.equal(resolveEsbuild({ root, platform: 'linux', arch: 'x64', env: {} }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
