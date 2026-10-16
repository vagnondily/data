# RAKETA — préparation de l'environnement de développement Windows (section 18).
# À exécuter progressivement dans PowerShell. Certaines installations demandent
# une confirmation et un redémarrage du terminal.
#
# PRÉALABLE : installer Visual Studio Build Tools avec la charge de travail
# « Desktop development with C++ » et un Windows SDK via l'installateur officiel.
#   https://visualstudio.microsoft.com/visual-cpp-build-tools/

Write-Host "== Vérification de WinGet ==" -ForegroundColor Cyan
winget --version

Write-Host "== Installation de Rustup ==" -ForegroundColor Cyan
winget install --id Rustlang.Rustup --exact

Write-Host "== (Rouvrir le terminal puis) configurer Rust stable MSVC ==" -ForegroundColor Yellow
# rustup default stable-msvc

Write-Host "== Installation de Node.js LTS ==" -ForegroundColor Cyan
winget install --id OpenJS.NodeJS.LTS --exact

Write-Host "== Installation de VS Code ==" -ForegroundColor Cyan
winget install --id Microsoft.VisualStudioCode --exact

Write-Host ""
Write-Host "Prochaines étapes (après réouverture du terminal) :" -ForegroundColor Green
Write-Host "  rustup default stable-msvc"
Write-Host "  rustc --version ; cargo --version"
Write-Host "  node --version  ; npm --version"
Write-Host ""
Write-Host "Puis, dans le dossier du projet :" -ForegroundColor Green
Write-Host "  npm install"
Write-Host "  npm run tauri dev     # lance RAKETA en développement"
Write-Host "  npm run tauri build   # produit l'installateur Windows (MSI/NSIS)"
