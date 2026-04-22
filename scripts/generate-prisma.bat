@echo off
chcp 65001 >nul
echo ========================================
echo  知阁·舟坊 - Prisma 客户端生成脚本
echo ========================================
echo.

echo [1/4] 正在停止 Node 进程...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] 等待文件锁释放...
timeout /t 3 /nobreak >nul

echo [3/4] 删除旧的 Prisma 客户端...
rmdir /s /q node_modules\.prisma 2>nul
if %errorlevel% equ 0 (
    echo ✓ 旧客户端已删除
) else (
    echo ⚠ 删除失败，将继续尝试生成
)

echo [4/4] 生成新的 Prisma 客户端...
npx prisma generate

echo.
echo ========================================
if %errorlevel% equ 0 (
    echo ✓ Prisma 客户端生成成功!
    echo ========================================
    echo.
    echo 现在可以重启开发服务器:
    echo   npm run dev
) else (
    echo ⚠ 生成失败，请手动执行:
    echo   1. 关闭所有 Node 进程
    echo   2. 手动删除 node_modules\.prisma
    echo   3. 运行：npx prisma generate
)
echo ========================================
echo.
pause
