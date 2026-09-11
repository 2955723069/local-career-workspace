# 求职工作台 · Windows 一键启动
# 由根目录的「启动.bat」调用。检测 Node -> 装依赖 -> 起本地服务 -> 开浏览器。
# 本文件以 UTF-8 with BOM 保存，确保 PowerShell 5.1 正确显示中文。

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$MinNode = [version]"22.22.2"
$Port = 5173
$AppUrl = "http://localhost:$Port/"

# 仓库根目录 = 本脚本所在目录的上一级
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "    $text" -ForegroundColor Green }
function Write-Warn2($text) { Write-Host "    $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host "    $text" -ForegroundColor Red }

function Stop-WithPause($code) {
  Write-Host ""
  Write-Host "按任意键关闭此窗口..." -ForegroundColor DarkGray
  try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 10 }
  exit $code
}

# winget 安装 Node 后，当前进程的 PATH 不会自动更新，需从注册表重读。
function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ";"
}

function Get-NodeVersion {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  try {
    $raw = (& node -v 2>$null)
    if (-not $raw) { return $null }
    return [version]($raw.ToString().TrimStart("v").Trim())
  } catch { return $null }
}

Write-Host "======================================" -ForegroundColor White
Write-Host "  求职工作台 · 本地启动" -ForegroundColor White
Write-Host "  数据全部保存在你自己的浏览器中" -ForegroundColor DarkGray
Write-Host "======================================" -ForegroundColor White

# ---------- 1. 检测 Node ----------
Write-Step "检查 Node.js（需要 $MinNode 或更高）"
$nodeVersion = Get-NodeVersion

if (-not $nodeVersion) {
  Write-Warn2 "未检测到 Node.js。"
} elseif ($nodeVersion -lt $MinNode) {
  Write-Warn2 "当前 Node.js 版本 $nodeVersion 过低（本项目依赖要求 >= $MinNode）。"
} else {
  Write-Ok "Node.js $nodeVersion，符合要求。"
}

if (-not $nodeVersion -or $nodeVersion -lt $MinNode) {
  $hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
  if (-not $hasWinget) {
    Write-Err "系统没有 winget，无法自动安装 Node.js。"
    Write-Host ""
    Write-Host "    请手动安装后重新双击本脚本：" -ForegroundColor White
    Write-Host "    https://nodejs.org/  （下载 LTS 版本，安装时保持默认选项即可）" -ForegroundColor White
    Stop-WithPause 1
  }

  Write-Step "使用 winget 安装 Node.js LTS（可能弹出权限确认，请允许）"
  try {
    winget install --id OpenJS.NodeJS.LTS --exact --source winget `
      --accept-package-agreements --accept-source-agreements
  } catch {
    Write-Err "winget 安装过程出错。"
  }

  Update-PathFromRegistry
  $nodeVersion = Get-NodeVersion

  if (-not $nodeVersion) {
    Write-Warn2 "Node.js 可能已安装，但当前窗口还没识别到它。"
    Write-Host ""
    Write-Host "    这是 Windows 环境变量的正常现象。请关闭此窗口，重新双击「启动.bat」。" -ForegroundColor White
    Stop-WithPause 0
  }
  if ($nodeVersion -lt $MinNode) {
    Write-Err "安装后的版本仍是 $nodeVersion，低于要求的 $MinNode。"
    Write-Host "    请到 https://nodejs.org/ 手动安装最新 LTS 版本。" -ForegroundColor White
    Stop-WithPause 1
  }
  Write-Ok "Node.js $nodeVersion 安装完成。"
}

# ---------- 2. 安装依赖 ----------
if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) {
  Write-Step "首次运行：安装依赖（需要联网，约 1-3 分钟）"
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    Write-Err "依赖安装失败（退出码 $LASTEXITCODE）。"
    Write-Host ""
    Write-Host "    常见原因与处理：" -ForegroundColor White
    Write-Host "    - 网络不通：检查代理，或改用镜像源 npm config set registry https://registry.npmmirror.com" -ForegroundColor White
    Write-Host "    - 路径过长：把项目移到较短的路径，如 C:\c3" -ForegroundColor White
    Write-Host "    - 杀软/OneDrive 占用：把项目移出 OneDrive 同步目录后重试" -ForegroundColor White
    Stop-WithPause 1
  }
  Write-Ok "依赖安装完成。"
} else {
  Write-Ok "依赖已存在，跳过安装。（如需重装：删掉 node_modules 文件夹再运行）"
}

# ---------- 3. 启动本地服务 ----------
Write-Step "启动本地服务 $AppUrl"
Write-Host "    保持此窗口开着；关闭窗口即停止服务。" -ForegroundColor DarkGray

# 固定端口，避免端口被占用时 vite 自动换端口、导致下面打开的网址不对。
$server = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--port", "$Port", "--strictPort" `
  -NoNewWindow -PassThru

# ---------- 4. 等服务就绪后开浏览器 ----------
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  if ($server.HasExited) { break }
  Start-Sleep -Milliseconds 500
  try {
    $null = Invoke-WebRequest -Uri $AppUrl -UseBasicParsing -TimeoutSec 2
    $ready = $true
    break
  } catch {
    # 服务还没起来；继续等
  }
}

if ($server.HasExited) {
  Write-Err "服务启动失败（退出码 $($server.ExitCode)）。"
  Write-Host "    如提示端口 $Port 被占用，请关闭占用该端口的程序后重试。" -ForegroundColor White
  Stop-WithPause 1
}

if ($ready) {
  Write-Ok "服务已就绪，正在打开浏览器。"
  Start-Process $AppUrl
} else {
  Write-Warn2 "等待服务超时，但进程仍在运行。请手动在浏览器打开：$AppUrl"
}

Write-Host ""
Write-Host "运行中。按 Ctrl+C 或直接关闭窗口即可停止。" -ForegroundColor DarkGray
Wait-Process -Id $server.Id
