# YouTube extraction — keeping it working

YouTube actively fights `yt-dlp`, hardest from **datacenter IPs** (Render, most
clouds). Cookie expiry is the symptom people notice first, but the root issue is
that a cloud IP looks like a bot. This is the playbook, cheapest fix first.

The live config is visible (booleans only, no secrets) at `GET /api/status` under
the `youtube` key: `cookiesConfigured`, `proxyConfigured`,
`potProviderConfigured`, `playerClients`.

---

## 1. Make cookies last (free, do this first)

Cookies die fast for two reasons: YouTube **rotates** session cookies server-side,
and cookies used from a different IP than where they were exported get flagged. To
get a *stable* snapshot:

1. Open an **incognito / private** window.
2. Log in to YouTube with a **throwaway Google account** — not your real one. It
   will eventually get flagged; when it does, you just make another.
3. Open a new tab, go to `youtube.com`, confirm you're logged in.
4. **Close the window without logging out and without browsing further.** Logging
   out invalidates the cookies; browsing rotates them. You want the snapshot frozen.
5. Export `cookies.txt` (Netscape format) from that session.

Upload it to Render as a **Secret File** mounted at `/etc/secrets/cookies.txt`
(already wired via `COOKIES_PATH` in `render.yaml`). Re-export every few weeks.

> The server copies the cookie file to a writable temp path per request, so
> yt-dlp can use it, but Render's free tier has no persistent disk — any cookies
> yt-dlp refreshes are not saved back. Re-uploading periodically is the workaround.

## 2. Keep yt-dlp current (free)

YouTube breaks the stable extractor constantly. Builds install the **nightly**
channel (`pip install --pre "yt-dlp[default]"`). The catch: a build only picks up
a new nightly when it runs. **Rebuild/redeploy regularly** (weekly, or whenever
downloads start failing). On Render: Manual Deploy → "Clear build cache & deploy",
or set up a scheduled deploy.

## 3. Residential proxy (paid, biggest single fix)

A cloud IP is the core problem. Route yt-dlp through a residential or mobile proxy
and most bot-blocks disappear. Set `YTDLP_PROXY` in the Render dashboard (keep it
out of git — it carries credentials):

```
YTDLP_PROXY=http://user:pass@host:port      # or socks5://host:port
```

Providers: Webshare, IPRoyal, Bright Data, etc. When set, the explicit `--proxy`
flag overrides any ambient proxy env.

## 4. PO-token provider (paid-ish, removes the cookie dependency)

YouTube increasingly requires **Proof-of-Origin tokens**. The `bgutil` yt-dlp
plugin (installed in the image) generates them — but it needs a small **provider
server** running. With it, yt-dlp often works on a cloud IP *without cookies at all*.

The provider needs its own process (~256MB+ RAM), so run it as a **separate
service**, not inside the main container (the free plan would OOM):

1. In `render.yaml`, uncomment the `transposeme-pot` service (prebuilt image
   `brainicism/bgutil-ytdlp-pot-provider`). Give it a paid plan.
2. Set `POT_PROVIDER_BASE_URL=http://transposeme-pot:4416` on the main service.

Locally / Docker, the equivalent is:

```
docker run -d --name pot -p 4416:4416 brainicism/bgutil-ytdlp-pot-provider
export POT_PROVIDER_BASE_URL=http://127.0.0.1:4416
```

If no provider is reachable the plugin just no-ops — yt-dlp falls back to cookies.

## 5. Desktop app = no datacenter problem at all (best)

The Electron app (`main.cjs`) spawns the backend **locally**, so extraction runs on
the **user's own residential IP** — which YouTube rarely blocks — with no shared
cookie. Build it so the packaged frontend talks to that local backend:

```
npm run package        # runs `vite build --mode electron` first
```

`--mode electron` pins `VITE_API_BASE_URL=http://localhost:4000` (see
`vite.config.js`). Caveat: the user's machine needs `yt-dlp`, `ffmpeg`,
`rubberband`, and `python3` + `essentia` on PATH; `electron-packager` does not
bundle those binaries.

---

## How the server tries (client rotation + retry)

`downloadAudio` rotates through `YTDLP_PLAYER_CLIENTS`
(default `default,tv,web_safari,mweb`) and retries the whole loop
`YTDLP_MAX_ATTEMPTS` times (default 2). Which client works shifts week to week, so
rotation survives far better than one hardcoded client. Non-retryable failures
(private/removed video, too long) stop early with a clear reason.

## Env reference

| Variable | Default | Purpose |
|---|---|---|
| `COOKIES_PATH` | `/app/cookies.txt` | yt-dlp cookie file |
| `YTDLP_PROXY` | _(none)_ | Proxy URL (residential recommended) |
| `YTDLP_PLAYER_CLIENTS` | `default,tv,web_safari,mweb` | Clients to rotate |
| `YTDLP_MAX_ATTEMPTS` | `2` | Whole-loop retries |
| `POT_PROVIDER_BASE_URL` | _(none)_ | bgutil provider server URL |

## Troubleshooting

The API returns a typed `code` + `hint` on failure:

| code | Meaning | Action |
|---|---|---|
| `BOT_CHECK` | YouTube bot wall | Refresh cookies / add proxy / PO-token / use desktop |
| `UNAVAILABLE` | Private/removed/region | Nothing to do — bad video |
| `RATE_LIMIT` | HTTP 429 | Wait, or add a proxy |
| `FORMAT` | No stream / DRM / live | Update yt-dlp; live & DRM unsupported |
| `TOO_LONG` | Over duration limit | Use a shorter video |
| `TIMEOUT` | Download timed out | Retry / shorter video |
