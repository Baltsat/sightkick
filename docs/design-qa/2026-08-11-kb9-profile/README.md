# profile insights evidence surface

`before-kb8-profile-drawer.png` preserves the supplied KB8 profile capture. `insights-primary-1224x768.png` and `insights-primary-1024x700.png` render the full-height ProfileView route fixture. `insights-evidence-1224x768.png` opens the lower evidence archive and atomic radar deliberately.

run after starting Storybook at port 6010:

```sh
node docs/design-qa/2026-08-11-kb9-profile/capture-profile.mjs
```

`proof.json` rejects outer-page scrolling at both supported viewports, requires an internal profile evidence scroll region, confirms the first-view hero, and confirms that the archive and radar begin closed. The host profile button remains an integration seam owned by the library view; this fixture proves the dedicated full-height surface without modifying that sibling-owned file.
