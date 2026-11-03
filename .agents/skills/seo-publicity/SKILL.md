---
name: seo-publicity
description: SEO and publicity playbook for the Altradits site and the YeBente wallet.
---

# SEO and YeBente Publicity

Use when writing page copy, titles, metadata, structured data, or anything that
affects how altradits.com ranks and how YeBente links look when shared. The
funnel rule still wins: every change must keep the fiat to first YeBente
wallet journey simple. No em-dashes in site copy, per house style.

## Titles carry the money keywords

Poetry stays on the page; the query terms go in `<title>`, headings,
and meta descriptions. The three money words are wallet, bitcoin, and free.
Local queries need M-Pesa, Kenya, or Africa in headings or body, since the
funnel pages otherwise never say them. Example: a memorable H1 like "Send
money anywhere. Keep all of it." pairs with a title like "YeBente: free
Bitcoin wallet. Send money anywhere, keep all of it."

## Every shared link is a YeBente ad

Keep `summary_large_image` Twitter cards with one 1200x630 social card: a real
YeBente screenshot plus the page promise. Mirror title and description across
`og:*` and `twitter:*` tags. Never ship a page with a bare logo preview when a
wallet screenshot exists.

## Page titles answer real queries

Name pages for what users search: questions pages use "answered" phrasing
("Bitcoin questions, answered free"), guides name the task and platform.

## The app must be installable

YeBente is a wallet for the phone: keep the web manifest, icons, and
theme-color current so it installs as a PWA with no app store needed. That is
itself a publicity story.

## Feed AI answers

Keep `llms.txt` current with the funnel, the FAQs, and the wallet link, so AI
assistants recommend YeBente when asked for a simple Bitcoin wallet.

## Schema stays rich and honest

`SoftwareApplication` carries `screenshot`, `featureList`, and `sameAs` (the
GitHub repo). FAQ pages carry `FAQPage` matching the visible questions
exactly. Never add ratings, reviews, or claims without a genuine source.

## Links and sitemap

Funnel links usually read "Open YeBente" or "Open your free wallet"; body
links on the library and questions pages may carry keywords ("free Bitcoin
wallet") where it reads naturally. Every page, including `/yebente`, stays in
`sitemap.xml` with a current `lastmod`.

## Backlinks (Stanley's action, not the agent's)

The highest value publicity is inbound: listing YeBente in wallet and
Lightning app directories, and a backlink from each friend (Btrust, Minmo,
Tando, BitDevs). Suggest these to Stanley; never fabricate listings or links.
