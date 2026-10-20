# Desktop data cache

All character windows share a cache in the Electron main process. Character speech uses local results and never triggers a network request by itself.

Cache files: `%APPDATA%/broadcast-overlay-widget/data-cache/shared/`.
Last-session request counts and decoded response-body sizes: `network-usage.json` in that directory. These are not Firebase billing measurements; compression, TLS and HTTP overhead are not included.

## Refresh rules

- Performance entries: check `performanceMeta` every five minutes, download the entries only when it changes.
- Team results: reuse the same performance cache as previous-three-broadcast reports. Preserve team/MD, weighted minutes, expected sales and contribution profit in the compact records, then aggregate locally using NAVI's team mapping, deduplication and monthly goals. No separate `previousPerformance/entries` or `previousPerformance/source` downloads.
- Operational schedules: cache `activeSessions` for five minutes and compare each active/future ops version's `updatedAt` before downloading it.
- TV products: use NAVI's shared `schedule/tvSchedule` and compare `loadedAt`. Use the official HTML only if today's shared schedule is unavailable; cache that fallback for one hour.
- Unchanged large payloads are refreshed at most once per 24 hours as a safety check. A real metadata change can cause another refresh sooner.
- Disk data is shown immediately on launch while expired entries are checked in the background. Concurrent requests for the same endpoint share one in-flight download. If a read fails, keep the last usable payload and retry after the normal interval.
- Explicit performance refresh bypasses the cache.

## Measured sizes (2026-10-20)

| Response | Decoded body bytes |
| --- | ---: |
| Performance entries | 11,145,912 |
| Current ops week | 257,361 |
| Next ops week | 227,629 |
| Shared TV schedule | 22,722 |
| Active sessions | 2,893 |
| Performance metadata | 185 |
| Each ops timestamp / TV loadedAt | 13 |

With two ops weeks and 24-hour uptime, metadata checks total about 0.90 MB/day of response bodies. One complete performance download adds 11.15 MB and serves both team totals and history reports. Each ops-week edit adds roughly 0.23–0.26 MB. TV schedule changes add about 0.023 MB. Actual sizes change as data grows.

Planning estimate: approximately 13–20 MB/day with one full performance update and modest schedule edits, including an allowance for protocol overhead. Extra performance updates add approximately 11.15 MB each. A cold first launch is approximately 11.65 MB of response bodies. Repeated app starts reuse the disk cache. If there is no refresh or update, only small metadata checks are needed until the 24-hour safety refresh.

Validation: the shared performance source and the former separate raw source produced identical October 2026 aggregates for all three teams (101 home-appliance programs, 32 food programs, 94 health-food programs; zero differences in handling, contribution profit or weighted minutes).
