$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$processFile = Join-Path $projectRoot '.artifacts/share-processes.json'
if (-not (Test-Path -LiteralPath $processFile)) { Write-Output 'No sharing session found.'; exit 0 }
$session = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json

# PID가 재사용되었을 때 다른 프로그램을 종료하지 않도록 시작 시각도 비교합니다.
foreach ($kind in @('tunnel', 'server')) {
  $taskProcess = Get-Process -Id $session.$kind -ErrorAction SilentlyContinue
  $expectedStart = $session.($kind + 'Started')
  if ($taskProcess -and $taskProcess.StartTime.ToUniversalTime().ToString('o') -eq $expectedStart) {
    Stop-Process -Id $taskProcess.Id
  }
}
Remove-Item -LiteralPath $processFile
Write-Output 'Sharing stopped. The database is preserved.'
