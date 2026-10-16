// Pont typé entre l'interface React et les commandes Tauri (moteur RAKETA).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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
}): Promise<string> {
  return invoke<string>("add_download", {
    url: args.url,
    destDir: args.destDir,
    filename: args.filename ?? null,
    expectedSha256: args.expectedSha256 ?? null,
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

// S'abonne aux événements de progression ; renvoie une fonction de désabonnement.
export function onProgress(cb: (p: Progress) => void): Promise<UnlistenFn> {
  return listen<Progress>(EVENT_PROGRESS, (event) => cb(event.payload));
}

// ---------------------------------------------------------------------------
// Torrents
// ---------------------------------------------------------------------------

export interface TorrentProgress {
  id: number;
  info_hash: string;
  name: string;
  downloaded: number;
  total: number;
  uploaded: number;
  speed_bps: number;
  finished: boolean;
  paused: boolean;
  state: string;
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

export const EVENT_CLIPBOARD = "raketa://clipboard-url";

// URL intéressante copiée dans le presse-papiers (capture façon IDM).
export function onClipboardUrl(cb: (url: string) => void): Promise<UnlistenFn> {
  return listen<string>(EVENT_CLIPBOARD, (event) => cb(event.payload));
}
