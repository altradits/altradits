# Njia

Njia tracks how the Altradits Lightning node learns to earn from routing fees and leased inbound channels. It only reads the node and is honest about every sat.

Njia is Swahili for path or route. The public page at /njia shows five stops on a path: Reserve, Public channels, Fair fees, Always on, First lease. Each stop shows only Done or Not yet.

Njia never opens or closes channels, never sends, never sets fees, and never changes node settings. Every node figure on the Earn tab names its read-only check on the Mac.

## Privacy options (decide before the first public channel)

By default the public page shows no node pubkey, no alias, no onion address and no marketplace listing link. Two settings in admin change that: Identity and Numbers. Each switch-on needs a typed word (LINK, SHOW) and is logged. The log is never deleted.

Know these before you decide:

- The node's alias is announced to the whole network once it has a public channel, whatever the page shows. To stay unlinked, change the alias first.
- Every invoice the website issues already reveals the pubkey to whoever paid it. Hiding it on the page stops casual and search-engine linking only.
- Exact numbers can identify the node, so the page shows coarse bands only, never exact balances, dates, sizes or peers.
- Hidden means the page cannot sell. Buyers find leases on the marketplace.

Three options:

- A. One node, linked (Identity on). Brand trust helps sell leases. Simplest. Pseudonymity is gone for good.
- B. One node, page hidden (default). Cheap, and turning Identity on later is one setting.
- C. Separate earning node. Real separation. Needs a second machine and a second pool of capital.

Start with B. Look at C again only if routing pays its own chain costs two months running. Njia reads a second node with no code change: set NJIA_LND_REST_URL, NJIA_LND_READONLY_MACAROON and NJIA_LND_TLS_CERT. The Deadman and channel alerts still watch only the site node. The tab says which node it reads ("site node" or "earning node"), never the URL.

During a Deadman lockdown the public view hides Identity and Numbers whatever the settings say, and switching either on is refused until the lockdown lifts. Switching off always works.

## The server

- `lib/njia.js`: settings, the append-only lease ledger, hand-entered marketplace prices, the checklist stages, the public view builder, the hourly summary and the reachability sample. It imports nothing that can write to LND.
- `lib/lightning.js` `njiaRead()`: the one read-only sweep (GETs plus the /v1/switch read). `njiaPing()`: one getinfo for the 5-minute sample.
- `api/admin.js`: `GET ?view=njia` (the Earn tab data, cached 60 seconds, Refresh at most every 15 seconds), `GET ?view=njia_csv` (ledger export), and the `njia_lease`, `njia_lease_void`, `njia_price`, `njia_settings`, `njia_listing` actions (60 an hour, behind the admin gate).
- `api/njia.js`: `GET` only. Health always answers. The summary only reads the stored hourly build and never calls the node.
- Admin: the Earn tab in admin.html, rendered by assets/admin.js. Every node figure carries its `ln-ro` check line.

Switched on with `NJIA=on`. Off: the public API answers only health and `{ on:false }`, there is no hourly summary and no sample. The Earn tab still reads on demand, and the ledger still records. Health always answers 200 and never calls the node.

Store keys are listed at the top of lib/njia.js. The daily backup copies the whole store. Lease, price and settings records are never deleted: mistakes are voided with a reason, and totals skip voided leases.

## Routes

- `GET /njia` (`/njia.html` redirects 301 to `/njia`): the page.
- `GET /api/njia?part=health`: `{ ok, on, publicAt }`, always 200.
- `GET /api/njia`: the stored public summary, filtered by settings and lockdown.
- `GET /api/admin?view=njia`: the full dashboard (admin token).
- `GET /api/admin?view=njia_csv`: the ledger as CSV (admin token).
- `POST /api/admin` with the `njia_*` actions: records and settings only.

## What Stanley does by hand

The Earn tab checklist shows the exact commands. In short: copy channel.backup off the Mac. Fund 10,000 sats on-chain (50,000 to 100,000 before opening channels). Decide A, B or C and set the alias. Open 2 public channels of 1M to 2M sats each, recording the expected chain fee first. Set fees near the medians. Keep the node awake. List the first lease on the marketplace, open it by hand, record it in the ledger. Get written legal advice before charging: Kenya notes live only in admin, never on /njia.
