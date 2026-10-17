// Petit carillon de fin de téléchargement, synthétisé via Web Audio (aucun
// fichier à embarquer). Deux notes brèves, douces, non intrusives.
export function playCompletionSound(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [
      { f: 880, t: 0 }, // La
      { f: 1174.66, t: 0.14 }, // Ré
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.f;
      const start = now + n.t;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    }
    // Libère le contexte après extinction.
    window.setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* audio indisponible : silencieux */
  }
}
