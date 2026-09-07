param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [string]$EvidenceDirectory
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-StrictMode -Version Latest

function Wait-ForCondition {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Condition,
    [Parameter(Mandatory = $true)][string]$Description,
    [int]$TimeoutSeconds = 30
  )

  $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTimeOffset]::UtcNow -lt $deadline)
  throw "Timed out waiting for $Description."
}

function Get-PlannerUninstallEntries {
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  return @(
    foreach ($root in $roots) {
      Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
        Where-Object {
          $_.PSObject.Properties.Name -contains 'DisplayName' -and
          [string]$_.DisplayName -eq 'Planner Buckets'
        }
    }
  )
}

function Get-PlannerUninstallEntry {
  $entries = @(Get-PlannerUninstallEntries)
  if ($entries.Count -ne 1) {
    throw "Expected exactly one Planner Buckets uninstall registration; found $($entries.Count)."
  }
  return $entries[0]
}

function Get-UninstallCommand {
  param([Parameter(Mandatory = $true)]$Entry)
  $property = $Entry.PSObject.Properties['UninstallString']
  if (-not $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) {
    throw 'Planner Buckets uninstall registration does not contain UninstallString.'
  }
  return [string]$property.Value
}

function Resolve-CommandExecutable {
  param([Parameter(Mandatory = $true)][string]$Command)
  $trimmed = $Command.Trim()
  if ($trimmed -match '^\s*"([^"]+\.exe)"') { return $Matches[1] }
  if ($trimmed -match '^\s*([^\s]+\.exe)') { return $Matches[1] }
  throw "Could not resolve executable from command '$Command'."
}

function Get-PlannerShortcutPaths {
  $roots = @(
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
    (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
  )
  return @(
    foreach ($root in $roots) {
      if (Test-Path -LiteralPath $root) {
        Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue |
          Where-Object { $_.BaseName -like '*Planner Buckets*' }
      }
    }
  )
}

function Resolve-PlannerExecutable {
  param([Parameter(Mandatory = $true)]$Entry)

  $displayIconProperty = $Entry.PSObject.Properties['DisplayIcon']
  if ($displayIconProperty -and -not [string]::IsNullOrWhiteSpace([string]$displayIconProperty.Value)) {
    $displayIcon = [string]$displayIconProperty.Value
    if ($displayIcon -match '^\s*"([^"]+\.exe)"' -and (Test-Path -LiteralPath $Matches[1])) {
      return $Matches[1]
    }
    $iconCandidate = ($displayIcon -replace ',\d+$', '').Trim('"')
    if (Test-Path -LiteralPath $iconCandidate) { return $iconCandidate }
  }

  $uninstaller = Resolve-CommandExecutable (Get-UninstallCommand $Entry)
  $installRoot = Split-Path -Parent $uninstaller
  $candidates = @(
    Get-ChildItem -LiteralPath $installRoot -File -Filter '*.exe' -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -ne $uninstaller -and $_.Name -notmatch '(?i)uninstall|setup' }
  )
  if ($candidates.Count -ne 1) {
    throw "Expected one installed application executable beside the uninstaller; found $($candidates.Count)."
  }
  return $candidates[0].FullName
}

function Invoke-NsisSilent {
  param([Parameter(Mandatory = $true)][string]$Executable)
  $process = Start-Process -FilePath $Executable -ArgumentList @('/S') -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "NSIS process '$Executable' exited with code $($process.ExitCode)."
  }
}

function Stop-PlannerProcess {
  param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)
  if ($Process.HasExited) { return 'exited-before-close' }

  $closed = $false
  try { $closed = $Process.CloseMainWindow() } catch { $closed = $false }
  if ($closed) {
    try {
      if ($Process.WaitForExit(10000)) { return 'close-main-window' }
    } catch { }
  }

  Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  try { $Process.WaitForExit(5000) | Out-Null } catch { }
  return 'forced-after-lifecycle-observation'
}

function Read-PlannerJson {
  param([Parameter(Mandatory = $true)][string]$Path)
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Write-Utf8Json {
  param(
    [Parameter(Mandatory = $true)]$Value,
    [Parameter(Mandatory = $true)][string]$Path
  )
  $json = $Value | ConvertTo-Json -Depth 30
  [System.IO.File]::WriteAllText($Path, "$json`n", [System.Text.UTF8Encoding]::new($false))
}

$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$evidenceRoot = (Resolve-Path -LiteralPath $EvidenceDirectory).Path
$installerHash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$dataRoot = Join-Path $env:LOCALAPPDATA 'com.nobodyworld.plannerbuckets'
$primary = Join-Path $dataRoot 'data\planner-v2.json'
$migrationMarker = Join-Path $dataRoot 'migration-v1.complete'
$backupRoot = Join-Path $dataRoot 'backups'
$backupSentinel = Join-Path $backupRoot ("routine-{0}.json" -f ([DateTimeOffset]::UtcNow.ToString('yyyy-MM-dd')))
$webViewRoot = Join-Path $dataRoot 'EBWebView'
$externalBackup = Join-Path $evidenceRoot 'external-all-data.json'
$unrelatedSentinel = Join-Path $env:RUNNER_TEMP 'planner-lifecycle-unrelated-sentinel.txt'
[System.IO.File]::WriteAllText($unrelatedSentinel, 'unrelated runner sentinel', [System.Text.UTF8Encoding]::new($false))
$unrelatedHash = (Get-FileHash -LiteralPath $unrelatedSentinel -Algorithm SHA256).Hash

if (Test-Path -LiteralPath $dataRoot) {
  throw 'Expected a fresh ephemeral Windows profile, but Planner Buckets application data already exists.'
}
if (@(Get-PlannerUninstallEntries).Count -ne 0) {
  throw 'Planner Buckets was already registered before lifecycle testing.'
}

$result = [ordered]@{
  schemaVersion = 1
  installer = [ordered]@{
    file = [System.IO.Path]::GetFileName($installer)
    sizeBytes = (Get-Item -LiteralPath $installer).Length
    sha256 = $installerHash
  }
  environment = [ordered]@{
    runnerOs = $env:RUNNER_OS
    runnerArch = $env:RUNNER_ARCH
    image = $env:ImageOS
    imageVersion = $env:ImageVersion
    user = $env:USERNAME
    isolatedEphemeralRunner = $true
  }
  observations = [ordered]@{}
}

# First real current-user install and Windows registration discovery.
Invoke-NsisSilent -Executable $installer
$entry = Get-PlannerUninstallEntry
$installedExe = Resolve-PlannerExecutable $entry
$uninstaller = Resolve-CommandExecutable (Get-UninstallCommand $entry)
$shortcuts = @(Get-PlannerShortcutPaths)
if (-not (Test-Path -LiteralPath $installedExe)) { throw 'Installed application executable was not found.' }
if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'Registered uninstaller executable was not found.' }
if ($shortcuts.Count -lt 1) { throw 'Planner Buckets Start-menu shortcut was not found after installation.' }
$result.observations.firstInstall = [ordered]@{
  registered = $true
  executablePresent = $true
  uninstallerPresent = $true
  startMenuShortcutCount = $shortcuts.Count
}

# Launch the installed production identity and wait for durable bootstrap.
$app = Start-Process -FilePath $installedExe -PassThru
Wait-ForCondition -Description 'the first durable planner file' -TimeoutSeconds 45 -Condition { Test-Path -LiteralPath $primary }
Wait-ForCondition -Description 'the migration completion marker' -TimeoutSeconds 45 -Condition { Test-Path -LiteralPath $migrationMarker }
$firstPlanner = Read-PlannerJson $primary
if ($firstPlanner.version -ne 2 -or @($firstPlanner.projects).Count -lt 1) {
  throw 'Installed app did not create a valid v2 planner on first launch.'
}
$firstCloseMode = Stop-PlannerProcess $app

# Seed synthetic durable state while stopped and preserve an external backup.
$projectId = [string]$firstPlanner.projects[0].id
$timestamp = [DateTimeOffset]::UtcNow.ToString('o')
$taskId = "lifecycle-$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)"
$task = [pscustomobject]@{
  id = $taskId
  projectId = $projectId
  bucketId = $null
  title = 'Synthetic installed lifecycle sentinel'
  description = 'Ephemeral GitHub-hosted Windows lifecycle evidence only.'
  priority = 0
  resourceTags = @()
  pinned = $false
  completed = $false
  archivedAt = $null
  createdAt = $timestamp
  updatedAt = $timestamp
}
$firstPlanner.tasks = @($firstPlanner.tasks) + $task
Write-Utf8Json -Value $firstPlanner -Path $primary
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
Copy-Item -LiteralPath $primary -Destination $backupSentinel -Force
Copy-Item -LiteralPath $primary -Destination $externalBackup -Force
$primaryHashBeforeUninstall = (Get-FileHash -LiteralPath $primary -Algorithm SHA256).Hash
$backupHashBeforeUninstall = (Get-FileHash -LiteralPath $backupSentinel -Algorithm SHA256).Hash
$markerHashBeforeUninstall = (Get-FileHash -LiteralPath $migrationMarker -Algorithm SHA256).Hash

# Relaunch the installed application and confirm the synthetic state persists.
$app = Start-Process -FilePath $installedExe -PassThru
Start-Sleep -Seconds 4
if ($app.HasExited) { throw "Installed application exited unexpectedly with code $($app.ExitCode)." }
$loadedPlanner = Read-PlannerJson $primary
if (-not (@($loadedPlanner.tasks) | Where-Object { $_.id -eq $taskId })) {
  throw 'Installed application did not retain the synthetic durable task across restart.'
}
$secondCloseMode = Stop-PlannerProcess $app

# Same-installer repair/reinstall must leave durable state untouched.
Invoke-NsisSilent -Executable $installer
$repairEntry = Get-PlannerUninstallEntry
$repairExe = Resolve-PlannerExecutable $repairEntry
if (-not (Test-Path -LiteralPath $repairExe)) { throw 'Application executable disappeared during repair/reinstall.' }
if ((Get-FileHash -LiteralPath $primary -Algorithm SHA256).Hash -ne $primaryHashBeforeUninstall) {
  throw 'Repair/reinstall modified durable planner data unexpectedly.'
}
$result.observations.repair = [ordered]@{ passed = $true }

# Execute the registered production uninstaller silently. Tauri's interactive
# Delete app data checkbox is therefore not selected in this automation path.
$uninstaller = Resolve-CommandExecutable (Get-UninstallCommand $repairEntry)
Invoke-NsisSilent -Executable $uninstaller
Wait-ForCondition -Description 'uninstall registration removal' -TimeoutSeconds 30 -Condition {
  return @(Get-PlannerUninstallEntries).Count -eq 0
}
if (Test-Path -LiteralPath $repairExe) { throw 'Installed application executable remained after uninstall.' }
if (Test-Path -LiteralPath $uninstaller) { throw 'Registered uninstaller remained after uninstall.' }
if (@(Get-PlannerShortcutPaths).Count -ne 0) { throw 'Planner Buckets Start-menu shortcut remained after uninstall.' }
if (-not (Test-Path -LiteralPath $primary)) { throw 'Primary planner data was deleted by uninstall.' }
if (-not (Test-Path -LiteralPath $backupSentinel)) { throw 'Planner backup data was deleted by uninstall.' }
if (-not (Test-Path -LiteralPath $migrationMarker)) { throw 'Migration state was deleted by uninstall.' }
if ((Get-FileHash -LiteralPath $primary -Algorithm SHA256).Hash -ne $primaryHashBeforeUninstall) { throw 'Primary planner bytes changed during uninstall.' }
if ((Get-FileHash -LiteralPath $backupSentinel -Algorithm SHA256).Hash -ne $backupHashBeforeUninstall) { throw 'Backup bytes changed during uninstall.' }
if ((Get-FileHash -LiteralPath $migrationMarker -Algorithm SHA256).Hash -ne $markerHashBeforeUninstall) { throw 'Migration marker changed during uninstall.' }
if ((Get-FileHash -LiteralPath $unrelatedSentinel -Algorithm SHA256).Hash -ne $unrelatedHash) { throw 'Unrelated runner sentinel changed during uninstall.' }
$result.observations.uninstall = [ordered]@{
  registrationRemoved = $true
  executableRemoved = $true
  uninstallerRemoved = $true
  startMenuRemoved = $true
  primarySurvived = $true
  backupSurvived = $true
  migrationMarkerSurvived = $true
  webViewDirectorySurvived = (Test-Path -LiteralPath $webViewRoot)
  interactiveDeleteAppDataOptionExists = $true
  dataRemovalSelected = $false
}

# Reinstall the same exact bytes and confirm surviving data is loaded.
Invoke-NsisSilent -Executable $installer
$reinstallEntry = Get-PlannerUninstallEntry
$reinstalledExe = Resolve-PlannerExecutable $reinstallEntry
if (@(Get-PlannerShortcutPaths).Count -lt 1) { throw 'Start-menu shortcut was not restored after reinstall.' }
$app = Start-Process -FilePath $reinstalledExe -PassThru
Start-Sleep -Seconds 4
if ($app.HasExited) { throw "Reinstalled application exited unexpectedly with code $($app.ExitCode)." }
$reinstalledPlanner = Read-PlannerJson $primary
if (-not (@($reinstalledPlanner.tasks) | Where-Object { $_.id -eq $taskId })) {
  throw 'Reinstalled application did not load the surviving synthetic planner state.'
}
$thirdCloseMode = Stop-PlannerProcess $app
$result.observations.reinstall = [ordered]@{
  registered = $true
  startMenuRestored = $true
  syntheticPlannerLoaded = $true
}

# Prove installed recovery after reinstall using the surviving valid backup.
$corruptBytes = [System.Text.UTF8Encoding]::new($false).GetBytes('{"version":2,"corrupt":')
[System.IO.File]::WriteAllBytes($primary, $corruptBytes)
$corruptHash = (Get-FileHash -LiteralPath $primary -Algorithm SHA256).Hash
$app = Start-Process -FilePath $reinstalledExe -PassThru
Wait-ForCondition -Description 'installed recovery to replace corrupt primary' -TimeoutSeconds 45 -Condition {
  if (-not (Test-Path -LiteralPath $primary)) { return $false }
  try {
    $candidate = Read-PlannerJson $primary
    return $candidate.version -eq 2 -and (@($candidate.tasks) | Where-Object { $_.id -eq $taskId })
  } catch { return $false }
}
$recoveredPlanner = Read-PlannerJson $primary
if (-not (@($recoveredPlanner.tasks) | Where-Object { $_.id -eq $taskId })) {
  throw 'Recovery did not restore the expected synthetic planner.'
}
$preservedCorrupt = @(Get-ChildItem -LiteralPath $backupRoot -File -Filter 'corrupt-primary-*.json' -ErrorAction SilentlyContinue)
if ($preservedCorrupt.Count -lt 1) { throw 'Recovery did not preserve corrupt primary evidence.' }
$matchingCorrupt = @(
  $preservedCorrupt | Where-Object {
    (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -eq $corruptHash
  }
)
if ($matchingCorrupt.Count -lt 1) {
  throw 'Preserved corrupt-primary evidence does not match the injected corrupt bytes.'
}
$fourthCloseMode = Stop-PlannerProcess $app
$result.observations.recoveryAfterReinstall = [ordered]@{
  recoveredSyntheticPlanner = $true
  preservedCorruptPrimary = $true
}

$result.observations.launchCloseModes = @($firstCloseMode, $secondCloseMode, $thirdCloseMode, $fourthCloseMode)
$result.observations.externalBackupSha256 = (Get-FileHash -LiteralPath $externalBackup -Algorithm SHA256).Hash.ToLowerInvariant()
$result.result = 'PASS'
$result.generatedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
$resultPath = Join-Path $evidenceRoot 'installed-lifecycle.json'
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resultPath -Encoding utf8NoBOM

@"
### Installed Windows lifecycle acceptance

| Check | Result |
| --- | --- |
| Real current-user NSIS install and registration | PASS |
| Start-menu shortcut | PASS |
| Installed app first launch and durable bootstrap | PASS |
| Synthetic planner restart | PASS |
| Same-installer repair/reinstall | PASS |
| Registered uninstall removes app/shortcut | PASS |
| Primary/backup/migration state survive uninstall | PASS |
| Same-candidate reinstall and surviving state load | PASS |
| Installed recovery after reinstall | PASS |
| Interactive Delete app data option | EXISTS in pinned Tauri NSIS template; NOT SELECTED by silent automation |
| Installer SHA-256 | ``$installerHash`` |
"@ | Add-Content -Path $env:GITHUB_STEP_SUMMARY

Write-Host "Installed lifecycle acceptance PASS. Evidence: $resultPath"
