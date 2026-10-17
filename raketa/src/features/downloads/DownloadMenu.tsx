import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";

// Vues de téléchargement accessibles depuis le menu déroulant.
export type DlChoice = "single" | "batch" | "media" | "torrents";

interface Props {
  // Sous-vue active (pour la coche et le libellé du bouton).
  active: DlChoice;
  // Le bouton est-il mis en avant (une vue de téléchargement est ouverte) ?
  highlighted: boolean;
  onSelect: (c: DlChoice) => void;
}

const ITEMS: { key: DlChoice; icon: string; label: string; hint: string }[] = [
  { key: "single", icon: "download", label: "Téléchargement", hint: "Un lien" },
  { key: "batch", icon: "layers", label: "Téléchargement en masse", hint: "Liste / motif [1-100]" },
  { key: "media", icon: "youtube", label: "Médias", hint: "YouTube, Vimeo, Dailymotion…" },
  { key: "torrents", icon: "magnet", label: "Torrents", hint: "Magnet / fichier .torrent" },
];

// Menu « Téléchargement » déroulant regroupant les manières de télécharger.
export function DownloadMenu({ active, highlighted, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const current = ITEMS.find((i) => i.key === active) ?? ITEMS[0];

  return (
    <div className="dl-menu" ref={ref}>
      <button
        className={`dl-menu-btn ${highlighted ? "active" : ""} ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon name={current.icon} size={16} />
        <span className="dl-menu-current">{current.label}</span>
        <Icon name="chevron-down" size={15} className="dl-menu-caret" />
      </button>

      {open && (
        <div className="dl-menu-pop" role="menu">
          {ITEMS.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              className={`dl-menu-item ${active === it.key && highlighted ? "active" : ""}`}
              onClick={() => {
                onSelect(it.key);
                setOpen(false);
              }}
            >
              <span className="dl-menu-item-icon">
                <Icon name={it.icon} size={18} />
              </span>
              <span className="dl-menu-item-text">
                <span className="dl-menu-item-label">{it.label}</span>
                <span className="dl-menu-item-hint">{it.hint}</span>
              </span>
              {active === it.key && highlighted && (
                <Icon name="check" size={16} className="dl-menu-check" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
