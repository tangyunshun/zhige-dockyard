# ZhiGe-Dockyard 存储备份脚本（文件 + 数据库一体）
#
# 用途：把资料文件（uploads/）与 MySQL 数据库打包备份到目标位置
#       （另一块磁盘 / 移动硬盘 / 网络共享路径 \\NAS\backup 等，实现异地容灾）。
#
# 用法（PowerShell）：
#   .\scripts\backup-storage.ps1 -Target "D:\backups"
#   .\scripts\backup-storage.ps1 -Target "\\NAS\backup\zhige" -Keep 30
#
# 挂 Windows 计划任务（每天 03:00 自动备份）：
#   schtasks /Create /TN "ZhiGe-Backup" /SC DAILY /ST 03:00 /TR ^
#     "powershell -ExecutionPolicy Bypass -File \"<项目根>\scripts\backup-storage.ps1\" -Target \"<备份目标路径>\""
#
# 说明：
#   - 备份内容 = uploads 全部资料文件 + 数据库完整 dump（含空间、流水、订单等业务数据）。
#   - 每次备份生成一个带时间戳的 zip；自动只保留最近 -Keep 份（默认 14）。
#   - 部署说明：本机计划任务 ZhiGe-Backup 通过 D:\db-backup\run-file-backup.cmd 调用本脚本，
#     参数使用 -Keep 1（只保留最新一份，目录中不积累历史备份；如需恢复多份历史请调大该值）。
#   - 数据库导出依赖 mysqldump 在 PATH 中（MySQL 安装目录 bin 下，可自行加入 PATH）；
#     若 mysqldump 不可用，脚本仍会备份文件部分并给出提示。

param(
  [Parameter(Mandatory = $true)]
  [string]$Target,          # 备份目标目录（本地其他磁盘 / 移动硬盘 / 网络共享路径）
  [int]$Keep = 14           # 保留最近多少份备份
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

# mysqldump 路径：优先使用 PATH，否则兜底到本机常见安装位置（避免依赖手工配置 PATH）
$mysqldump = "mysqldump"
$knownPaths = @(
  "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe",
  "C:\Program Files\MySQL\MySQL Server 5.7\bin\mysqldump.exe",
  "C:\Program Files\MariaDB\MariaDB 10*\bin\mysqldump.exe",
  "C:\xampp\mysql\bin\mysqldump.exe"
)
if (-not (Get-Command mysqldump -ErrorAction SilentlyContinue)) {
  foreach ($cand in $knownPaths) {
    $resolved = Resolve-Path $cand -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($resolved) { $mysqldump = $resolved.Path; break }
  }
}
$workDir = Join-Path $env:TEMP "zhige-backup-$stamp"

Write-Host "[1/4] 准备临时工作目录 $workDir"
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

# ---- 1. 资料文件 ----
$uploadsDir = Join-Path $projectRoot "uploads"
if (Test-Path $uploadsDir) {
  Write-Host "[2/4] 打包资料文件 uploads/ ..."
  Compress-Archive -Path (Join-Path $uploadsDir "*") -DestinationPath (Join-Path $workDir "uploads.zip") -Force
} else {
  Write-Warning "未找到 uploads 目录（$uploadsDir），跳过文件备份"
}

# ---- 2. 数据库 ----
$envFile = Join-Path $projectRoot ".env"
if (Test-Path $envFile) {
  $dbLine = Select-String -Path $envFile -Pattern '^\s*DATABASE_URL\s*=\s*"?(.*?)"?\s*$' | Select-Object -First 1
  if ($dbLine -and $dbLine.Matches[0].Groups[1].Value -match '^mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)') {
    $dbUser = $Matches[1]; $dbPass = $Matches[2]; $dbHost = $Matches[3]; $dbPort = $Matches[4]; $dbName = $Matches[5]
    Write-Host "[3/4] 导出数据库 $dbName ..."
    try {
      & $mysqldump --host=$dbHost --port=$dbPort --user=$dbUser "--password=$dbPass" --single-transaction --routines --triggers $dbName | Out-File -Encoding utf8 (Join-Path $workDir "database.sql")
      if ($LASTEXITCODE -ne 0) { throw "mysqldump 退出码 $LASTEXITCODE" }
    } catch {
      Write-Warning "数据库导出失败（$($_.Exception.Message)）。请确认 mysqldump 可用；本次仅备份文件部分。"
    }
  } else {
    Write-Warning ".env 中未找到可解析的 DATABASE_URL，跳过数据库备份"
  }
} else {
  Write-Warning "未找到 .env，跳过数据库备份"
}

# ---- 3. 压缩并投递到目标位置 ----
if (-not (Test-Path $Target)) { New-Item -ItemType Directory -Path $Target -Force | Out-Null }
$archive = Join-Path $Target "zhige-backup-$stamp.zip"
Write-Host "[4/4] 写入备份 $archive ..."
Compress-Archive -Path (Join-Path $workDir "*") -DestinationPath $archive -Force
Remove-Item $workDir -Recurse -Force

# ---- 4. 清理旧备份，只保留最近 $Keep 份 ----
Get-ChildItem $Target -Filter "zhige-backup-*.zip" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep |
  ForEach-Object { Write-Host "清理过期备份：$($_.Name)"; Remove-Item $_.FullName -Force }

Write-Host "备份完成：$archive"
