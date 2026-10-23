# Desktop resource optimizations

- Legacy widget windows are created on demand instead of launching six hidden renderers.
- Usagi has a 120×164 DIP transparent viewport per monitor; world coordinates retain full-monitor movement, dragging, mouse hit regions, and BI anchors.
- Sprite sheets decode to 96/144/192 pixel cells according to displayed size and DPI. Original files are preserved. Temporary source images are released after bitmap creation.
- Shared-scene bitmaps/audio load on encounter and are released after 90 seconds of non-use. Loading is sequential to bound peak allocation.
- Rendering is capped at 30fps. Cursor IPC is sent only on change. Usagi layers do not request friends' schedule/performance data.
- Screen lock and system suspend cancel animation frames and audio; resume adjusts animation clocks. A Windows power notification listener also handles display power-off. The small .NET listener is compiled to userData/runtime and has no continuously running PowerShell host. If compilation fails, lock/suspend still work.
- Rasa stops after five minutes without a request, after in-flight parsing completes. Later questions restart it; dialogue state remains in the app.

Checks:

```powershell
node --test scripts/test-pet-optimization.js
```

`scripts/smoke-pet-optimization.js` is an isolated Electron renderer check for bitmap decoding, visible pixels, pause/resume and lazy shared-scene release. It does not train/load Rasa or query BI.

Memory samples are process working-set sums and contain shared pages; they are comparative snapshots, not exclusive physical allocation. The Windows power listener is measured separately. Compare like-for-like use and account for open BI windows, warm-up and animation assets.
