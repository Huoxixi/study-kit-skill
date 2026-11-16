param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
$chain = Join-Path $appRoot '.toolchain'
$downloads = Join-Path $chain 'downloads'
$jobs = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'build-packages.json') -Raw | ConvertFrom-Json
if (-not $VerifyOnly) { New-Item -ItemType Directory -Path $downloads -Force | Out-Null }
foreach ($item in $jobs) {
    $target = Join-Path $downloads $item.file
    if (-not (Test-Path -LiteralPath $target)) {
        if ($VerifyOnly) { throw "Missing archive: $($item.file)" }
        & curl.exe --fail --location --retry 3 --silent --show-error --output $target $item.url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($item.name)" }
    }
    if ((Get-Item -LiteralPath $target).Length -ne $item.size) { throw "Archive size mismatch: $($item.name)" }
    if ((Get-FileHash -LiteralPath $target -Algorithm $item.algorithm).Hash.ToLowerInvariant() -ne $item.hash) { throw "Checksum mismatch: $($item.name)" }
    "Verified $($item.name)"
    if ($VerifyOnly) { continue }
    $destination = Join-Path $chain $item.directory
    if (-not (Test-Path -LiteralPath $destination)) {
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        & tar.exe -xf (Join-Path $downloads $item.file) -C $destination
        if ($LASTEXITCODE -ne 0) { throw "Extraction failed: $($item.name)" }
    }
}
