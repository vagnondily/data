import type { CustomCategory, DownloadDto } from "../../lib/api";
import { categoriesFor, matchesCategory } from "../../lib/category";
import { Icon } from "../../components/Icon";

interface Props {
  downloads: DownloadDto[];
  selected: string;
  onSelect: (key: string) => void;
  customs?: CustomCategory[];
}

// Barre latérale des catégories (façon IDM), avec compteur par catégorie.
export function CategorySidebar({ downloads, selected, onSelect, customs = [] }: Props) {
  const cats = categoriesFor(customs);
  const count = (key: string) =>
    downloads.filter((d) => matchesCategory(key, d.display_name, d.status, customs)).length;

  return (
    <nav className="cat-sidebar" aria-label="Catégories">
      {cats.map((c) => {
        const n = count(c.key);
        const separator = c.key === "incomplete";
        return (
          <button
            key={c.key}
            className={`cat-item ${selected === c.key ? "active" : ""} ${separator ? "cat-sep" : ""}`}
            onClick={() => onSelect(c.key)}
          >
            <span className="cat-icon">
              <Icon name={c.icon} size={17} />
            </span>
            <span className="cat-label">{c.label}</span>
            <span className="cat-count">{n}</span>
          </button>
        );
      })}
    </nav>
  );
}
