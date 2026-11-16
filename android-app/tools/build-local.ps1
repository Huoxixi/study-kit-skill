param([switch]$Qa)
$ErrorActionPreference='Stop'
$appRoot=Split-Path $PSScriptRoot -Parent
$source=Join-Path (Split-Path $appRoot -Parent) 'index.html'
$mapping=& subst.exe
$current=$mapping | Where-Object {$_ -like '*'+$appRoot}
$created=$false
if($current){$drive=$current.Substring(0,2)}else{
    $letter=@('R','S','T','U','V','W','X','Y','Z') | Where-Object {-not (Test-Path ($_+':\'))} | Select-Object -First 1
    if(-not $letter){throw 'No drive letter available for Android build tools.'}
    $drive=$letter+':'
    & subst.exe $drive $appRoot
    if($LASTEXITCODE -ne 0){throw 'Could not map the project for legacy Android tools.'}
    $created=$true
}
try { & ($drive+'\tools\build.ps1') -Qa:$Qa -SourceHtml $source }
finally { if($created){& subst.exe $drive /D} }
