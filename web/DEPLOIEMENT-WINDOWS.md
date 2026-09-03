# Déploiement de MEMS en service Windows (NSSM)

MEMS est une application **front‑end** : `npm run build` produit un **site statique**
(`web/dist`). Le service Windows sert simplement ce dossier avec un petit serveur HTTP.

> ⚠️ **Données locales au navigateur.** MEMS stocke ses données dans le `localStorage`
> de chaque navigateur. Le service rend l'app accessible sur le réseau, mais **les données
> ne sont pas partagées** entre les postes. Pour un usage multi‑utilisateurs avec base
> commune, il faudra adosser l'application à une API (phase back‑end).

---

## Prérequis (sur le serveur)

- **Node.js 18+** (LTS) — <https://nodejs.org> (installe `node.exe`, souvent dans `C:\Program Files\nodejs`)
- **NSSM** — <https://nssm.cc/download> (place `nssm.exe`, p. ex. dans `C:\nssm\nssm.exe`)
- Le dépôt cloné, p. ex. dans `C:\apps\data`

## 1. Construire l'application

```powershell
cd C:\apps\data\web
npm ci
npm run build      # génère C:\apps\data\web\dist
```

## 2. Installer le service (script fourni)

Un script PowerShell automatise la création du service NSSM :

```powershell
cd C:\apps\data\web
# PowerShell en tant qu'administrateur
powershell -ExecutionPolicy Bypass -File .\scripts\install-nssm-service.ps1 `
  -WebDir "C:\apps\data\web" -Port 3000 -NssmExe "C:\nssm\nssm.exe"
```

Le script : vérifie la build, repère `node.exe`, crée le service **MEMS** qui lance
`vite preview` (serveur statique intégré) sur le port choisi, configure le démarrage
automatique et les journaux, puis démarre le service.

Ouvrez ensuite **http://localhost:3000** (ou `http://IP_DU_SERVEUR:3000` depuis un autre poste).

## 2 bis. Installation manuelle (équivalent, sans le script)

NSSM doit pointer sur **`node.exe`** (pas sur `npm`, qui est un `.cmd` mal géré en service) :

```powershell
$node = (Get-Command node).Source          # ex. C:\Program Files\nodejs\node.exe
$vite = "C:\apps\data\web\node_modules\vite\bin\vite.js"

C:\nssm\nssm.exe install MEMS "$node"
C:\nssm\nssm.exe set MEMS AppParameters "`"$vite`" preview --host --port 3000"
C:\nssm\nssm.exe set MEMS AppDirectory "C:\apps\data\web"
C:\nssm\nssm.exe set MEMS AppStdout "C:\apps\data\web\logs\mems.out.log"
C:\nssm\nssm.exe set MEMS AppStderr "C:\apps\data\web\logs\mems.err.log"
C:\nssm\nssm.exe set MEMS Start SERVICE_AUTO_START
C:\nssm\nssm.exe start MEMS
```

## Gérer le service

```powershell
nssm status  MEMS
nssm restart MEMS
nssm stop    MEMS
nssm remove  MEMS confirm     # désinstaller
```

## Mettre à jour l'application

```powershell
cd C:\apps\data\web
git pull
npm ci
npm run build
nssm restart MEMS
```

## Accès réseau

Ouvrez le port dans le pare‑feu Windows si l'app est consultée depuis d'autres postes :

```powershell
New-NetFirewallRule -DisplayName "MEMS 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

---

## Dépannage

**`nssm.exe : Impossible d'ouvrir le service!` (au lancement du script)**
À la **première** installation le service `MEMS` n'existe pas encore ; sous
PowerShell 7.4+ le code de retour de `nssm status` était transformé en erreur
fatale. **Corrigé** dans le script (sonde via `Get-Service`, appels `nssm`
tolérants). Mettez le dépôt à jour (`git pull`) puis relancez le script — ou
utilisez l'**installation manuelle** ci‑dessus (§ 2 bis), équivalente.

**`Impossible d'ouvrir le service` / accès refusé** : ouvrez PowerShell **en
tant qu'administrateur** (clic droit → « Exécuter en tant qu'administrateur »).
Le script le vérifie désormais et s'arrête avec un message clair sinon.

**Le service ne démarre pas** : consultez `C:\apps\data\web\logs\mems.err.log`,
vérifiez que la build existe (`web\dist\index.html`) et que le port n'est pas
déjà pris (`Get-NetTCPConnection -LocalPort 3000`).

---

## Alternatives au serveur Node

Comme `web/dist` est **100 % statique** (et utilise le routage par `#`, donc **aucune
réécriture d'URL n'est nécessaire**), vous pouvez aussi le servir sans Node :

- **IIS** — pointez un site sur `web\dist` (le plus « natif » Windows Server).
- **Nginx / Apache** — `root .../web/dist;`.

Dans ces cas, NSSM n'est pas nécessaire (IIS/Nginx sont déjà des services).
