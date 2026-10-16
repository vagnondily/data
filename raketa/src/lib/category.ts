// Catégorisation côté interface (miroir de raketa_core::category) pour la
// barre latérale façon IDM. Les filtres « Incomplets »/« Terminés » se basent
// sur le statut, les autres sur l'extension du fichier.

export type CatKey =
  | "all"
  | "video"
  | "audio"
  | "image"
  | "document"
  | "archive"
  | "program"
  | "game"
  | "incomplete"
  | "completed";

const EXT: Record<string, CatKey> = {};
function reg(keys: string[], cat: CatKey) {
  for (const k of keys) EXT[k] = cat;
}
reg(
  ["iso","bin","cue","chd","pkg","rom","nds","3ds","gba","gb","gbc","wbfs","rvz","wua","cso","nsp","xci","z64","n64","v64","sfc","smc","gcm","rpx","wux","ps3","ps2","psv","vpk"],
  "game",
);
reg(["mp4","mkv","avi","mov","wmv","flv","webm","m4v","mpg","mpeg","ts"], "video");
reg(["mp3","flac","wav","aac","ogg","m4a","wma","opus"], "audio");
reg(["jpg","jpeg","png","gif","webp","bmp","svg","heic","tiff","ico"], "image");
reg(["pdf","doc","docx","xls","xlsx","ppt","pptx","txt","epub","mobi","odt","ods","csv","rtf"], "document");
reg(["zip","rar","7z","tar","gz","bz2","xz","zst","tgz"], "archive");
reg(["exe","msi","apk","dmg","deb","rpm","appimage","bat","sh","flatpak"], "program");

// Catégorie « type » d'un fichier d'après son extension.
export function categoryOf(filename: string): CatKey {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "document";
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXT[ext] ?? "document";
}

// Icône emoji par catégorie (pour l'affichage dans le tableau).
export function iconFor(filename: string): string {
  const map: Record<CatKey, string> = {
    all: "📥",
    video: "🎬",
    audio: "🎵",
    image: "🖼️",
    document: "📄",
    archive: "🗜️",
    program: "⚙️",
    game: "🎮",
    incomplete: "⏳",
    completed: "✅",
  };
  return map[categoryOf(filename)];
}

export interface CatDef {
  key: CatKey;
  label: string;
  icon: string;
}

// Liste ordonnée des catégories de la barre latérale (façon IDM).
export const CATEGORIES: CatDef[] = [
  { key: "all", label: "Tous les téléchargements", icon: "📥" },
  { key: "video", label: "Vidéos", icon: "🎬" },
  { key: "audio", label: "Musique", icon: "🎵" },
  { key: "image", label: "Images", icon: "🖼️" },
  { key: "document", label: "Documents", icon: "📄" },
  { key: "archive", label: "Compressé", icon: "🗜️" },
  { key: "program", label: "Programmes", icon: "⚙️" },
  { key: "game", label: "Jeux", icon: "🎮" },
  { key: "incomplete", label: "Incomplets", icon: "⏳" },
  { key: "completed", label: "Terminés", icon: "✅" },
];

// Teste si un téléchargement appartient à une catégorie.
export function matchesCategory(
  cat: CatKey,
  filename: string,
  status: string,
): boolean {
  switch (cat) {
    case "all":
      return true;
    case "incomplete":
      return status !== "completed";
    case "completed":
      return status === "completed";
    default:
      return categoryOf(filename) === cat;
  }
}
