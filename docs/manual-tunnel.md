# Manual: connecting a website to your node
The website runs on shared hosting; the Lightning node runs on a Mac at home. They meet through an ngrok tunnel that only the hosting server can use.

## The shape
website (HostAfrica; its one IPv4 address is the only one allowed) → https://<reserved>.ngrok-free.dev (ngrok edge, IP allow-list) → https://localhost:8080 (LND REST on the Mac)

## 1. Reserve a domain and allow one IP
- In the ngrok dashboard, reserve a domain (it stays the same across restarts).
- Write a traffic policy (the Altradits one is ~/.lnd-altradits/ngrok-policy.yml):
```
on_tcp_connect:
  - actions:
      - type: restrict-ips
        config:
          enforce: true
          allow:
            - <the hosting server's IPv4 address>/32
```
## 2. Start the tunnel
```
ngrok config add-authtoken <your ngrok token>      # once
ngrok http https://localhost:8080 --url=https://<reserved>.ngrok-free.dev \
  --traffic-policy-file ~/.lnd-altradits/ngrok-policy.yml
```
Keep it running (a launch agent, or a terminal you leave open). If the Mac sleeps, payments fall back to the backup Lightning address and are "held".

## 3. Tell the website
In DirectAdmin → Setup Node.js App:
- LND_REST_URL = https://<reserved>.ngrok-free.dev
- LND_INVOICE_MACAROON = hex of the receive-only macaroon
- YEBENTE_LND_PAY_MACAROON = hex of the Ye₿ente pay macaroon (only if wallets send)
- LND_TLS_CERT only when the site talks to LND directly with its self-signed certificate (not through ngrok)
Then Restart.

## 4. Lessons learned the hard way
- **IPv4 only.** The allow-list holds the server's IPv4 address. The tunnel's name also has IPv6 records, and a connection over IPv6 was turned away, so invoices failed from some devices. The site forces IPv4 (lib/lightning.js, family: 4).
- **Retry once, then say so.** A dropped tunnel connection is retried once after 1.5 seconds; then the visitor sees "The Lightning node isn't answering right now" (503), never a raw error.
- **Unclear answers never refund.** A tunnel error page during a payment means "unknown": the node is asked again before any refund.

## 5. Test it
- From your browser, https://<reserved>.ngrok-free.dev must not reach LND (your IP isn't allowed).
- https://altradits.com/api/yebente/health shows "node": true when everything is connected.
- Admin → Finance shows channels, capacity and "receive only" for the website key.
