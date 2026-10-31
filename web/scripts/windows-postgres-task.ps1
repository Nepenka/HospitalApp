param(
  [Parameter(Mandatory=$true)][string]$NodePath,
  [ValidateSet('start','daily','daily-force')][string]$Action = 'daily'
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskLog = Join-Path $env:USERPROFILE ('AnaFixServer\scheduled-' + $Action + '.log')
try {
  [IO.File]::AppendAllText($taskLog, ('Scheduled operation ' + $Action + ' started at ' + (Get-Date).ToString('o') + [Environment]::NewLine), [Text.Encoding]::Unicode)
  Set-Location -LiteralPath $taskRoot
  $ErrorActionPreference = 'Continue'
  & $NodePath --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types (Join-Path $PSScriptRoot 'windows-postgres.mjs') $Action >> $taskLog 2>&1
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} catch {
  $_.Exception.Message | Out-File -LiteralPath $taskLog -Append -Encoding utf8
  exit 1
}
