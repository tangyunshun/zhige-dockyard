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

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$out   = Join-Path $BackupDir ("{0}_{1}.sql" -f $DbName, $stamp)
$err   = Join-Path $BackupDir ("{0}_{1}.err" -f $DbName, $stamp)

# cmd /c 重定向保证字节级完整写入（避免 PowerShell 管道二次编码）
$line = "`"$mysqldump`" --single-transaction --routines --triggers --hex-blob --default-character-set=utf8mb4 -u $DbUser -p$DbPass $DbName > `"$out`" 2>`"$err`""
cmd /c $line
if ($LASTEXITCODE -ne 0) { throw "mysqldump failed, see $err" }

$sizeKB = [math]::Round((Get-Item $out).Length / 1KB, 0)
if ($sizeKB -lt 5) { throw "backup suspiciously small ($sizeKB KB): $out" }

# 保留策略：删除超过 KeepDays 的旧备份（含空错误日志）
Get-ChildItem $BackupDir -Filter "$DbName`_*.sql" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem $BackupDir -Filter "$DbName`_*.err" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "BACKUP OK: $out ($sizeKB KB)"
