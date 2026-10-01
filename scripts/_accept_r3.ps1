$ErrorActionPreference = "Continue"
$env:CI = "true"
$env:CODEBUDDY_SAFE_DELETE_ENABLED = "0"
$files = @(
  "src/app/api/studio/__tests__/core3-failed-state-machine.test.ts",
  "src/app/api/studio/__tests__/core3-billing-invariant.test.ts",
  "src/app/api/studio/__tests__/core3-c01-c02-c07-backend-closure.test.ts",
  "src/app/api/studio/__tests__/core3-c01-c02-c07-route-contract-integration.test.ts",
  "src/lib/__tests__/core3-r34-deterministic-acceptance.test.ts",
  "src/lib/__tests__/task-detail-contract-view.test.ts",
  "src/lib/__tests__/refund-status.test.ts",
  "src/lib/__tests__/refund-recovery.test.ts",
  "src/lib/__tests__/refund-integration.test.ts",
  "src/lib/__tests__/result-viewer-refund-disclaimer.test.ts",
  "src/lib/__tests__/ui-readiness-and-hints-guard.test.ts",
  "src/app/api/studio/__tests__/core3-c07-unit-display.test.ts"
)
$summary = @()
foreach ($f in $files) {
  $o = npx vitest run $f --reporter=dot 2>&1 | Out-String -Width 200
  $code = $LASTEXITCODE
  $m = ($o -split "`n" | Select-String -Pattern "Tests  " | Select-Object -First 1)
  $summary += "$f exit=$code $m"
}
# tsc
npx tsc --noEmit 2>&1 | Out-Null
$tsc = $LASTEXITCODE
$summary += "tsc --noEmit exit=$tsc"
# build
npm run build *> build-r3.log
$build = $LASTEXITCODE
$summary += "npm run build exit=$build"
$summary | Out-File -FilePath accept-r3-summary.log -Encoding utf8
Write-Host "DONE"
