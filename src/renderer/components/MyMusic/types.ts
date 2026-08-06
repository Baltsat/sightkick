// Renderer-side copy of the 'my-music-fetch' IPC contract declared in
// src/main/ipc/myMusic.ts. Once the Codex lane's shared bundle lands and
// src/types.ts gains the equivalent IpcMyMusic* interfaces, this file
// should be replaced by an import from '../../../types' instead of
// declaring its own copy — see src/renderer/components/SongSearch/types.ts
// for the established precedent (a renderer bundle can't import a
// main-process module that pulls in 'electron'/'child_process'/'fs').
export interface MyMusicSong {
  videoId: string;
  title: string;
  artist?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  watchUrl: string;
}

export type MyMusicErrorCode =
  | 'chrome-cookie-locked'
  | 'chrome-cookies-unavailable'
  | 'not-signed-in'
  | 'yt-dlp-missing'
  | 'timeout'
  | 'unknown';

export interface MyMusicSuccess {
  songs: MyMusicSong[];
}

export interface MyMusicError {
  error: string;
  code: MyMusicErrorCode;
}

export type MyMusicReply = MyMusicSuccess | MyMusicError;

export function isMyMusicError(reply: MyMusicReply): reply is MyMusicError {
  return 'error' in reply;
}

export interface MyMusicErrorInfo {
  code: MyMusicErrorCode;
  message: string;
}

// Minimal shape of a library song needed for the (artist, title) dedup
// badge. Deliberately structural rather than importing src/types.ts's Song
// — integration can pass the real song list straight through (Song has both
// fields) without an adapter, and MyMusic stays decoupled from the full
// Song shape it doesn't otherwise need.
export interface LibrarySongRef {
  artist: string;
  name: string;
}
