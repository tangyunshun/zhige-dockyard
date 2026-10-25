# 数据库自动备份脚本 (zhige-dockyard)
# 用法: powershell -ExecutionPolicy Bypass -File scripts\db-backup.ps1
# 建议通过 Windows 计划任务每天自动执行一次；任何数据库危险操作前手动执行一次。
param(
  [string]$DbName    = "zhige_dockyard",
  [string]$BackupDir = "C:\DBBackups",
  [int]$KeepDays     = 14,
  [string]$DbUser    = "root",
  [string]$DbPass    = "root"   # 本地开发库凭据；生产环境请改用环境变量
)
$ErrorActionPreference = "Stop"

$mysqldump = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
if (!(Test-Path $mysqldump)) { throw "mysqldump not found: $mysqldump" }
if (!(Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

# 固定文件名：每次备份覆盖同一份，保证备份目录始终只保留「最新一份」数据备份（历史直接删除覆盖）
$out   = Join-Path $BackupDir ("{0}_latest.sql" -f $DbName)
$err   = Join-Path $BackupDir ("{0}_latest.err" -f $DbName)

# === 等待 MySQL 就绪（开机竞态防护）：3306 端口未就绪则每 5 秒重试，最长等 5 分钟 ===
$mysqlReady = $false
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
  if (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) {
    $mysqlReady = $true
    break
  }
  Start-Sleep -Seconds 5
}
if (-not $mysqlReady) { throw "MySQL 3306 端口在 5 分钟内未就绪，中止备份（请检查 MySQL 服务状态）" }

# cmd /c 重定向保证字节级完整写入（避免 PowerShell 管道二次编码）
$line = "`"$mysqldump`" --single-transaction --routines --triggers --hex-blob --default-character-set=utf8mb4 -u $DbUser -p$DbPass $DbName > `"$out`" 2>`"$err`""
cmd /c $line
if ($LASTEXITCODE -ne 0) { throw "mysqldump failed, see $err" }

$sizeKB = [math]::Round((Get-Item $out).Length / 1KB, 0)
if ($sizeKB -lt 5) { throw "backup suspiciously small ($sizeKB KB): $out" }

# 保留策略：只保留最新一份备份。备份成功后删除目录内其余历史备份文件与错误日志，
# 确保备份目录始终只显示最近一次的数据备份（历史直接删除覆盖）。
Get-ChildItem $BackupDir -Filter "$DbName`_*.sql" |
  Where-Object { $_.Name -ne ("{0}_latest.sql" -f $DbName) } |
  Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem $BackupDir -Filter "$DbName`_*.err" |
  Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "BACKUP OK: $out ($sizeKB KB)"
