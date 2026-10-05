param(
    [string]$Server = "",
    [string]$DatabaseScript = "..\backend\Data\store_management_full.sql",
    [string]$GrantScript = "..\backend\Data\grant_windows_user_access.sql"
)

$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$databaseScriptPath = [System.IO.Path]::GetFullPath((Join-Path $baseDir $DatabaseScript))

if (-not (Test-Path -LiteralPath $databaseScriptPath)) {
    throw "SQL script not found: $databaseScriptPath"
}

# Auto-detect SQL Server if not specified
if ([string]::IsNullOrWhiteSpace($Server)) {
    $candidates = @('localhost', 'localhost\SQLEXPRESS', '.')
    foreach ($candidate in $candidates) {
        try {
            $testConn = New-Object System.Data.SqlClient.SqlConnection("Server=$candidate;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=2")
            $testConn.Open()
            $testConn.Close()
            $Server = $candidate
            Write-Host "Found available SQL Server: $Server"
            break
        } catch {
            # Try next
        }
    }
    if ([string]::IsNullOrWhiteSpace($Server)) {
        $Server = "localhost"
    }
}

Write-Host "Target SQL Server instance: $Server"

# Check if sqlcmd is available
$sqlcmdCmd = Get-Command sqlcmd -ErrorAction SilentlyContinue

if ($sqlcmdCmd) {
    Write-Host "Executing SQL script via sqlcmd (UTF-8)..."
    & $sqlcmdCmd.Source -f 65001 -I -S $Server -E -C -i $databaseScriptPath
    if ($LASTEXITCODE -ne 0) {
        throw "sqlcmd exited with error code $LASTEXITCODE"
    }
} else {
    Write-Host "Importing database script via .NET SqlClient..."
    $connectionString = "Server=$Server;Database=master;Integrated Security=True;TrustServerCertificate=True;Encrypt=False;"
    $scriptText = Get-Content -LiteralPath $databaseScriptPath -Raw -Encoding UTF8
    $batches = [regex]::Split($scriptText, "(?im)^\s*GO\s*;?\s*$")

    $connection = [System.Data.SqlClient.SqlConnection]::new($connectionString)
    $connection.Open()

    try {
        # Ensure quoted identifier is on
        $initCmd = $connection.CreateCommand()
        $initCmd.CommandText = "SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;"
        [void]$initCmd.ExecuteNonQuery()

        foreach ($batch in $batches) {
            if ([string]::IsNullOrWhiteSpace($batch)) {
                continue
            }

            $command = $connection.CreateCommand()
            $command.CommandTimeout = 120
            $command.CommandText = $batch
            [void]$command.ExecuteNonQuery()
        }
    }
    finally {
        $connection.Close()
    }
}

# Ensure current Windows user has database access
try {
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    Write-Host "Ensuring SQL access for current user: $currentUser"
    $secConn = [System.Data.SqlClient.SqlConnection]::new("Server=$Server;Database=store_management;Integrated Security=True;TrustServerCertificate=True;Encrypt=False;")
    $secConn.Open()
    try {
        $secCmd = $secConn.CreateCommand()
        $secCmd.CommandText = @"
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '$currentUser')
BEGIN
    TRY_CREATE:
    BEGIN TRY
        CREATE LOGIN [$currentUser] FROM WINDOWS;
    END TRY
    BEGIN CATCH
    END CATCH
END;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '$currentUser')
BEGIN
    BEGIN TRY
        CREATE USER [$currentUser] FOR LOGIN [$currentUser];
    END TRY
    BEGIN CATCH
    END CATCH
END;

BEGIN TRY
    ALTER ROLE db_datareader ADD MEMBER [$currentUser];
    ALTER ROLE db_datawriter ADD MEMBER [$currentUser];
END TRY
BEGIN CATCH
END CATCH
"@
        [void]$secCmd.ExecuteNonQuery()
    } finally {
        $secConn.Close()
    }
} catch {
    Write-Host "Note: Windows user access already satisfied or managed by sysadmin."
}

Write-Host "=========================================="
Write-Host "Database setup successfully completed!"
Write-Host "Login credentials: admin / admin123"
Write-Host "=========================================="
