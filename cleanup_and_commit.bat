@echo off
chcp 65001 > nul
cls
echo ============================================================
echo   知阁·舟坊 (ZhiGe Dockyard) - 一键静默清理与 Git 提交
echo ============================================================
echo.

echo 1. 正在安全清理项目冗余文件与目录...
if exist delete_modal_confirmed.png (
    del /f /q delete_modal_confirmed.png
    echo   [已删除] delete_modal_confirmed.png
)
if exist delete_modal_open.png (
    del /f /q delete_modal_open.png
    echo   [已删除] delete_modal_open.png
)
if exist delete_modal_scrolled.png (
    del /f /q delete_modal_scrolled.png
    echo   [已删除] delete_modal_scrolled.png
)
if exist join_modal_open.png (
    del /f /q join_modal_open.png
    echo   [已删除] join_modal_open.png
)
if exist login_page.png (
    del /f /q login_page.png
    echo   [已删除] login_page.png
)
if exist workspace_hub_dashboard.png (
    del /f /q workspace_hub_dashboard.png
    echo   [已删除] workspace_hub_dashboard.png
)
if exist workspace_hub_dashboard_bottom.png (
    del /f /q workspace_hub_dashboard_bottom.png
    echo   [已删除] workspace_hub_dashboard_bottom.png
)
if exist workspace_hub_dashboard_bottom2.png (
    del /f /q workspace_hub_dashboard_bottom2.png
    echo   [已删除] workspace_hub_dashboard_bottom2.png
)
if exist patch.js (
    del /f /q patch.js
    echo   [已删除] patch.js
)
if exist query_users.js (
    del /f /q query_users.js
    echo   [已删除] query_users.js
)
if exist query_workspace_info.js (
    del /f /q query_workspace_info.js
    echo   [已删除] query_workspace_info.js
)
if exist tsconfig.tsbuildinfo (
    del /f /q tsconfig.tsbuildinfo
    echo   [已删除] tsconfig.tsbuildinfo
)
if exist backup-round2 (
    rmdir /s /q backup-round2
    echo   [已删除] backup-round2 目录
)
echo.

echo 2. 正在执行 Git 代码提交流程...
echo ------------------------------------------------------------
echo [Git status]
git status
echo.
echo [Git add]
git add .
echo [Git commit]
git commit -m "chore: clean up unused files and update configuration"
echo [Git push]
git push
echo.
echo ============================================================
echo 清理与提交推送已全部自动执行完毕！
echo ============================================================
pause
