# cloud library activation

activated 2026-08-13 for the existing Cloudflare Pages project `drumroll`.

## created on the account

- dedicated KV namespace `DRUMROLL_LIBRARY` (`965d0dcfe73b403f9cb6af38e22e9b39`), bound in [`web/wrangler.jsonc`](../../../web/wrangler.jsonc);
- encrypted production Pages secret `LIBRARY_MIRROR_TOKEN`; its value is neither committed nor recorded here;
- production deployment `https://02ee88a8.drumroll.pages.dev`, with the canonical mirror endpoint `https://drumroll.pages.dev/api/library`;
- desktop setting saved through `save-library-mirror-settings` in the active `sight-kick` profile. the token is stored locally but never returned over IPC.

## live proof

- selected the local `Blood // Water` chart by grandson; its chart and metadata reached the Pages API, while the local path and audio source did not;
- with the mirror fetch path disabled, the local queue stayed usable and retained one private outbox entry; restoring it reconciled to `synced` with zero pending entries;
- the API returned `401` for a bad bearer token and `200` for the configured token;
- a temporary changed-chart revision replaced the cloud record, then the original chart was restored;
- the repository suite covers token rejection, offline retry, partial upload, and changed-chart replacement in `src/main/libraryMirror.test.ts`.

## disable or erase

to disable the cloud mirror immediately, delete the Pages secret and deploy once:

```sh
corepack yarn wrangler pages secret delete LIBRARY_MIRROR_TOKEN --project-name drumroll
cd web && corepack yarn wrangler pages deploy dist --project-name drumroll --branch feat/practice-loop
```

remove the local desktop credentials and the local Keychain copy:

```sh
node -e 'const fs=require("node:fs");const p=process.env.HOME+"/Library/Application Support/sight-kick/config.json";const c=JSON.parse(fs.readFileSync(p,"utf8"));delete c.libraryMirror;fs.writeFileSync(p,`${JSON.stringify(c,null,2)}\n`,{mode:0o600})'
security delete-generic-password -a cloudflare-pages -s drumroll-library-mirror
```

for permanent cloud-data deletion, first remove the `DRUMROLL_LIBRARY` block from `web/wrangler.jsonc` and deploy, then delete the namespace:

```sh
corepack yarn wrangler kv namespace delete --namespace-id 965d0dcfe73b403f9cb6af38e22e9b39
```
