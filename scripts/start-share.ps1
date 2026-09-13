$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

# 수정 지점: 외부 공개용 서버는 개발 서버와 다른 포트에서 실행합니다.
$sharePort = 5174
$artifactDirectory = Join-Path $projectRoot '.artifacts'
$toolDirectory = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Force -Path $artifactDirectory, $toolDirectory | Out-Null
$processFile = Join-Path $artifactDirectory 'share-processes.json'
if (Test-Path -LiteralPath $processFile) {
  $previous = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
  if (Get-Process -Id $previous.server -ErrorAction SilentlyContinue) {
    Write-Output 'A sharing server is already running. Use npm run share:stop before restarting.'
    exit 0
  }
}

if (Get-NetTCPConnection -LocalPort $sharePort -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $sharePort is already in use. Change sharePort in scripts/start-share.ps1."
}

$cloudflared = Join-Path $toolDirectory 'cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflared)) {
  Write-Output 'Downloading Cloudflare Tunnel from the official GitHub release...'
  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared
}

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

# 빌드된 앱만 공개합니다. Vite 개발 서버와 소스 파일은 터널에 연결하지 않습니다.
$env:PORT = "$sharePort"
$env:HOST = '127.0.0.1'
$env:TRUST_PROXY = '1'
$env:NODE_ENV = 'production'
$serverProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'server/index.js' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $artifactDirectory 'share-server.log') -RedirectStandardError (Join-Path $artifactDirectory 'share-server-error.log') -PassThru
$tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList 'tunnel','--url',"http://127.0.0.1:$sharePort",'--protocol','http2','--no-autoupdate' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $artifactDirectory 'tunnel.log') -RedirectStandardError (Join-Path $artifactDirectory 'tunnel-error.log') -PassThru
@{ server = $serverProcess.Id; serverStarted = $serverProcess.StartTime.ToUniversalTime().ToString('o'); tunnel = $tunnelProcess.Id; tunnelStarted = $tunnelProcess.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $processFile
Write-Output "Sharing started. Local production URL: http://localhost:$sharePort"
Write-Output 'The public HTTPS URL will appear in .artifacts/tunnel-error.log. Keep this PC awake.'
