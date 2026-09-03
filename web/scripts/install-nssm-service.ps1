# ============================================================================
# MEMS — installation en service Windows via NSSM
# Sert la build statique (web/dist) avec `vite preview` sous node.exe.
#
# Exemple :
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-nssm-service.ps1 `
#     -WebDir "C:\apps\data\web" -Port 3000 -NssmExe "C:\nssm\nssm.exe"
# ============================================================================
param(
  [string]$WebDir      = (Split-Path -Parent $PSScriptRoot),  # dossier web/ par défaut
  [int]   $Port        = 3000,
  [string]$ServiceName = "MEMS",
  [string]$NssmExe     = "nssm",                              # sur le PATH, ou chemin complet
  [string]$NodeExe     = ""                                    # auto-détecté si vide
)

$ErrorActionPreference = "Stop"
# NSSM renvoie un code non nul / ecrit sur stderr pour des cas benins (service
# absent, deja arrete). Empeche PowerShell 7.4+ d'en faire une erreur terminale.
if (Test-Path variable:\PSNativeCommandUseErrorActionPreference) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Fail($msg) { Write-Host "ERREUR : $msg" -ForegroundColor Red; exit 1 }

# Execute nssm SANS stopper le script sur stderr ou code de retour non nul,
# et renvoie le code + la sortie (fonctionne en Windows PowerShell 5.1 et 7.x).
function Nssm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$NssmArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { $out = & $NssmExe @NssmArgs 2>&1 } finally { $ErrorActionPreference = $prev }
  [pscustomobject]@{ Code = $LASTEXITCODE; Output = ($out | Out-String).Trim() }
}

# Droits administrateur requis pour installer un service Windows.
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Fail "Ouvrez PowerShell en tant qu'administrateur (installation d'un service requise)." }

# --- Vérifications --------------------------------------------------------
if (-not (Test-Path $WebDir)) { Fail "Dossier introuvable : $WebDir" }
$dist = Join-Path $WebDir "dist"
if (-not (Test-Path (Join-Path $dist "index.html"))) {
  Fail "Build manquante ($dist). Lancez d'abord :  cd `"$WebDir`" ; npm ci ; npm run build"
}
$viteBin = Join-Path $WebDir "node_modules\vite\bin\vite.js"
if (-not (Test-Path $viteBin)) { Fail "vite introuvable. Lancez `npm ci` dans $WebDir." }

if ([string]::IsNullOrEmpty($NodeExe)) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { Fail "node.exe introuvable sur le PATH. Passez -NodeExe `"C:\Program Files\nodejs\node.exe`"." }
  $NodeExe = $cmd.Source
}

$logDir = Join-Path $WebDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host "Service      : $ServiceName"
Write-Host "node.exe     : $NodeExe"
Write-Host "Dossier web  : $WebDir"
Write-Host "Port         : $Port"

# --- (Ré)installation du service -----------------------------------------
# Sonde d'existence robuste (ne leve pas si le service est absent).
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Write-Host "Service existant -> arret et suppression..." -ForegroundColor Yellow
  Nssm stop   $ServiceName         | Out-Null
  Nssm remove $ServiceName confirm | Out-Null
  Start-Sleep -Seconds 1
}

$params = "`"$viteBin`" preview --host --port $Port"

$r = Nssm install $ServiceName "$NodeExe"
if ($r.Code -ne 0) { Fail "Installation du service impossible.`n$($r.Output)" }

Nssm set $ServiceName AppParameters $params                            | Out-Null
Nssm set $ServiceName AppDirectory  "$WebDir"                          | Out-Null
Nssm set $ServiceName AppStdout     (Join-Path $logDir "mems.out.log") | Out-Null
Nssm set $ServiceName AppStderr     (Join-Path $logDir "mems.err.log") | Out-Null
Nssm set $ServiceName AppRotateFiles 1                                 | Out-Null
Nssm set $ServiceName Start         SERVICE_AUTO_START                 | Out-Null
Nssm set $ServiceName DisplayName   "MEMS - Suivi & Evaluation"        | Out-Null
Nssm set $ServiceName Description   "Sert l'interface statique MEMS (web/dist)." | Out-Null

$r = Nssm start $ServiceName
if ($r.Code -ne 0) { Fail "Service installe mais demarrage impossible.`n$($r.Output)" }

Write-Host ""
Write-Host "OK — service '$ServiceName' demarre." -ForegroundColor Green
Write-Host "Accedez a  http://localhost:$Port  (ou http://IP_DU_SERVEUR:$Port)."
Write-Host "Pare-feu si acces distant :"
Write-Host "  New-NetFirewallRule -DisplayName `"MEMS $Port`" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow"
