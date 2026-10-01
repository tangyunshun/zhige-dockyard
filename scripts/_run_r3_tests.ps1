$ErrorActionPreference = "Continue"
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
$allOk = $true
foreach ($f in $files) {
  npx vitest run $f --reporter=dot *> "r3t-$($f.Split('/')[-1]).log" 2>&1
  $ec = $LASTEXITCODE
  if ($ec -ne 0) { $allOk = $false }
  Add-Content -Path "accept-r3b-summary.log" -Value "$f -> exit=$ec"
}
Add-Content -Path "accept-r3b-summary.log" -Value "ALL_OK=$allOk"
Write-Host "DONE"
