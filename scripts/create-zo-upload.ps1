param(
  [string]$OutputPath = "dist\failsafe-qore-zo-bundle.tgz"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$output = Join-Path $root $OutputPath
$bundleDir = Join-Path $root "dist\zo-bundle"

if (Test-Path $bundleDir) { Remove-Item -Recurse -Force $bundleDir }
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

$items = @(
  "deploy",
  "docs",
  "ledger",
  "policy",
  "risk",
  "runtime",
  "scripts",
  "tests",
  "zo",
  ".failsafe",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.cjs",
  "vitest.config.ts",
  "README.md",
  "LICENSE"
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  if (Test-Path $source) {
    Copy-Item -Path $source -Destination $bundleDir -Recurse -Force
  }
}

$parent = Split-Path -Parent $output
if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
if (Test-Path $output) { Remove-Item -Force $output }

Push-Location $bundleDir
try {
  tar -czf $output .
} finally {
  Pop-Location
}

Write-Host "Created Zo bundle: $output"
