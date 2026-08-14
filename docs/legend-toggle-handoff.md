# notation key toggle handoff

`SongView.tsx` and `NotationGlossary.tsx` have active sibling edits. apply this patch after those changes settle. it starts closed, persists the player’s last choice in `settings.notationKitKeyVisible`, and keeps the key reachable from the practice toolbar.

```diff
diff --git a/src/renderer/components/NotationGlossary/NotationGlossary.tsx b/src/renderer/components/NotationGlossary/NotationGlossary.tsx
@@
     <aside
+      id="notation-kit-key"
       className="drumroll-notation-key"
       data-testid="notation-kit-key"
       data-layout={layout}
diff --git a/src/renderer/views/SongView/SongView.tsx b/src/renderer/views/SongView/SongView.tsx
@@
   const [notationLayout, setNotationLayout] = usePersisted<SheetMusicLayout>(
     'settings.practiceNotationLayout',
     'flow',
   );
+  const [notationKitKeyVisible, setNotationKitKeyVisible] = usePersisted(
+    'settings.notationKitKeyVisible',
+    false,
+  );
   const [adaptiveTutorEnabled, setAdaptiveTutorEnabled] = usePersisted<boolean>(
@@
         <div
           className="drumroll-practice-toolbar__session-state shrink-0"
@@
           </span>
         </div>
+        <Button
+          type="text"
+          size="small"
+          data-testid="notation-kit-key-toggle"
+          aria-expanded={notationKitKeyVisible}
+          aria-controls="notation-kit-key"
+          aria-label={
+            notationKitKeyVisible
+              ? 'Hide drum kit notation key'
+              : 'Show drum kit notation key'
+          }
+          onClick={() => setNotationKitKeyVisible((visible) => !visible)}
+        >
+          Kit key
+        </Button>
         <SettingsButton
@@
         </Content>
-        <NotationKitKey layout={notationLayout} />
+        {notationKitKeyVisible && (
+          <NotationKitKey layout={notationLayout} />
+        )}
         {showInactivityCaption && (
diff --git a/src/renderer/views/SongView/SongView.test.tsx b/src/renderer/views/SongView/SongView.test.tsx
@@
 describe('opening a song', () => {
+  it('keeps the kit key closed until asked for and persists dismissal', async () => {
+    const view = setupSongView();
+
+    await view.loadSong();
+
+    const toggle = screen.getByTestId('notation-kit-key-toggle');
+
+    expect(toggle).toHaveAttribute('aria-expanded', 'false');
+    expect(screen.queryByTestId('notation-kit-key')).not.toBeInTheDocument();
+
+    fireEvent.click(toggle);
+
+    expect(toggle).toHaveAttribute('aria-expanded', 'true');
+    expect(screen.getByTestId('notation-kit-key')).toBeInTheDocument();
+    expect(
+      JSON.parse(
+        window.localStorage.getItem('settings.notationKitKeyVisible') ?? 'false',
+      ),
+    ).toBe(true);
+
+    fireEvent.click(toggle);
+
+    expect(toggle).toHaveAttribute('aria-expanded', 'false');
+    expect(screen.queryByTestId('notation-kit-key')).not.toBeInTheDocument();
+    expect(
+      JSON.parse(
+        window.localStorage.getItem('settings.notationKitKeyVisible') ?? 'true',
+      ),
+    ).toBe(false);
+  });
+
   it('shows the song header and real rendered sheet music', async () => {
```

acceptance: add the test above, run the full four gates, then capture the score at 1024 × 700 with `notation-kit-key` absent before interaction and visible only after the toolbar control is selected.
