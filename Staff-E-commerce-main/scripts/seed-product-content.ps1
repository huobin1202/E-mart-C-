param(
    [switch]$Apply,
    [string]$ConfigPath = "..\backend\appsettings.json",
    [string]$ManifestPath = "data\product-content.json"
)

$ErrorActionPreference = 'Stop'
$catalogRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$catalogWebRoot = [IO.Path]::GetFullPath((Join-Path $catalogRoot 'backend\wwwroot'))
$catalogManifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot $ManifestPath) -Raw -Encoding UTF8 | ConvertFrom-Json
$catalogConfig = Get-Content -LiteralPath (Join-Path $PSScriptRoot $ConfigPath) -Raw -Encoding UTF8 | ConvertFrom-Json

if (!$catalogManifest -or ($catalogManifest | Group-Object sku | Where-Object Count -gt 1)) {
    throw 'The content manifest is empty or contains duplicate product SKUs.'
}
foreach ($catalogItem in $catalogManifest) {
    if ($catalogItem.sku -notmatch '^\d{13}$' -or [string]::IsNullOrWhiteSpace($catalogItem.description)) {
        throw "Invalid SKU or missing description: $($catalogItem.sku)"
    }
    if ($catalogItem.imageUrl -notmatch ('^/assets/images/products/catalog/' + [regex]::Escape($catalogItem.sku) + '\.(jpg|png|webp|gif)$')) {
        throw "Unexpected asset path: $($catalogItem.sku)"
    }
    $catalogAsset = [IO.Path]::GetFullPath((Join-Path $catalogWebRoot $catalogItem.imageUrl.TrimStart('/')))
    if (!$catalogAsset.StartsWith($catalogWebRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Asset path escaped the application web root.'
    }
    if (!(Test-Path -LiteralPath $catalogAsset) -or
        (Get-Item -LiteralPath $catalogAsset).Length -gt 5MB -or
        (Get-FileHash -LiteralPath $catalogAsset -Algorithm SHA256).Hash -ne $catalogItem.sha256) {
        throw "Missing, oversized or changed image: $($catalogItem.sku)"
    }
}

$catalogConnectionString = $catalogConfig.ConnectionStrings.DefaultConnection
if ([string]::IsNullOrWhiteSpace($catalogConnectionString)) { throw 'No application database connection is configured.' }
$catalogConnection = [System.Data.SqlClient.SqlConnection]::new($catalogConnectionString)
$catalogTransaction = $null
$catalogPlans = [Collections.Generic.List[object]]::new()
try {
    $catalogConnection.Open()
    if ($Apply) { $catalogTransaction = $catalogConnection.BeginTransaction([Data.IsolationLevel]::Serializable) }

    foreach ($catalogItem in $catalogManifest) {
        $catalogCommand = $catalogConnection.CreateCommand()
        try {
            if ($Apply) { $catalogCommand.Transaction = $catalogTransaction }
            $catalogLock = if ($Apply) { 'WITH (UPDLOCK, HOLDLOCK)' } else { '' }
            $catalogCommand.CommandText = "SELECT id, sku, product_name, image_url, description, updated_at FROM dbo.products $catalogLock WHERE sku = @sku;"
            [void]$catalogCommand.Parameters.Add('@sku', [Data.SqlDbType]::NVarChar, 100)
            $catalogCommand.Parameters['@sku'].Value = $catalogItem.sku
            $catalogReader = $catalogCommand.ExecuteReader()
            try {
                if (!$catalogReader.Read()) { throw "Product SKU no longer exists: $($catalogItem.sku)" }
                $catalogOldImage = if ($catalogReader.IsDBNull(3)) { $null } else { $catalogReader.GetString(3) }
                $catalogOldDescription = if ($catalogReader.IsDBNull(4)) { $null } else { $catalogReader.GetString(4) }
                $catalogNeedsImage = [string]::IsNullOrWhiteSpace($catalogOldImage)
                $catalogNeedsDescription = [string]::IsNullOrWhiteSpace($catalogOldDescription)
                if ($catalogNeedsImage -or $catalogNeedsDescription) {
                    $catalogPlans.Add([pscustomobject]@{
                        id = $catalogReader.GetInt32(0)
                        sku = $catalogItem.sku
                        name = $catalogReader.GetString(2)
                        oldImageUrl = $catalogOldImage
                        oldDescription = $catalogOldDescription
                        oldUpdatedAt = if ($catalogReader.IsDBNull(5)) { $null } else { $catalogReader.GetDateTime(5).ToString('o') }
                        newImageUrl = if ($catalogNeedsImage) { $catalogItem.imageUrl } else { $catalogOldImage }
                        newDescription = if ($catalogNeedsDescription) { $catalogItem.description } else { $catalogOldDescription }
                        sourcePage = $catalogItem.sourcePage
                    })
                }
                if ($catalogReader.Read()) { throw "Duplicate database SKU: $($catalogItem.sku)" }
            } finally { $catalogReader.Close() }
        } finally { $catalogCommand.Dispose() }
    }

    Write-Output ("Matched {0} products; {1} need content. Existing nonempty fields are preserved." -f $catalogManifest.Count, $catalogPlans.Count)
    if (!$Apply) {
        $catalogPlans | Select-Object id, sku, name
        Write-Output 'Preview only. Pass -Apply to back up and update missing content.'
        return
    }
    if ($catalogPlans.Count -gt 0) {
        $catalogBackupFolder = Join-Path $catalogRoot '.tmp\product-content-backups'
        [void](New-Item -ItemType Directory -Force -Path $catalogBackupFolder)
        $catalogBackupPath = Join-Path $catalogBackupFolder ('before-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fffffff') + '.json')
        $catalogPlans.ToArray() | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $catalogBackupPath -Encoding UTF8
        Write-Output "Backup: $catalogBackupPath"
    }
    foreach ($catalogPlan in $catalogPlans) {
        $catalogCommand = $catalogConnection.CreateCommand()
        try {
            $catalogCommand.Transaction = $catalogTransaction
            $catalogCommand.CommandText = @'
UPDATE dbo.products
SET image_url = @image, description = @description, updated_at = SYSUTCDATETIME()
WHERE id = @id AND sku = @sku;
IF @@ROWCOUNT <> 1 THROW 51000, 'Product content update did not match one row.', 1;
INSERT INTO dbo.activity_logs (user_id, action, entity_type, entity_id, payload, ip_address, created_at)
VALUES (NULL, 'UPDATE_Products', 'Products', CONVERT(varchar(100), @id), @audit, 'system', SYSUTCDATETIME());
'@
            foreach ($catalogParameter in @(
                @('@id', [Data.SqlDbType]::Int, 0, $catalogPlan.id),
                @('@sku', [Data.SqlDbType]::NVarChar, 100, $catalogPlan.sku),
                @('@image', [Data.SqlDbType]::NVarChar, 1024, $catalogPlan.newImageUrl),
                @('@description', [Data.SqlDbType]::NVarChar, -1, $catalogPlan.newDescription),
                @('@audit', [Data.SqlDbType]::NVarChar, -1, (@{
                    method = 'DATA_ENRICHMENT'; endpoint = 'ProductContent.Seed'; statusCode = 200; succeeded = $true
                    body = (@{ sku = $catalogPlan.sku; imageUrl = $catalogPlan.newImageUrl; description = $catalogPlan.newDescription; source = $catalogPlan.sourcePage } | ConvertTo-Json -Compress)
                } | ConvertTo-Json -Compress))
            )) {
                $catalogSqlParameter = $catalogCommand.Parameters.Add($catalogParameter[0], $catalogParameter[1])
                if ($catalogParameter[2] -ne 0) { $catalogSqlParameter.Size = $catalogParameter[2] }
                $catalogSqlParameter.Value = if ($null -eq $catalogParameter[3]) { [DBNull]::Value } else { $catalogParameter[3] }
            }
            [void]$catalogCommand.ExecuteNonQuery()
        } finally { $catalogCommand.Dispose() }
    }
    $catalogTransaction.Commit()
    Write-Output ("Applied content to {0} products and recorded their updates in the activity log." -f $catalogPlans.Count)
} catch {
    if ($catalogTransaction) { try { $catalogTransaction.Rollback() } catch { } }
    throw
} finally {
    if ($catalogTransaction) { $catalogTransaction.Dispose() }
    $catalogConnection.Dispose()
}
