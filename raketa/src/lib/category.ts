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

import type { CustomCategory } from "./api";

// Extension (sans point, en minuscules) d'un nom de fichier.
export function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

// Catégorie « type » d'un fichier d'après son extension.
export function categoryOf(filename: string): CatKey {
  const ext = extOf(filename);
  if (!ext) return "document";
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

// Préfixe des clés de catégories personnalisées.
export const CUSTOM_PREFIX = "custom:";

// Définitions de la barre latérale, catégories personnalisées incluses.
export function categoriesFor(customs: CustomCategory[]): CatDef[] {
  const extra: CatDef[] = customs.map((c) => ({
    key: (CUSTOM_PREFIX + c.name) as CatKey,
    label: c.name,
    icon: "🏷️",
  }));
  // Insère les perso juste avant les filtres d'état (Incomplets/Terminés).
  const base = CATEGORIES.slice(0, -2);
  const tail = CATEGORIES.slice(-2);
  return [...base, ...extra, ...tail];
}

// Teste si un téléchargement appartient à une catégorie (perso comprises).
export function matchesCategory(
  cat: string,
  filename: string,
  status: string,
  customs: CustomCategory[] = [],
): boolean {
  if (cat.startsWith(CUSTOM_PREFIX)) {
    const name = cat.slice(CUSTOM_PREFIX.length);
    const def = customs.find((c) => c.name === name);
    return def ? def.exts.includes(extOf(filename)) : false;
  }
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
