#!/usr/bin/env node
// 跨平台 e2e 启动器，替代原来的 run-e2e.sh（Windows 没有 sh）。
// 唯一的平台特例：部分托管 Linux 运行器提供了 Playwright 浏览器但缺其共享库，
// 需要把运行器本地解压出的库目录加进 LD_LIBRARY_PATH。该逻辑仅在 Linux 且目录
// 存在时生效，Windows/macOS 上完全跳过。
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const LINUX_LOCAL_LIBS = "/tmp/c3-libs/usr/lib/x86_64-linux-gnu";

const env = { ...process.env };
if (process.platform === "linux" && existsSync(LINUX_LOCAL_LIBS)) {
  env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
    ? `${LINUX_LOCAL_LIBS}:${env.LD_LIBRARY_PATH}`
    : LINUX_LOCAL_LIBS;
}

// Windows 上可执行文件是 playwright.cmd，交给 shell 解析可避免 ENOENT。
const child = spawn("playwright", ["test", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error(`无法启动 Playwright：${error.code ?? "未知错误"}。请先运行 npm install。`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
