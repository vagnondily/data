import type { DownloadDto } from "../../lib/api";
import { CATEGORIES, matchesCategory, type CatKey } from "../../lib/category";

interface Props {
  downloads: DownloadDto[];
  selected: CatKey;
  onSelect: (key: CatKey) => void;
}

// Barre latérale des catégories (façon IDM), avec compteur par catégorie.
export function CategorySidebar({ downloads, selected, onSelect }: Props) {
  const count = (key: CatKey) =>
    downloads.filter((d) => matchesCategory(key, d.display_name, d.status)).length;

  return (
    <nav className="cat-sidebar" aria-label="Catégories">
      {CATEGORIES.map((c) => {
        const n = count(c.key);
        const separator = c.key === "incomplete";
        return (
          <button
            key={c.key}
            className={`cat-item ${selected === c.key ? "active" : ""} ${separator ? "cat-sep" : ""}`}
            onClick={() => onSelect(c.key)}
          >
            <span className="cat-icon">{c.icon}</span>
            <span className="cat-label">{c.label}</span>
            <span className="cat-count">{n}</span>
          </button>
        );
      })}
    </nav>
  );
}
