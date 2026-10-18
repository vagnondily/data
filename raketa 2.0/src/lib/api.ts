// Pont typé entre l'interface React et les commandes Tauri (moteur RAKETA).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";

// Confirmation native AVANT toute suppression (Windows et Android). Renvoie
// true si l'utilisateur confirme. En cas d'indisponibilité du dialogue, on
// retombe sur window.confirm pour ne jamais supprimer sans accord.
export async function confirmDelete(message: string): Promise<boolean> {
  try {
    return await ask(message, { title: "RAKETA — Confirmer", kind: "warning" });
  } catch {
    try {
      return window.confirm(message);
    } catch {
      return false;
    }
  }
}

export type DownloadStatus =
  | "queued"
  | "probing"
  | "downloading"
  | "paused"
  | "completed"
  | "error"
  | "cancelled";

export interface DownloadDto {
  id: string;
  url: string;
  display_name: string;
  destination: string;
  status: DownloadStatus;
  total_bytes: number | null;
  downloaded_bytes: number;
  mime_type: string | null;
  sha256: string | null;
  error_code: string | null;
  created_at: number;
  updated_at: number;
  file_exists: boolean;
}

export interface RemoteInfo {
  final_url: string;
  size: number | null;
  accept_ranges: boolean;
  etag: string | null;
  last_modified: string | null;
  mime_type: string | null;
  suggested_filename: string | null;
}

// État d'un segment (connexion parallèle), façon IDM.
export interface SegmentInfo {
  index: number;
  downloaded: number;
  total: number;
  // Débit instantané de ce segment (octets/seconde).
  speed_bps: number;
}

// Instantané de progression publié par le moteur (événement `raketa://progress`).
export interface Progress {
  download_id: string;
  downloaded: number;
  total: number | null;
  speed_bps: number;
  status: DownloadStatus;
  segments?: SegmentInfo[] | null;
}

export const EVENT_PROGRESS = "raketa://progress";

export function probeUrl(url: string): Promise<RemoteInfo> {
  return invoke<RemoteInfo>("probe_url", { url });
}

export function addDownload(args: {
  url: string;
  destDir: string;
  filename?: string;
  expectedSha256?: string;
  username?: string;
  password?: string;
}): Promise<string> {
  return invoke<string>("add_download", {
    url: args.url,
    destDir: args.destDir,
    filename: args.filename ?? null,
    expectedSha256: args.expectedSha256 ?? null,
    username: args.username ?? null,
    password: args.password ?? null,
  });
}

export function listDownloads(): Promise<DownloadDto[]> {
  return invoke<DownloadDto[]>("list_downloads");
}

export interface DownloadEvent {
  event_type: string;
  timestamp: number;
  message: string | null;
}

export function downloadEvents(id: string): Promise<DownloadEvent[]> {
  return invoke<DownloadEvent[]>("download_events", { id });
}

export function pauseDownload(id: string): Promise<void> {
  return invoke("pause_download", { id });
}

export function resumeDownload(id: string): Promise<void> {
  return invoke("resume_download", { id });
}

export function cancelDownload(id: string): Promise<void> {
  return invoke("cancel_download", { id });
}

export function removeDownload(id: string, deleteFile: boolean): Promise<void> {
  return invoke("remove_download", { id, deleteFile });
}

// Re-télécharge un élément existant à partir de son id (URL réelle stockée).
export function redownload(id: string): Promise<string> {
  return invoke<string>("redownload", { id });
}

export function openFile(path: string): Promise<void> {
  return invoke("open_file", { path });
}

export function revealInFolder(path: string): Promise<void> {
  return invoke("reveal_in_folder", { path });
}

// S'abonne aux événements de progression ; renvoie une fonction de désabonnement.
export function onProgress(cb: (p: Progress) => void): Promise<UnlistenFn> {
  return listen<Progress>(EVENT_PROGRESS, (event) => cb(event.payload));
}

// ---------------------------------------------------------------------------
// Torrents
// ---------------------------------------------------------------------------

export interface TorrentFile {
  name: string;
  len: number;
  downloaded: number;
}

export interface TorrentProgress {
  id: number;
  info_hash: string;
  name: string;
  // Chemin du contenu sur le disque (fichier ou dossier racine du torrent).
  content_path: string;
  downloaded: number;
  total: number;
  uploaded: number;
  speed_bps: number;
  up_speed_bps: number;
  peers_live: number;
  peers_seen: number;
  files: TorrentFile[];
  finished: boolean;
  paused: boolean;
  state: string;
  // Diagnostic de santé des sources (vérificateur automatique) :
  // "checking" | "healthy" | "no_source" | "no_connection" | "complete"
  // | "paused" | "error".
  health: string;
  error: string | null;
}

export const EVENT_TORRENT = "raketa://torrent-progress";

export function addTorrent(url: string): Promise<number> {
  return invoke<number>("add_torrent", { url });
}

export function addTorrentFile(path: string): Promise<number> {
  return invoke<number>("add_torrent_file", { path });
}

export function listTorrents(): Promise<TorrentProgress[]> {
  return invoke<TorrentProgress[]>("list_torrents");
}

export function pauseTorrent(id: number): Promise<void> {
  return invoke("pause_torrent", { id });
}

export function resumeTorrent(id: number): Promise<void> {
  return invoke("resume_torrent", { id });
}

export function removeTorrent(id: number, deleteFiles: boolean): Promise<void> {
  return invoke("remove_torrent", { id, deleteFiles });
}

// Flux périodique de l'état des torrents (liste complète à chaque tick).
export function onTorrentProgress(
  cb: (list: TorrentProgress[]) => void,
): Promise<UnlistenFn> {
  return listen<TorrentProgress[]>(EVENT_TORRENT, (event) => cb(event.payload));
}

// ---------------------------------------------------------------------------
// Lot, paramètres, navigateur, presse-papiers
// ---------------------------------------------------------------------------

export function addBatch(text: string, destDir: string): Promise<number> {
  return invoke<number>("add_batch", { text, destDir });
}

export interface Settings {
  connections: number;
  max_simultaneous: number;
  speed_limit_kbps: number;
  default_dir: string;
  auto_categorize: boolean;
  block_popups: boolean;
  clipboard_watch: boolean;
  completion_sound: boolean;
  scheduler_enabled: boolean;
  start_time: string;
  stop_time: string;
  night_limit_enabled: boolean;
  night_limit_kbps: number;
  night_start: string;
  night_end: string;
  // JSON opaque : [{ name, exts: string[] }]
  custom_categories: string;
  minimize_to_tray: boolean;
  autostart: boolean;
  always_on_top: boolean;
}

// Catégorie personnalisée définie par l'utilisateur.
export interface CustomCategory {
  name: string;
  exts: string[];
}

export function parseCustomCategories(json: string): CustomCategory[] {
  try {
    const v = JSON.parse(json || "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((c) => c && typeof c.name === "string" && Array.isArray(c.exts))
      .map((c) => ({
        name: String(c.name),
        exts: c.exts.map((e: unknown) => String(e).toLowerCase().replace(/^\./, "")),
      }));
  } catch {
    return [];
  }
}

export function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export function setSettings(settings: Settings): Promise<void> {
  return invoke("set_settings", { settings });
}

export function openBrowser(url: string): Promise<void> {
  return invoke("open_browser", { url });
}

// Ouvre une URL dans le navigateur système (pour les sites à vérif. de sécurité).
export function openExternalUrl(url: string): Promise<void> {
  return invoke("open_external_url", { url });
}

// Version installée de RAKETA (version + build CI).
export function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

// Page publique des versions à télécharger (repli manuel, toujours valide).
export const RELEASE_URL =
  "https://github.com/vagnondily/raketa-releases/releases";

export interface UpdateInfo {
  build: number;
  tag: string;
  url: string;
  notes: string;
  // Empreinte SHA-256 attendue de l'installeur (si publiée) — vérifiée avant installation.
  sha256: string | null;
}

// Vérifie s'il existe une version plus récente (null si à jour).
export function checkUpdate(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>("check_update");
}

// Progression du téléchargement de l'installeur de mise à jour (dans l'app).
export interface UpdateProgress {
  downloaded: number;
  total: number | null;
  done: boolean;
}

export const EVENT_UPDATE = "raketa://update-progress";

// Télécharge l'installeur DANS RAKETA (pas via le navigateur). Renvoie le
// chemin local du .exe.
export function downloadUpdate(url: string, sha256?: string | null): Promise<string> {
  return invoke<string>("download_update", { url, expectedSha256: sha256 ?? null });
}

// Lance l'installeur téléchargé et ferme RAKETA.
export function runInstaller(path: string): Promise<void> {
  return invoke("run_installer", { path });
}

// Télécharge + décompresse l'extension et ouvre le dossier prêt à charger.
// Renvoie le chemin du dossier.
export function installExtension(): Promise<string> {
  return invoke<string>("install_extension");
}

// Ouvre Chrome ou Edge directement sur sa page des extensions.
export function openBrowserExtensions(browser: "chrome" | "edge"): Promise<void> {
  return invoke("open_browser_extensions", { browser });
}

export function onUpdateProgress(
  cb: (p: UpdateProgress) => void,
): Promise<UnlistenFn> {
  return listen<UpdateProgress>(EVENT_UPDATE, (event) => cb(event.payload));
}

// ---- Combineur de parties (joindre les fichiers découpés) ----

// "concat" = à concaténer (reconstitue le fichier) ; "archive" = archive
// multi-volume à extraire (ne jamais concaténer).
export type PartKind = "concat" | "archive";

export interface PartFile {
  path: string;
  name: string;
  size: number;
}

export interface PartGroup {
  base: string;
  output_name: string;
  kind: PartKind;
  parts: PartFile[];
  total_size: number;
  // Première partie manquante (suite non contiguë), sinon null.
  missing: number | null;
}

export interface JoinProgress {
  output: string;
  written: number;
  total: number;
  done: boolean;
}

export const EVENT_JOIN = "raketa://join-progress";

// Détecte les groupes « multi-parties » d'un dossier (par nom de fichier).
export function detectPartGroups(dir: string): Promise<PartGroup[]> {
  return invoke<PartGroup[]>("detect_part_groups", { dir });
}

// Concatène des parties dans l'ordre en un seul fichier. Renvoie le chemin final.
export function joinParts(args: {
  parts: string[];
  dir: string;
  outputName: string;
  deleteParts: boolean;
}): Promise<string> {
  return invoke<string>("join_parts", {
    parts: args.parts,
    dir: args.dir,
    outputName: args.outputName,
    deleteParts: args.deleteParts,
  });
}

export function onJoinProgress(cb: (p: JoinProgress) => void): Promise<UnlistenFn> {
  return listen<JoinProgress>(EVENT_JOIN, (event) => cb(event.payload));
}

export const EVENT_CLIPBOARD = "raketa://clipboard-url";

// URL intéressante copiée dans le presse-papiers (capture façon IDM).
export function onClipboardUrl(cb: (url: string) => void): Promise<UnlistenFn> {
  return listen<string>(EVENT_CLIPBOARD, (event) => cb(event.payload));
}

// ---------------------------------------------------------------------------
// Téléchargeur média (YouTube & co., via yt-dlp)
// ---------------------------------------------------------------------------

export interface MediaFormat {
  quality: string;
  label: string;
}

export interface MediaInfo {
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  ffmpeg: boolean;
  formats: MediaFormat[];
}

export interface MediaProgress {
  id: string;
  downloaded: number;
  total: number | null;
  speed_bps: number;
  /** Pourcentage fourni par yt-dlp (0–100) ; fiable même sans taille totale. */
  percent: number | null;
  /** "processing" = post-traitement (fusion vidéo+audio, conversion MP3). */
  status: "queued" | "downloading" | "processing" | "completed" | "error" | "cancelled";
  /** Titre réel du média (affiché à la place d'un nom générique). */
  title: string | null;
  detail: string | null;
}

export const EVENT_MEDIA = "raketa://media-progress";

// Analyse une URL média (titre, miniature, qualités). Provisionne yt-dlp.
export function mediaProbe(url: string): Promise<MediaInfo> {
  return invoke<MediaInfo>("media_probe", { url });
}

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string;
  duration: number | null;
  thumbnail: string | null;
  available: boolean;
}

export interface PlaylistInfo {
  title: string;
  uploader: string | null;
  entries: PlaylistEntry[];
}

export function mediaPlaylistProbe(url: string): Promise<PlaylistInfo> {
  return invoke<PlaylistInfo>("media_playlist_probe", { url });
}

// Lance un téléchargement média ; renvoie son identifiant.
export function mediaDownload(
  url: string,
  quality: string,
  destDir: string,
): Promise<string> {
  return invoke<string>("media_download", { url, quality, destDir });
}

export function mediaCancel(id: string): Promise<void> {
  return invoke("media_cancel", { id });
}

export interface ToolsStatus {
  yt_dlp: boolean;
  ffmpeg: boolean;
}

export function mediaToolsStatus(): Promise<ToolsStatus> {
  return invoke<ToolsStatus>("media_tools_status");
}

export function installFfmpeg(): Promise<void> {
  return invoke("install_ffmpeg");
}

export interface FfmpegProgress {
  downloaded: number;
  total: number | null;
  phase: "download" | "extract" | "done" | "error";
  message: string | null;
}

export const EVENT_FFMPEG = "raketa://ffmpeg-progress";

export function onFfmpegProgress(
  cb: (p: FfmpegProgress) => void,
): Promise<UnlistenFn> {
  return listen<FfmpegProgress>(EVENT_FFMPEG, (event) => cb(event.payload));
}

// Applique une limite de débit « à chaud » (planificateur horaire), sans la
// persister dans les paramètres.
export function setRateLimitLive(kbps: number): Promise<void> {
  return invoke("set_rate_limit_live", { kbps });
}

export function onMediaProgress(
  cb: (p: MediaProgress) => void,
): Promise<UnlistenFn> {
  return listen<MediaProgress>(EVENT_MEDIA, (event) => cb(event.payload));
}

// Contenu « récupéré » depuis une page (navigateur intégré ou extension) :
// vidéo (yt-dlp), torrent (magnet/.torrent) ou lien HTTP, routé vers le bon
// moteur. L'interface s'en sert pour afficher aussitôt le transfert.
export interface GrabbedEvent {
  kind: "media" | "torrent" | "http";
  id: string | null;
  title: string | null;
  url: string;
}

export const EVENT_GRABBED = "raketa://grabbed";

export function onGrabbed(cb: (e: GrabbedEvent) => void): Promise<UnlistenFn> {
  return listen<GrabbedEvent>(EVENT_GRABBED, (event) => cb(event.payload));
}

// ---------------------------------------------------------------------------
// Historique des téléchargements (persistant)
// ---------------------------------------------------------------------------

export interface HistoryItem {
  id: string;
  url: string; // URL réelle (re-téléchargement)
  url_display: string; // URL expurgée (affichage)
  display_name: string;
  destination: string;
  total_bytes: number | null;
  sha256: string | null;
  source: string; // "http" | "media" | "torrent"
  completed_at: number;
  file_exists: boolean;
}

export function listHistory(): Promise<HistoryItem[]> {
  return invoke<HistoryItem[]>("list_history");
}

export function deleteHistoryEntry(id: string): Promise<void> {
  return invoke("delete_history_entry", { id });
}

export function clearHistory(): Promise<void> {
  return invoke("clear_history");
}

// ---------------------------------------------------------------------------
// Ergonomie de la fenêtre
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Journal (diagnostic)
// ---------------------------------------------------------------------------

export interface LogEntry {
  ts: number;
  level: string;
  message: string;
}

export function readLog(): Promise<LogEntry[]> {
  return invoke<LogEntry[]>("read_log");
}

export function openLog(): Promise<void> {
  return invoke("open_log");
}

export function clearLog(): Promise<void> {
  return invoke("clear_log");
}

// ---------------------------------------------------------------------------
// Pare-feu Windows (connexions entrantes des pairs torrent)
// ---------------------------------------------------------------------------

export interface FirewallStatus {
  /** La vérification a-t-elle pu aboutir ? (false hors Windows ou si refusée.) */
  checked: boolean;
  /** RAKETA est-il déjà autorisé dans le pare-feu ? */
  allowed: boolean;
}

export function firewallStatus(): Promise<FirewallStatus> {
  return invoke<FirewallStatus>("firewall_status");
}

// Ajoute la règle de pare-feu (déclenche une invite UAC). Résout si autorisé.
export function firewallAuthorize(): Promise<void> {
  return invoke("firewall_authorize");
}

export function setAlwaysOnTop(on: boolean): Promise<void> {
  return invoke("set_always_on_top", { on });
}

export function dockRight(): Promise<void> {
  return invoke("dock_right");
}

export function restoreWindow(): Promise<void> {
  return invoke("restore_window");
}
