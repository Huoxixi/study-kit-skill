param([switch]$Qa,[string]$SourceHtml='')
$ErrorActionPreference='Stop'
$appRoot=Split-Path $PSScriptRoot -Parent
$chain=Join-Path $appRoot '.toolchain'
$build=Join-Path $appRoot 'build'
$dist=Join-Path $appRoot 'dist'
$signing=Join-Path $appRoot 'signing'
foreach($dir in @($build,$dist,$signing,(Join-Path $build 'classes'),(Join-Path $build 'generated'),(Join-Path $build 'dex'))){New-Item -ItemType Directory -Path $dir -Force | Out-Null}
Get-ChildItem -LiteralPath (Join-Path $build 'classes'),(Join-Path $build 'generated'),(Join-Path $build 'dex') -Recurse -File | ForEach-Object {Remove-Item -LiteralPath $_.FullName -Force}
$java=(Get-ChildItem -LiteralPath (Join-Path $chain 'jdk') -Filter java.exe -Recurse | Select-Object -First 1).FullName
if(-not $java){throw 'Run tools/bootstrap.ps1 first.'}
$javaBin=Split-Path $java -Parent
$androidJar=(Get-ChildItem -LiteralPath (Join-Path $chain 'platforms-android-35') -Filter android.jar -Recurse | Select-Object -First 1).FullName
$aapt=(Get-ChildItem -LiteralPath (Join-Path $chain 'build-tools-35-0-0') -Filter aapt2.exe -Recurse | Select-Object -First 1).FullName
$toolBin=Split-Path $aapt -Parent
function Run { param([string]$exe,[Parameter(ValueFromRemainingArguments=$true)][string[]]$arguments) & $exe @arguments; if($LASTEXITCODE -ne 0){throw "Build command failed: $exe"} }
if(-not $SourceHtml){$SourceHtml=Join-Path (Split-Path $appRoot -Parent) 'index.html'}
Copy-Item -LiteralPath $SourceHtml -Destination (Join-Path $appRoot 'assets\sample.html')
Run $aapt @('compile','--dir',(Join-Path $appRoot 'res'),'-o',(Join-Path $build 'resources.zip'))
$link=@('link','-o',(Join-Path $build 'base.apk'),'-I',$androidJar,'--manifest',(Join-Path $appRoot 'AndroidManifest.xml'),'--java',(Join-Path $build 'generated'),'-A',(Join-Path $appRoot 'assets'),'--min-sdk-version','26','--target-sdk-version','35',(Join-Path $build 'resources.zip'))
if($Qa){$link+='--debug-mode'}
Run $aapt $link
$sources=@(Get-ChildItem -LiteralPath (Join-Path $appRoot 'src'),(Join-Path $build 'generated') -Filter '*.java' -Recurse | ForEach-Object {'"'+$_.FullName.Replace('\','/')+'"'})
$sources | Set-Content -LiteralPath (Join-Path $build 'sources.txt') -Encoding utf8NoBOM
Run (Join-Path $javaBin 'javac.exe') @('-J-Duser.language=en','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',($androidJar+';'+(Join-Path $toolBin 'core-lambda-stubs.jar')),'-d',(Join-Path $build 'classes'),('@'+(Join-Path $build 'sources.txt')))
Run (Join-Path $javaBin 'jar.exe') @('cf',(Join-Path $build 'classes.jar'),'-C',(Join-Path $build 'classes'),'.')
Run $java @('-cp',(Join-Path $toolBin 'lib\d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',$androidJar,'--output',(Join-Path $build 'dex'),(Join-Path $build 'classes.jar'))
Copy-Item -LiteralPath (Join-Path $build 'base.apk') -Destination (Join-Path $build 'unsigned.apk') -Force
Run (Join-Path $javaBin 'jar.exe') @('uf',(Join-Path $build 'unsigned.apk'),'-C',(Join-Path $build 'dex'),'classes.dex')
Run (Join-Path $toolBin 'zipalign.exe') @('-f','4',(Join-Path $build 'unsigned.apk'),(Join-Path $build 'aligned.apk'))
$key=Join-Path $signing 'reader-release.p12'
$passwordFile=Join-Path $signing 'password.txt'
if(-not (Test-Path -LiteralPath $key)){
    $bytes=New-Object byte[] 32;[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    [Convert]::ToBase64String($bytes) | Set-Content -LiteralPath $passwordFile -Encoding ascii -NoNewline
    Run (Join-Path $javaBin 'keytool.exe') @('-genkeypair','-keystore',$key,'-storetype','PKCS12','-storepass:file',$passwordFile,'-keypass:file',$passwordFile,'-alias','studykit','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Study Kit Reader, OU=Personal Offline Study, O=Study Kit')
}
[xml]$manifest=Get-Content -LiteralPath (Join-Path $appRoot 'AndroidManifest.xml') -Raw
$version=$manifest.DocumentElement.GetAttribute('versionName','http://schemas.android.com/apk/res/android')
$apk=Join-Path $dist $(if($Qa){'StudyKit-Reader-QA.apk'}else{'StudyKit-Reader-'+$version+'.apk'})
Run $java @('-jar',(Join-Path $toolBin 'lib\apksigner.jar'),'sign','--ks',$key,'--ks-key-alias','studykit','--ks-pass',('file:'+$passwordFile),'--v1-signing-enabled','true','--v2-signing-enabled','true','--out',$apk,(Join-Path $build 'aligned.apk'))
Run $java @('-jar',(Join-Path $toolBin 'lib\apksigner.jar'),'verify','--verbose','--print-certs',$apk)
Run (Join-Path $toolBin 'zipalign.exe') @('-c','4',$apk)
Run $aapt @('dump','badging',$apk)
Get-FileHash -LiteralPath $apk -Algorithm SHA256 | Select-Object Hash,Path
