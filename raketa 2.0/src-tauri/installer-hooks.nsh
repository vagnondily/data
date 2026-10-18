; ---------------------------------------------------------------------------
; Hooks du programme d'installation RAKETA (NSIS).
;
; Autorise RAKETA dans le pare-feu Windows (connexions ENTRANTES des pairs
; torrent -> meilleur nombre de sources et meilleures vitesses). On eleve
; UNIQUEMENT la commande netsh (invite UAC) ; l'installation elle-meme reste
; "par utilisateur" (sans elevation). Si l'utilisateur refuse l'invite,
; l'application propose de refaire l'operation plus tard
; (Preferences > General > Pare-feu, ou sous un torrent bloque).
; ---------------------------------------------------------------------------

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Autorisation de RAKETA dans le pare-feu Windows..."
  ExecShell "runas" "netsh" 'advfirewall firewall add rule name="RAKETA" dir=in action=allow program="$INSTDIR\RAKETA.exe" enable=yes profile=any'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecShell "runas" "netsh" 'advfirewall firewall delete rule name="RAKETA"'
!macroend
