# opt-in practice presence and private postcard

These captures cover the renderer surfaces added on 2026-08-12. Every control starts disabled, stores only local practice state, and sends nothing to a network service.

| capture                                   | surface                                          | visible proof                                                                                  |
| ----------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `01-practice-presence-default-off.png`    | Settings → Practice presence                     | menu-bar presence is off by default; no reminder can be enabled until the player opts in.      |
| `02-private-postcard-field-selection.png` | saved Practice receipt → Export private postcard | the player must select the real saved details to include before local PDF export is available. |

The native tray and reminder are covered by focused main-process tests. This dossier does not claim an operating-system notification was delivered from an unsigned development build. Electron documents that macOS notifications require a signed app to appear: [Notification API](https://www.electronjs.org/docs/latest/api/notification).

The postcard is offered only after a real saved Practice run. It contains no automatic posting path; its PDF is sent through the existing local export channel only after the player chooses fields.
