param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$taskUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskRunner = Join-Path $PSScriptRoot 'windows-postgres-task.ps1'
$taskShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
foreach ($entry in @(@{Name='AnaFix PostgreSQL';Command='start'},@{Name='AnaFix Daily Backup';Command='daily'})) {
  $taskArgs = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -NodePath "{1}" -Action {2}' -f $taskRunner,$NodePath,$entry.Command
  $existingTask = Get-ScheduledTask -TaskName $entry.Name -ErrorAction SilentlyContinue
  if ($existingTask -and -not ($existingTask.Actions.Arguments -like "*$taskRunner*")) { throw 'An unrelated task uses the proposed task name; it was not changed.' }
  $taskAction = New-ScheduledTaskAction -Execute $taskShell -Argument $taskArgs -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
  $taskTriggers = @(New-ScheduledTaskTrigger -AtLogOn -User $taskUser)
  if ($entry.Command -eq 'daily') { $taskTriggers += New-ScheduledTaskTrigger -Daily -At '03:00' }
  Register-ScheduledTask -TaskName $entry.Name -Action $taskAction -Trigger $taskTriggers -Principal $taskPrincipal -Settings $taskSettings -Description 'AnaFix local PostgreSQL operation; Windows-profile-protected credentials, no passwords in task arguments.' -Force | Out-Null
  Write-Output ($entry.Name + ': registered for the current Windows user.')
}
Start-ScheduledTask -TaskName 'AnaFix Daily Backup'
