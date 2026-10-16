import type { DownloadDto } from "../../lib/api";
import { formatSpeed } from "../../lib/format";

interface Props {
  downloads: DownloadDto[];
  speeds: Record<string, number>;
}

// Tableau de bord : tâches actives, débit global, terminés, erreurs (section 11.1).
export function Stats({ downloads, speeds }: Props) {
  const active = downloads.filter((d) => d.status === "downloading").length;
  const done = downloads.filter((d) => d.status === "completed").length;
  const errors = downloads.filter((d) => d.status === "error").length;
  const totalSpeed = Object.values(speeds).reduce((a, b) => a + b, 0);

  const tiles = [
    { label: "Actifs", value: String(active), accent: "blue" },
    { label: "Débit global", value: formatSpeed(totalSpeed), accent: "orange" },
    { label: "Terminés", value: String(done), accent: "blue" },
    { label: "Erreurs", value: String(errors), accent: errors > 0 ? "red" : "muted" },
  ];

  return (
    <section className="stats" aria-label="Tableau de bord">
      {tiles.map((t) => (
        <div key={t.label} className={`stat-tile accent-${t.accent}`}>
          <span className="stat-value">{t.value}</span>
          <span className="stat-label">{t.label}</span>
        </div>
      ))}
    </section>
  );
}
