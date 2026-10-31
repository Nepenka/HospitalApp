param([ValidateSet('protect','unprotect')][string]$Action)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$taskInput = [Console]::In.ReadToEnd()
if ($Action -eq 'protect') {
    $taskSecure = ConvertTo-SecureString -String $taskInput -AsPlainText -Force
    [Console]::Write((ConvertFrom-SecureString -SecureString $taskSecure))
} else {
    $taskSecure = ConvertTo-SecureString -String $taskInput
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
    try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
}
