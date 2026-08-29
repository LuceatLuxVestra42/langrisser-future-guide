param(
  [string]$WorkDir = ".\.skin-stage3-4-work-v2",
  [string]$RepoRoot = ".",
  [switch]$ReplaceExisting
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$WorkDir = (Resolve-Path -LiteralPath $WorkDir).Path

$Plan = Join-Path $WorkDir "skin-stage3-4-extraction-plan.json"
$Result = Join-Path $WorkDir "skin-stage3-4-extraction-result.json"
$Stage34Validation = Join-Path $WorkDir "skin-stage3-4-validation.json"
$ExtractedRoot = Join-Path $WorkDir "extracted"

$Contract = Join-Path $RepoRoot "data\contracts\skin-stage3-5-static-web-asset-map.v1.json"
$Relation = Join-Path $RepoRoot "data\generated\skin-stage2-3-bidirectional-relation.v1.json"
$Manifest = Join-Path $RepoRoot "data\generated\skin-stage3-5-static-web-asset-map.v1.json"
$Validation = Join-Path $RepoRoot "data\validation\skin-stage3-5-static-web-asset-map.v1.json"

$Required = @($Plan, $Result, $Stage34Validation, $ExtractedRoot, $Contract, $Relation)
foreach ($p in $Required) {
  if (-not (Test-Path -LiteralPath $p)) {
    throw "Required Stage 3-5 input missing: $p"
  }
}

Push-Location $RepoRoot
try {
  Write-Host "[1/3] Stage 3-5 static web asset self-test"
  node .\scripts\validate-skin-stage3-5-static-web-assets-selftest.mjs
  if ($LASTEXITCODE -ne 0) { throw "Stage 3-5 self-test failed with exit code $LASTEXITCODE" }

  Write-Host "[2/3] Materialize 540 exact Stage 3-4 STATIC PNG artifacts"
  $BuilderArgs = @(
    ".\scripts\build-skin-stage3-5-static-web-assets.mjs",
    $Plan,
    $Result,
    $Stage34Validation,
    $ExtractedRoot,
    "--repo-root", $RepoRoot,
    "--relation", $Relation,
    "--write", $Manifest
  )
  if ($ReplaceExisting) { $BuilderArgs += "--replace-existing" }
  node @BuilderArgs
  if ($LASTEXITCODE -ne 0) { throw "Stage 3-5 materialization failed with exit code $LASTEXITCODE" }

  Write-Host "[3/3] Re-hash and validate public Skin PNG surface"
  node .\scripts\validate-skin-stage3-5-static-web-assets.mjs `
    $Manifest `
    --repo-root $RepoRoot `
    --relation $Relation `
    --write $Validation
  if ($LASTEXITCODE -ne 0) { throw "Stage 3-5 final validator failed with exit code $LASTEXITCODE" }

  $V = Get-Content -LiteralPath $Validation -Raw | ConvertFrom-Json
  if ($V.status -ne "PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP" -or $V.finalReady -ne $true) {
    throw "Stage 3-5 did not reach final PASS: $($V.status)"
  }

  Write-Host "PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP"
  $V.counts | Format-List
}
finally {
  Pop-Location
}
