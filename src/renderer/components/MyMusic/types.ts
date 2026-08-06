// Renderer-side re-export of the 'my-music-fetch' IPC contract declared in
// src/types.ts (see src/main/ipc/myMusic.ts for the handler). Kept as
// local aliases — rather than importing src/types.ts's names directly at
// every call site — so this component's public surface (MyMusic.tsx,
// helpers.ts, useMyMusic.ts, and their tests) doesn't need to change;
// mirrors src/renderer/components/SongSearch/types.ts's precedent for the
// same "renderer can't import a main-process module" reason.
import {
  IpcMyMusicError,
  IpcMyMusicReply,
  IpcMyMusicResponse,
  MyMusicErrorCode,
  MyMusicSong,
} from '../../../types';

export type { MyMusicSong, MyMusicErrorCode };

export type MyMusicSuccess = IpcMyMusicResponse;

export type MyMusicError = IpcMyMusicError;

export type MyMusicReply = IpcMyMusicReply;

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
