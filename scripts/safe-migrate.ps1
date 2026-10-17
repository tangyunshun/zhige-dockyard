# 安全迁移脚本 (zhige-dockyard)
# 用法: powershell -ExecutionPolicy Bypass -File scripts\safe-migrate.ps1 [deploy|status]
# 作用: 先自动备份数据库，再执行 prisma migrate deploy。
#
# !! 数据库安全红线 !!
# 禁止对 zhige_dockyard 库执行以下命令（会整库清空，且已多次发生事故）:
#   - npx prisma migrate reset
#   - npx prisma migrate dev
#   - npx prisma db push --accept-data-loss
#   - 任何 "DROP DATABASE / 重建数据库" 的脚本
# 生成新迁移请用: npx prisma migrate diff ... （见项目 AGENTS.md 约定），再 safe-migrate 应用。
param([string]$Command = "deploy")
$ErrorActionPreference = "Stop"

if ($Command -notmatch "^(deploy|status)$") {
  throw "只允许 deploy / status。'$Command' 属于危险命令，已拦截。如确需 reset，请先手动备份并三思。"
}

Write-Host "==> [1/2] 备份数据库..."
& (Join-Path $PSScriptRoot "db-backup.ps1")

Write-Host "==> [2/2] prisma migrate $Command ..."
npx prisma migrate $Command
