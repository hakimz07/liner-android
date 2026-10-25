# Liner -> Android (personal use only)

Untested first pass. Read the LICENSE: personal, private, non-commercial use only.
Do NOT publish the APK, and do NOT run this in a public repo (artifacts of public repos
can be downloaded by any signed-in GitHub user).

1. Create a NEW PRIVATE repo on GitHub and push the contents of desktop-main (not a public fork).
2. Copy everything from this folder into the repo root (keep paths).
3. GitHub -> Actions -> "Android debug APK" -> Run workflow.
4. Download `app-debug-apk` from the run, unzip, install app-debug.apk (allow unknown apps).
5. If a step fails, open the red step and send me the last ~40 lines of its log.

What the bridge does: signing runs in the WebView (same WASM), all remote requests go through
Capacitor's native HTTP client with spoofed Origin/Referer like desktop, YouTube token/n-solver code
is reused as-is. Desktop-only features (updater, Discord, overlay, window controls) are no-ops.
Known risks: audio streaming is not incremental through the native client, BotGuard may behave
differently inside an Android WebView, and the UI is desktop-sized.
