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

function Fail($msg) { Write-Host "ERREUR : $msg" -ForegroundColor Red; exit 1 }

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
& $NssmExe status $ServiceName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Service existant -> arrêt et suppression..." -ForegroundColor Yellow
  & $NssmExe stop   $ServiceName 2>$null | Out-Null
  & $NssmExe remove $ServiceName confirm | Out-Null
}

$params = "`"$viteBin`" preview --host --port $Port"

& $NssmExe install $ServiceName "$NodeExe"
& $NssmExe set $ServiceName AppParameters   $params
& $NssmExe set $ServiceName AppDirectory     "$WebDir"
& $NssmExe set $ServiceName AppStdout        (Join-Path $logDir "mems.out.log")
& $NssmExe set $ServiceName AppStderr        (Join-Path $logDir "mems.err.log")
& $NssmExe set $ServiceName AppRotateFiles   1
& $NssmExe set $ServiceName Start            SERVICE_AUTO_START
& $NssmExe set $ServiceName DisplayName      "MEMS — Suivi & Evaluation"
& $NssmExe set $ServiceName Description       "Sert l'interface statique MEMS (web/dist)."

& $NssmExe start $ServiceName

Write-Host ""
Write-Host "OK — service '$ServiceName' demarre." -ForegroundColor Green
Write-Host "Accedez a  http://localhost:$Port  (ou http://IP_DU_SERVEUR:$Port)."
Write-Host "Pare-feu si acces distant :"
Write-Host "  New-NetFirewallRule -DisplayName `"MEMS $Port`" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow"
