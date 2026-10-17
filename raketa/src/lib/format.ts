// Formatage lisible des tailles, débits et temps restant (section 11.2).

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  if (!bps || bps <= 0) return "—";
  return `${formatBytes(bps)}/s`;
}

// Temps restant : masqué si le débit est instable ou la taille inconnue (section 11.2).
export function formatEta(
  downloaded: number,
  total: number | null,
  bps: number,
): string {
  if (!total || total <= 0 || !bps || bps <= 0) return "—";
  const remaining = total - downloaded;
  if (remaining <= 0) return "terminé";
  const secs = Math.round(remaining / bps);
  if (secs < 60) return `${secs} s`;
  if (secs < 3600) return `${Math.floor(secs / 60)} min ${secs % 60} s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h} h ${m} min`;
}

export function percent(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((downloaded / total) * 100));
}

// Horodatage epoch (secondes) → date/heure locale lisible.
export function formatDate(ts: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return "—";
  }
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    queued: "En file",
    probing: "Analyse…",
    downloading: "En cours",
    paused: "En pause",
    completed: "Terminé",
    error: "Erreur",
    cancelled: "Annulé",
  };
  return map[status] ?? status;
}
