param(
  [string]$LocalThemePath = "D:\IT MART24\System_Programs\shopify_theme",
  [string]$EnvFile = "D:\IT MART24\System_Programs\itmart24_admin\backend\.env",
  [string]$ThemeId,
  [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"

$themeRoots = @(
  "assets",
  "blocks",
  "config",
  "layout",
  "locales",
  "sections",
  "snippets",
  "templates"
)

$binaryExtensions = @(
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".woff", ".woff2",
  ".eot", ".ttf", ".otf", ".mp3", ".mp4", ".mov", ".webm", ".pdf", ".zip", ".avif"
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-EnvMap {
  param([string]$Path)

  $map = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -match '^(?<k>[A-Z0-9_]+)=(?<v>.*)$') {
      $map[$matches.k] = $matches.v
    }
  }

  return $map
}

function Invoke-ShopifyApi {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body
  )

  $attempt = 0

  while ($true) {
    $params = @{
      Method  = $Method
      Uri     = $Uri
      Headers = $Headers
    }

    if ($null -ne $Body) {
      $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
      $params.ContentType = "application/json"
    }

    try {
      return Invoke-RestMethod @params
    } catch {
      $response = $_.Exception.Response
      $statusCode = $null
      $retryAfterSeconds = $null

      if ($response) {
        $statusCode = [int]$response.StatusCode
        $retryAfterHeader = $response.Headers["Retry-After"]
        if ($retryAfterHeader) {
          [void][int]::TryParse([string]$retryAfterHeader, [ref]$retryAfterSeconds)
        }
      }

      if ($statusCode -ne 429 -or $attempt -ge 6) {
        throw
      }

      $attempt += 1
      if (-not $retryAfterSeconds -or $retryAfterSeconds -lt 1) {
        $retryAfterSeconds = [Math]::Min(30, [Math]::Pow(2, $attempt))
      }

      Start-Sleep -Seconds $retryAfterSeconds
    }
  }
}

function Get-ThemeAsset {
  param(
    [string]$StoreDomain,
    [string]$ApiVersion,
    [string]$ResolvedThemeId,
    [string]$Key,
    [hashtable]$Headers
  )

  $encodedKey = [System.Uri]::EscapeDataString($Key)
  $uri = "https://$StoreDomain/admin/api/$ApiVersion/themes/$ResolvedThemeId/assets.json?asset[key]=$encodedKey"
  return (Invoke-ShopifyApi -Method "Get" -Uri $uri -Headers $Headers -Body $null).asset
}

function Set-FileTimestamp {
  param(
    [string]$Path,
    [datetimeoffset]$Timestamp
  )

  [System.IO.File]::SetLastWriteTimeUtc($Path, $Timestamp.UtcDateTime)
}

function Write-RemoteAssetToLocal {
  param(
    [string]$DestinationPath,
    [object]$Asset
  )

  $destinationDir = Split-Path -Parent $DestinationPath
  if (-not (Test-Path -LiteralPath $destinationDir)) {
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
  }

  if ($Asset.PSObject.Properties.Name -contains "attachment" -and $Asset.attachment) {
    $bytes = [Convert]::FromBase64String($Asset.attachment)
    [System.IO.File]::WriteAllBytes($DestinationPath, $bytes)
  } else {
    [System.IO.File]::WriteAllText($DestinationPath, [string]$Asset.value, $utf8NoBom)
  }

  if ($Asset.updated_at) {
    Set-FileTimestamp -Path $DestinationPath -Timestamp ([datetimeoffset]$Asset.updated_at)
  }
}

function Get-LocalFilePayload {
  param([string]$Path)

  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($binaryExtensions -contains $extension) {
    return [pscustomobject]@{
      IsBinary = $true
      Bytes    = [System.IO.File]::ReadAllBytes($Path)
      Text     = $null
    }
  }

  return [pscustomobject]@{
    IsBinary = $false
    Bytes    = $null
    Text     = [System.IO.File]::ReadAllText($Path)
  }
}

function Test-LocalMatchesRemoteAsset {
  param(
    [string]$LocalPath,
    [object]$RemoteAsset
  )

  $localPayload = Get-LocalFilePayload -Path $LocalPath

  if ($RemoteAsset.PSObject.Properties.Name -contains "attachment" -and $RemoteAsset.attachment) {
    if (-not $localPayload.IsBinary) {
      return $false
    }

    $remoteBytes = [Convert]::FromBase64String($RemoteAsset.attachment)
    return [System.Linq.Enumerable]::SequenceEqual($localPayload.Bytes, $remoteBytes)
  }

  if ($localPayload.IsBinary) {
    return $false
  }

  return $localPayload.Text -eq [string]$RemoteAsset.value
}

function Push-LocalAssetToRemote {
  param(
    [string]$SourcePath,
    [string]$Key,
    [string]$StoreDomain,
    [string]$ApiVersion,
    [string]$ResolvedThemeId,
    [hashtable]$Headers
  )

  $extension = [System.IO.Path]::GetExtension($SourcePath).ToLowerInvariant()
  $assetPayload = @{ key = $Key }

  if ($binaryExtensions -contains $extension) {
    $bytes = [System.IO.File]::ReadAllBytes($SourcePath)
    $assetPayload.attachment = [Convert]::ToBase64String($bytes)
  } else {
    $assetPayload.value = [System.IO.File]::ReadAllText($SourcePath)
  }

  $uri = "https://$StoreDomain/admin/api/$ApiVersion/themes/$ResolvedThemeId/assets.json"
  $response = Invoke-ShopifyApi -Method "Put" -Uri $uri -Headers $Headers -Body @{ asset = $assetPayload }

  if ($response.asset.updated_at) {
    Set-FileTimestamp -Path $SourcePath -Timestamp ([datetimeoffset]$response.asset.updated_at)
  }
}

function Get-LocalThemeFiles {
  param([string]$RootPath)

  $items = @{}

  foreach ($themeRoot in $themeRoots) {
    $fullRoot = Join-Path $RootPath $themeRoot
    if (-not (Test-Path -LiteralPath $fullRoot)) {
      continue
    }

    Get-ChildItem -LiteralPath $fullRoot -File -Recurse | ForEach-Object {
      $relativePath = $_.FullName.Substring($RootPath.Length).TrimStart('\') -replace '\\', '/'
      $items[$relativePath] = [pscustomobject]@{
        Key          = $relativePath
        FullName     = $_.FullName
        LastWriteUtc = $_.LastWriteTimeUtc
      }
    }
  }

  return $items
}

$envMap = Get-EnvMap -Path $EnvFile
$headers = @{ "X-Shopify-Access-Token" = $envMap["SHOPIFY_ADMIN_API_TOKEN"] }
$storeDomain = $envMap["SHOPIFY_STORE_DOMAIN"]
$apiVersion = $envMap["SHOPIFY_API_VERSION"]

if (-not $ThemeId) {
  $themesUri = "https://$storeDomain/admin/api/$apiVersion/themes.json"
  $themes = (Invoke-ShopifyApi -Method "Get" -Uri $themesUri -Headers $headers -Body $null).themes
  $ThemeId = [string](($themes | Where-Object { $_.role -eq "main" } | Select-Object -First 1).id)
}

if (-not $ThemeId) {
  throw "Could not determine the live Shopify theme ID."
}

$assetsUri = "https://$storeDomain/admin/api/$apiVersion/themes/$ThemeId/assets.json?fields=key,updated_at,content_type"
$remoteAssets = (Invoke-ShopifyApi -Method "Get" -Uri $assetsUri -Headers $headers -Body $null).assets
$remoteMap = @{}
foreach ($asset in $remoteAssets) {
  $remoteMap[$asset.key] = [pscustomobject]@{
    Key          = $asset.key
    UpdatedAtRaw = $asset.updated_at
    UpdatedAtUtc = ([datetimeoffset]$asset.updated_at).UtcDateTime
    ContentType  = $asset.content_type
  }
}

$localMap = Get-LocalThemeFiles -RootPath $LocalThemePath
$allKeys = @($localMap.Keys + $remoteMap.Keys | Sort-Object -Unique)

$plan = foreach ($key in $allKeys) {
  $local = $localMap[$key]
  $remote = $remoteMap[$key]

  if ($null -eq $local -and $null -ne $remote) {
    [pscustomobject]@{
      Key           = $key
      Action        = "pull"
      Reason        = "missing_local"
      LocalTimeUtc  = $null
      RemoteTimeUtc = $remote.UpdatedAtUtc
    }
    continue
  }

  if ($null -ne $local -and $null -eq $remote) {
    [pscustomobject]@{
      Key           = $key
      Action        = "push"
      Reason        = "missing_remote"
      LocalTimeUtc  = $local.LastWriteUtc
      RemoteTimeUtc = $null
    }
    continue
  }

  if ($local.LastWriteUtc -gt $remote.UpdatedAtUtc.AddSeconds(1)) {
    [pscustomobject]@{
      Key           = $key
      Action        = "push"
      Reason        = "local_newer"
      LocalTimeUtc  = $local.LastWriteUtc
      RemoteTimeUtc = $remote.UpdatedAtUtc
    }
    continue
  }

  if ($remote.UpdatedAtUtc -gt $local.LastWriteUtc.AddSeconds(1)) {
    [pscustomobject]@{
      Key           = $key
      Action        = "pull"
      Reason        = "remote_newer"
      LocalTimeUtc  = $local.LastWriteUtc
      RemoteTimeUtc = $remote.UpdatedAtUtc
    }
    continue
  }

  [pscustomobject]@{
    Key           = $key
    Action        = "skip"
    Reason        = "same_timestamp"
    LocalTimeUtc  = $local.LastWriteUtc
    RemoteTimeUtc = $remote.UpdatedAtUtc
  }
}

foreach ($item in $plan | Where-Object Action -ne "skip") {
  if (-not ($localMap.ContainsKey($item.Key) -and $remoteMap.ContainsKey($item.Key))) {
    continue
  }

  $remoteAsset = Get-ThemeAsset -StoreDomain $storeDomain -ApiVersion $apiVersion -ResolvedThemeId $ThemeId -Key $item.Key -Headers $headers
  if (Test-LocalMatchesRemoteAsset -LocalPath $localMap[$item.Key].FullName -RemoteAsset $remoteAsset) {
    $item.Action = "skip"
    $item.Reason = "same_content"
  }
}

$summary = [pscustomobject]@{
  ThemeId = $ThemeId
  Total   = $plan.Count
  Pull    = @($plan | Where-Object Action -eq "pull").Count
  Push    = @($plan | Where-Object Action -eq "push").Count
  Skip    = @($plan | Where-Object Action -eq "skip").Count
}

if ($PlanOnly) {
  [pscustomobject]@{
    Summary = $summary
    Changes = @($plan | Where-Object Action -ne "skip")
  } | ConvertTo-Json -Depth 6
  exit 0
}

$results = New-Object System.Collections.Generic.List[object]

foreach ($item in $plan | Where-Object Action -ne "skip") {
  $destinationPath = Join-Path $LocalThemePath ($item.Key -replace '/', '\')

  if ($item.Action -eq "pull") {
    $asset = Get-ThemeAsset -StoreDomain $storeDomain -ApiVersion $apiVersion -ResolvedThemeId $ThemeId -Key $item.Key -Headers $headers
    Write-RemoteAssetToLocal -DestinationPath $destinationPath -Asset $asset
  } elseif ($item.Action -eq "push") {
    Push-LocalAssetToRemote -SourcePath $destinationPath -Key $item.Key -StoreDomain $storeDomain -ApiVersion $apiVersion -ResolvedThemeId $ThemeId -Headers $headers
  }

  $results.Add($item) | Out-Null
}

[pscustomobject]@{
  Summary = $summary
  Applied = $results
} | ConvertTo-Json -Depth 6
