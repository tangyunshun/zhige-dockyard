$ErrorActionPreference = "Continue"
$env:CODEBUDDY_SAFE_DELETE_ENABLED = '0'
$cmds = @(
  "npx vitest run src/app/api/studio/__tests__/core3-failed-state-machine.test.ts",
  "npx vitest run src/app/api/studio/__tests__/core3-billing-invariant.test.ts",
  "npx vitest run src/app/api/studio/__tests__/core3-c01-c02-c07-backend-closure.test.ts",
  "npx vitest run src/app/api/studio/__tests__/core3-c01-c02-c07-route-contract-integration.test.ts",
  "npx vitest run src/lib/__tests__/task-detail-contract-view.test.ts",
  "npx vitest run src/lib/__tests__/refund-status.test.ts",
  "npx vitest run src/lib/__tests__/refund-recovery.test.ts",
  "npx vitest run src/lib/__tests__/refund-integration.test.ts",
  "npx vitest run src/lib/__tests__/result-viewer-refund-disclaimer.test.ts",
  "npx vitest run src/lib/__tests__/ui-readiness-and-hints-guard.test.ts"
)
$summary = @()
foreach ($c in $cmds) {
  $name = ($c -split " ")[-1]
  Write-Host ("=== RUN " + $name + " ===")
  cmd /c "$c" 2>&1 | Out-String -Width 200 | Out-File -Append "accept-test.log"
  $code = $LASTEXITCODE
  # extract vitest summary line
  $sum = (Get-Content accept-test.log -Tail 30 | Select-String -Pattern "Test Files|Tests " | Select-Object -Last 2) -join " | "
  $summary += ($name + " => exit=" + $code + " | " + $sum)
  Write-Host ($name + " exit=" + $code)
}
Write-Host "=== TSC ==="
cmd /c "npx tsc --noEmit" 2>&1 | Out-String -Width 200 | Out-File -Append "accept-test.log"
$tsc = $LASTEXITCODE
$summary += ("tsc --noEmit => exit=" + $tsc)
Write-Host ("tsc exit=" + $tsc)
Write-Host "=== BUILD ==="
cmd /c "npm run build" 2>&1 | Out-String -Width 200 | Out-File -Append "accept-build.log"
$bld = $LASTEXITCODE
$summary += ("npm run build => exit=" + $bld)
Write-Host ("build exit=" + $bld)
Write-Host "===== SUMMARY ====="
$summary | ForEach-Object { Write-Host $_ }
$summary | Out-File "accept-test-summary.log"
