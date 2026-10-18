# Platform rules

Starting knowledge for compiling `series-kit.yaml` rules. Every rule has
a **source** and a **checked** date (the day the source was actually
read; `—` = not yet checked). Official sources outrank secondary ones —
a rule backed only by a secondary source stays **verify**. Rules marked **verify** are believed
correct but change often or weren't confirmed against the source on the
checked date — check the source before relying on them, and carry the
flag into the kit and CHECKLIST.md. Never present a verify rule as fact.

Review window: 90 days. Rules older than that are reported as stale.

## YouTube (long-form)

| id | rule | source | checked | verify |
|---|---|---|---|---|
| yt-thumb-size | Custom thumbnail 1280×720 (16:9), min width 640 px | secondary: thumbnailtest.com/guides/youtube-thumbnail-size, techsmith.com/blog/youtube-thumbnail-sizes | 2026-10-08 | ✓ |
| yt-thumb-file | Thumbnail JPG/PNG/GIF/BMP, under 2 MB | secondary: thumbnailtest.com/guides/youtube-thumbnail-size | 2026-10-08 | ✓ |
| yt-thumb-legible | Thumbnail text and face legible at small feed/mobile sizes | craft (Lux) | — | |
| yt-title-length | Title ≤ 100 characters; front-load meaning — truncates much sooner in feeds | YouTube Help (not source-checked) | — | ✓ |
| yt-description-length | Description ≤ 5,000 characters; first lines show above the fold | YouTube Help (not source-checked) | — | ✓ |
| yt-chapters | Chapters: first timestamp 00:00, at least 3 chapters, each ≥ 10 s | support.google.com/youtube/answer/9884579 | 2026-10-08 | |
| yt-end-screen | End screen in the final 5–20 s; video ≥ 25 s; up to 4 elements (16:9); not on made-for-kids videos | support.google.com/youtube/answer/6388789 | 2026-10-08 | |

## YouTube Shorts / Instagram Reels / TikTok

| id | rule | source | checked | verify |
|---|---|---|---|---|
| short-aspect | Vertical 9:16, 1080×1920 | platform upload guides (not source-checked) | — | ✓ |
| short-hook | Hook lands in the first 1–3 s | craft (Patrick/Quill) | — | |
| short-safe-zone | Captions and key action stay inside the cross-platform safe rect at 1080×1920: top 288, bottom 672, left 120, right 192 px (x 120–888, y 288–1248). Union of the three rows below. Centre on the rect midpoint (x 504); geometric centring at x 540 only when the caption is ≤ 696 px wide incl. any scale | derived from the rows below | 2026-10-17 | |
| shorts-safe-zone | YouTube Shorts: top 288, bottom 672, left 48, right 192 px (ad safe area x 48–887, y 288–1247) | official: Google Ads Shorts safe-zone overlay, support.google.com/google-ads/answer/13547298 | 2026-10-17 | |
| reels-safe-zone | Instagram Reels: top 14% (269), bottom 35% (672), sides 6% (65) px | official: Meta ads guide, facebook.com/business/ads-guide/update/video/instagram-reels | 2026-10-17 | |
| tiktok-safe-zone | TikTok: top 240, bottom 660, left 120, right 120 px, plus a 180 px right button column from y 840 down | secondary: TikTok in-feed ad template scaled to 1080×1920 (socialync.io/tools/safe-zones/tiktok; upload-post.com/tools/safe-zone-checker); template source ads.tiktok.com/help/article/tiktok-auction-in-feed-ads | 2026-10-17 | ✓ |
| yt-shorts-length | YouTube Shorts up to 3 minutes (since 2024-10-15) | secondary: descript.com/blog/article/how-long-can-youtube-shorts-be | 2026-10-08 | ✓ |
| reels-length | Instagram Reels up to 20 min; reported that Reels over 3 min aren't recommended to non-followers | secondary: tryordinal.com/blog/how-long-can-an-instagram-reel-be | 2026-10-08 | ✓ |
| tiktok-length | TikTok up to 60 min uploaded, 10 min in-app camera; rolls out by account/region | secondary: kompozy.io/specs/tiktok-video-length-limit | 2026-10-08 | ✓ |
| short-text-mobile | On-screen text legible on a phone at arm's length | craft (Lux) | — | |

## Podcast feeds (Apple Podcasts, Spotify)

| id | rule | source | checked | verify |
|---|---|---|---|---|
| pod-art | Show art square, 3000×3000 (1400–3000 via RSS), JPG/PNG, RGB, 72 dpi | podcasters.apple.com/support/artwork-requirements | 2026-10-08 | |
| pod-art-file | Show art file-size cap (search summary reported 500 KB — confirm on the Apple page) | podcasters.apple.com/support/artwork-requirements | 2026-10-08 | ✓ |
| pod-loudness | Integrated loudness around −16 LUFS, true peak ≤ −1 dBTP | Apple Podcasts audio requirements (not source-checked) | — | ✓ |
| pod-show-notes | Show notes with timestamps and links | craft (Quill) | — | |
| spotify-video | Spotify video-podcast specs per Spotify for Creators | Spotify for Creators (not source-checked) | — | ✓ |

## LinkedIn / X

| id | rule | source | checked | verify |
|---|---|---|---|---|
| li-video | LinkedIn native video length/size limits per LinkedIn Help; captions burned in or SRT attached | LinkedIn Help (not source-checked) | — | ✓ |
| x-video | X video length limit depends on account tier | X Help Center (not source-checked) | — | ✓ |
| social-native-captions | Social clips carry captions (most feed video is watched muted) | craft (Lux) | — | |
