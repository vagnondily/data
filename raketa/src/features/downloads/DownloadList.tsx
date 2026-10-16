import type { DownloadDto } from "../../lib/api";
import { DownloadItem } from "./DownloadItem";

interface Props {
  downloads: DownloadDto[];
  speeds: Record<string, number>;
  onChanged: () => void;
  onOpenDetail: (d: DownloadDto) => void;
}

export function DownloadList({ downloads, speeds, onChanged, onOpenDetail }: Props) {
  if (downloads.length === 0) {
    // État vide explicite (section 11.1).
    return (
      <div className="empty-state">
        <div className="empty-emoji">🌵</div>
        <p className="empty-title">Aucun téléchargement</p>
        <p className="empty-hint">
          Collez une URL ci-dessus pour lancer votre premier transfert.
        </p>
      </div>
    );
  }

  return (
    <div className="dl-list">
      {downloads.map((d) => (
        <DownloadItem
          key={d.id}
          d={d}
          speed={speeds[d.id] ?? 0}
          onChanged={onChanged}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  );
}
