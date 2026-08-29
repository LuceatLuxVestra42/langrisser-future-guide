param(
  [Parameter(Mandatory = $true)]
  [string]$ExportAssetBundleDir,

  [Parameter(Mandatory = $true)]
  [string]$CatalogFile,

  [string]$WorkDir = ".skin-stage3-4-work",
  [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"
$ExpectedCatalogSha256 = "424b64fefe0adfb6797e13053e3049e257838185c51e215eae22d8ee2d9c7188"
$ExpectedCatalogLineCount = 3047

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
  }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BundleRoot = (Resolve-Path $ExportAssetBundleDir).Path
$CatalogPath = (Resolve-Path $CatalogFile).Path
$ResolvedWorkDir = if ([System.IO.Path]::IsPathRooted($WorkDir)) {
  [System.IO.Path]::GetFullPath($WorkDir)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $WorkDir))
}

if (-not (Test-Path $BundleRoot -PathType Container)) {
  throw "ExportAssetBundle directory not found: $BundleRoot"
}
if (-not (Test-Path $CatalogPath -PathType Leaf)) {
  throw "Frozen bundle catalog not found: $CatalogPath"
}

$CatalogHash = (Get-FileHash -Algorithm SHA256 $CatalogPath).Hash.ToLowerInvariant()
if ($CatalogHash -ne $ExpectedCatalogSha256) {
  throw "Frozen catalog SHA-256 mismatch. Expected $ExpectedCatalogSha256, got $CatalogHash. Do not regenerate or reorder the catalog silently."
}
$CatalogLines = @(Get-Content -LiteralPath $CatalogPath | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
$UniqueCatalogLines = @($CatalogLines | Sort-Object -Unique)
if ($CatalogLines.Count -ne $ExpectedCatalogLineCount -or $UniqueCatalogLines.Count -ne $ExpectedCatalogLineCount) {
  throw "Frozen catalog count mismatch. Expected $ExpectedCatalogLineCount unique non-empty lines; got total=$($CatalogLines.Count), unique=$($UniqueCatalogLines.Count)."
}

New-Item -ItemType Directory -Force -Path $ResolvedWorkDir | Out-Null
$ExtractedDir = Join-Path $ResolvedWorkDir "extracted"
New-Item -ItemType Directory -Force -Path $ExtractedDir | Out-Null

$ScanJson = Join-Path $ResolvedWorkDir "skin-stage3-3-2-full-scan.json"
$QaJson = Join-Path $ResolvedWorkDir "skin-stage3-3-3-final-qa.json"
$PlanJson = Join-Path $ResolvedWorkDir "skin-stage3-4-extraction-plan.json"
$ResultJson = Join-Path $ResolvedWorkDir "skin-stage3-4-extraction-result.json"
$ValidationJson = Join-Path $ResolvedWorkDir "skin-stage3-4-validation.json"

Push-Location $RepoRoot
try {
  Write-Host "[1/7] Checking UnityPy runtime..."
  Invoke-Checked $PythonExe "-c" "import UnityPy; print('UnityPy', getattr(UnityPy, '__version__', 'unknown'))"

  Write-Host "[2/7] Scanning all catalog-confirmed Skin candidate bundles..."
  Invoke-Checked "node" "scripts/skin-stage3-3-bulk-scan.mjs" $BundleRoot $ScanJson "--catalog" $CatalogPath

  Write-Host "[3/7] Running Stage 3-3-3 final resolution QA..."
  Invoke-Checked "node" "scripts/validate-skin-stage3-3-3-resolution-qa.mjs" $ScanJson "--write" $QaJson

  Write-Host "[4/7] Building frozen 1,869-request Stage 3-4 extraction plan..."
  Invoke-Checked "node" "scripts/skin-stage3-4-build-extraction-plan.mjs" $QaJson $ScanJson $PlanJson

  Write-Host "[5/7] Extracting exact Unity serialized objects with UnityPy..."
  Invoke-Checked $PythonExe "scripts/skin-stage3-4-extract-unitypy.py" $PlanJson $BundleRoot $ExtractedDir $ResultJson

  Write-Host "[6/7] Re-hashing and validating every extracted artifact..."
  Invoke-Checked "node" "scripts/validate-skin-stage3-4-extraction-result.mjs" $PlanJson $ResultJson "--root" $ExtractedDir "--write" $ValidationJson

  Write-Host "[7/7] Confirming final Stage 3-4 closeout state..."
  $Validation = Get-Content -LiteralPath $ValidationJson -Raw | ConvertFrom-Json
  if ($Validation.status -ne "PASS_SKIN_STAGE3_4_SELECTIVE_EXTRACTION" -or $Validation.finalReady -ne $true) {
    throw "Stage 3-4 did not reach final PASS. status=$($Validation.status), finalReady=$($Validation.finalReady)"
  }
  if ($Validation.counts.acceptedRequestCount -ne 1869 -or
      $Validation.counts.acceptedStaticCount -ne 540 -or
      $Validation.counts.acceptedCharSpineCount -ne 540 -or
      $Validation.counts.acceptedModelPrimaryCount -ne 789 -or
      $Validation.counts.blockerCount -ne 0) {
    throw "Stage 3-4 final counts changed: $($Validation.counts | ConvertTo-Json -Compress)"
  }

  Write-Host "PASS_SKIN_STAGE3_4_SELECTIVE_EXTRACTION"
  Write-Host "WorkDir: $ResolvedWorkDir"
  Write-Host "Validation: $ValidationJson"
}
finally {
  Pop-Location
}
