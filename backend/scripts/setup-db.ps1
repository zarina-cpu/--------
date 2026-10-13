# One-time local PostgreSQL setup for «Мой Путь»
$ErrorActionPreference = 'Stop'
$PgData = 'C:\Program Files\PostgreSQL\18\data'
$PgBin = 'C:\Program Files\PostgreSQL\18\bin'
$HbaPath = Join-Path $PgData 'pg_hba.conf'
$TrustMarker = '# MY_WAY_TRUST_BEGIN'
$DbName = 'my_way_db'
$NewPassword = 'MyWayDev_2026!'
$ProjectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$SchemaPath = Join-Path $ProjectRoot 'backend\schema.sql'
$EnvPath = Join-Path $ProjectRoot 'backend\.env'

if (-not (Test-Path $HbaPath)) {
  throw "PostgreSQL pg_hba.conf not found at $HbaPath"
}

$hba = Get-Content $HbaPath -Raw
if ($hba -notmatch $TrustMarker) {
  $trustBlock = @"

$TrustMarker
host    all             postgres        127.0.0.1/32            trust
host    all             postgres        ::1/128                 trust
# MY_WAY_TRUST_END

"@
  $insertAt = $hba.IndexOf('# TYPE  DATABASE')
  if ($insertAt -lt 0) { throw 'Could not find insertion point in pg_hba.conf' }
  $newHba = $hba.Insert($insertAt, $trustBlock)
  Set-Content -Path $HbaPath -Value $newHba -Encoding UTF8
  & (Join-Path $PgBin 'pg_ctl.exe') reload -D $PgData | Out-Null
  Start-Sleep -Seconds 2
}

$env:PGPASSWORD = ''
& (Join-Path $PgBin 'psql.exe') -U postgres -h 127.0.0.1 -d postgres -c "ALTER USER postgres WITH PASSWORD '$NewPassword';"

$dbExists = & (Join-Path $PgBin 'psql.exe') -U postgres -h 127.0.0.1 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
if ($dbExists.Trim() -ne '1') {
  & (Join-Path $PgBin 'createdb.exe') -U postgres -h 127.0.0.1 $DbName
}

& (Join-Path $PgBin 'psql.exe') -U postgres -h 127.0.0.1 -d $DbName -f $SchemaPath

$hbaLines = Get-Content $HbaPath
$filtered = $hbaLines | Where-Object {
  $_ -notmatch 'MY_WAY_TRUST' -and $_ -notmatch '^\s*host\s+all\s+postgres\s+(127\.0\.0\.1/32|::1/128)\s+trust'
}
Set-Content -Path $HbaPath -Value $filtered -Encoding UTF8
& (Join-Path $PgBin 'pg_ctl.exe') reload -D $PgData | Out-Null

$envContent = Get-Content $EnvPath -Raw
$envContent = $envContent -replace 'DB_PASSWORD=.*', "DB_PASSWORD=$NewPassword"
Set-Content -Path $EnvPath -Value $envContent.TrimEnd() -Encoding UTF8

Write-Host "Database $DbName is ready. Password updated in backend/.env"
