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

// Instantané de progression publié par le moteur (événement `raketa://progress`).
export interface Progress {
  download_id: string;
  downloaded: number;
  total: number | null;
  speed_bps: number;
  status: DownloadStatus;
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
