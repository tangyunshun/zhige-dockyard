# 生成「真实旧版 Office 样本」测试夹具（.doc / .ppt，Word 97-2003 / PowerPoint 97-2003）
#
# 用途：text-extract 的旧版二进制解析（FIB+分片表 / PowerPoint 记录树文本原子）需要真实样本验证，
#       本脚本通过本机 Office COM 生成真实文件（非合成/非占位）。
#
# 前置：Windows + 已安装 Microsoft Word / WPS（注册 Word.Application）与 PowerPoint。
# 注意：本文件必须以「UTF-8 with BOM」保存，否则 Windows PowerShell 5.1 会按 ANSI 解析导致中文乱码。
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File prisma/gen-legacy-office-fixtures.ps1

$ErrorActionPreference = "Continue"
$base = Join-Path (Split-Path -Parent $PSScriptRoot) "src\lib\__tests__\fixtures\legacy"
New-Item -ItemType Directory -Force -Path $base | Out-Null
$docPath = Join-Path $base "sample-real.doc"
$pptPath = Join-Path $base "sample-real.ppt"

# ---- Word 97-2003 (.doc, wdFormatDocument97 = 0) ----
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  try {
    $doc = $word.Documents.Add()
    $doc.Content.Text = "智慧园区项目立项报告`rHello Legacy DOC`r预算 500 万元`r"
    $doc.SaveAs2($docPath, 0)
    $doc.Close()
    "DOC_WRITTEN $docPath"
  } finally {
    try { $word.Quit() } catch { "DOC_QUIT_WARN" }
  }
} catch {
  "DOC_ERROR " + $_.Exception.Message
}

# ---- PowerPoint 97-2003 (.ppt, ppSaveAsPresentation = 1) ----
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  try {
    $pres = $ppt.Presentations.Add()
    $slide = $pres.Slides.Add(1, 1)
    $slide.Shapes.Title.TextFrame.TextRange.Text = "智慧交通汇报"
    $slide.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = "信号配时优化`r三年运维服务"
    $pres.SaveAs($pptPath, 1)
    $pres.Close()
    "PPT_WRITTEN $pptPath"
  } finally {
    try { $ppt.Quit() } catch { "PPT_QUIT_WARN" }
  }
} catch {
  "PPT_ERROR " + $_.Exception.Message
}

Get-ChildItem $base | ForEach-Object {
  $magic = ([System.IO.File]::ReadAllBytes($_.FullName)[0..3] | ForEach-Object { $_.ToString("X2") }) -join ""
  "$($_.Name) size=$($_.Length) magic=$magic"
}
