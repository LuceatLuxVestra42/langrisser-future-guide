param(
  [Parameter(Mandatory = $true)]
  [string]$ExportAssetBundleDir,

  [string]$ScanFile = "data/evidence/skin-stage3-3-full-current-directory-scan.v1.json",

  [string]$WorkDir = ".skin-stage3-4-work-v2",

  [string]$PythonExe = "python",

  [switch]$SkipRuntimeSelfTest
)

$ErrorActionPreference = "Stop"

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

function Resolve-RepoAwarePath {
  param([Parameter(Mandatory = $true)][string]$InputPath)
  $candidate = if ([System.IO.Path]::IsPathRooted($InputPath)) {
    $InputPath
  } else {
    Join-Path $RepoRoot $InputPath
  }
  return (Resolve-Path $candidate).Path
}

$BundleRoot = (Resolve-Path $ExportAssetBundleDir).Path
$ScanPath = Resolve-RepoAwarePath $ScanFile
$ResolvedWorkDir = if ([System.IO.Path]::IsPathRooted($WorkDir)) {
  [System.IO.Path]::GetFullPath($WorkDir)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $WorkDir))
}

if (-not (Test-Path $BundleRoot -PathType Container)) {
  throw "ExportAssetBundle directory not found: $BundleRoot"
}
if (-not (Test-Path $ScanPath -PathType Leaf)) {
  throw "Stage 3-3-2 full scan not found: $ScanPath"
}

New-Item -ItemType Directory -Force -Path $ResolvedWorkDir | Out-Null
$ExtractedDir = Join-Path $ResolvedWorkDir "extracted"
New-Item -ItemType Directory -Force -Path $ExtractedDir | Out-Null

$QaJson = Join-Path $ResolvedWorkDir "skin-stage3-3-3-final-qa-v2.json"
$PlanJson = Join-Path $ResolvedWorkDir "skin-stage3-4-extraction-plan.json"
$ResultJson = Join-Path $ResolvedWorkDir "skin-stage3-4-extraction-result.json"
$ValidationJson = Join-Path $ResolvedWorkDir "skin-stage3-4-validation.json"

Push-Location $RepoRoot
try {
  Write-Host "[1/7] Checking Stage 3-3-3 QA v2 contract/self-test..."
  Invoke-Checked "node" "scripts/validate-skin-stage3-3-3-resolution-qa-v2-selftest.mjs"

  Write-Host "[2/7] Revalidating the existing full Stage 3-3-2 scan against the retained frozen 536-candidate surface..."
  Invoke-Checked "node" "scripts/validate-skin-stage3-3-3-resolution-qa-v2.mjs" $ScanPath "--write" $QaJson

  $Qa = Get-Content -LiteralPath $QaJson -Raw | ConvertFrom-Json
  if ($Qa.status -ne "PASS_SKIN_STAGE3_3_3_RESOLUTION_QA_FREEZE_READY" -or $Qa.finalFreezeReady -ne $true) {
    throw "Stage 3-3-3 QA v2 did not reach final freeze. status=$($Qa.status), finalFreezeReady=$($Qa.finalFreezeReady)"
  }
  if ($Qa.candidateSurfaceAdmission.mode -notin @("RETAINED_CANDIDATE_SURFACE_EXACT", "FROZEN_CATALOG_EXACT")) {
    throw "Unexpected candidate-surface admission mode: $($Qa.candidateSurfaceAdmission.mode)"
  }
  if ($Qa.counts.acceptedRequiredTargetCount -ne 1869 -or
      $Qa.counts.pendingRequiredTargetCount -ne 0 -or
      $Qa.counts.failedRequiredTargetCount -ne 0 -or
      $Qa.counts.reviewRequiredTargetCount -ne 0 -or
      $Qa.counts.accountedCandidateBundleCount -ne 536 -or
      $Qa.counts.unscannedCandidateBundleCount -ne 0 -or
      $Qa.counts.bundleScanErrorCount -ne 0 -or
      $Qa.counts.acceptedStaticCount -ne 540 -or
      $Qa.counts.acceptedCharSpineCount -ne 540 -or
      $Qa.counts.acceptedModelPrimaryCount -ne 789) {
    throw "Stage 3-3-3 QA v2 final counts changed: $($Qa.counts | ConvertTo-Json -Compress)"
  }

  Write-Host "[3/7] Checking UnityPy runtime..."
  Invoke-Checked $PythonExe "-c" "import UnityPy; print('UnityPy', getattr(UnityPy, '__version__', 'unknown'))"

  Write-Host "[4/7] Checking the admitted UnityPy runner..."
  if ($SkipRuntimeSelfTest) {
    Write-Host "Runtime self-test skipped by request."
  } else {
    Invoke-Checked $PythonExe "scripts/validate-skin-stage3-4-unitypy-runner-selftest.py"
  }

  Write-Host "[5/7] Building the frozen 1,869-request Stage 3-4 extraction plan..."
  Invoke-Checked "node" "scripts/skin-stage3-4-build-extraction-plan.mjs" $QaJson $ScanPath $PlanJson

  Write-Host "[6/7] Extracting exact Unity serialized objects from the physical bundle bytes..."
  Invoke-Checked $PythonExe "scripts/skin-stage3-4-extract-unitypy.py" $PlanJson $BundleRoot $ExtractedDir $ResultJson

  Write-Host "[7/7] Re-hashing and validating every extracted artifact..."
  Invoke-Checked "node" "scripts/validate-skin-stage3-4-extraction-result.mjs" $PlanJson $ResultJson "--root" $ExtractedDir "--write" $ValidationJson

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
  Write-Host "Candidate admission: $($Qa.candidateSurfaceAdmission.mode)"
  Write-Host "WorkDir: $ResolvedWorkDir"
  Write-Host "Validation: $ValidationJson"
}
finally {
  Pop-Location
}
