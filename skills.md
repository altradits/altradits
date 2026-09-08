---
name: altradits-portfolio-builder
description: Comprehensive design system, architecture specification, and sales-conversion blueprint for building the Altradits freelance & agency portfolio website (Stanley Chege Thuita & The 4-Developer Bitcoin Syndicate), featuring YeboBank glassmorphic navbar and dynamic hero design patterns, 2-click lead qualification, multi-rail payment options (Kenya, Ethiopia, Somalia), and turnkey service package selling systems.
---

# ALTRADITS PORTFOLIO & PRODUCT AGENCY BUILDER
### The Master Specification, Design System & Conversion Engine Blueprint

---

## 1. Executive Brand & Positioning Identity

### 1.1 Founder & Brand Persona
- **Brand Entity**: **Altradits** (Fintech Product Studio & Open-Source Bitcoin Developer Launchpad)
- **Founder & Lead Architect**: **Stanley Chege Thuita**
  - Co-Founder of **BitDevs Kisumu** ([@BitDevsKsm](https://x.com/BitDevsKsm))
  - Alumnus of the **Addis Ababa Lightning Developer Bootcamp** (Btrust / Africa Free Routing / HRF)
- **Personal Ethos & Core Mission**:
  - **Self-Funding Open-Source Developers**: Empowering Bitcoin engineers in East Africa to earn sustainable income through high-velocity client builds while self-funding their deep journey into **Bitcoin Core** and **LND**.
  - **Pan-African Financial Sovereignty**: Engineering compliant, robust payment infrastructure that legally bridges **Kenya 🇰🇪 (M-Pesa)**, **Ethiopia 🇪🇹 (Telebirr)**, and **Somalia 🇸🇴 (EVC Plus)** with the Bitcoin Lightning Network.
  - **Social Impact Engineering**: Proven track record of high-impact tech, including **ChemiChemi** (IoT oxygen monitoring platform preventing fish kills for Lake Victoria farmers).
- **Core Market Positioning**:
  > *"We don't just write code; we build battle-tested, high-converting payment engines and fintech platforms that collect money across East African currencies and settle in Bitcoin or fiat in under a second. Built by a dedicated 4-person Bitcoin syndicate who treat zero downtime and sound money as the only acceptable standards."*

### 1.2 The Altradits Syndicate (4-Developer Unit Model)
Forged at the Addis Ababa Lightning Developer Bootcamp sponsored by Btrust, Altradits operates as an elite, high-velocity unit. Clients hire an all-in-one product squad that delivers from UI/UX design to bank-grade infrastructure for less than the cost of a single in-house engineer.

| Role | Syndicate Seat | Core Responsibilities |
| :--- | :--- | :--- |
| **Stanley Chege Thuita** | **Lead Architect & Fintech Specialist** | System Architecture, Payment Gateways (M-Pesa, Telebirr, EVC Plus, Stripe), Lightning/Bitcoin Rails, Core Go Backend, Security & Compliance |
| **Syndicate Engineer 1** | **Principal Frontend & Interactive UI Engineer** | Next.js/React, Glassmorphism, Micro-Animations, 60fps Mobile Performance, Conversion UX |
| **Syndicate Engineer 2** | **Cloud DevOps & Infrastructure Lead** | Docker/Kubernetes, CI/CD, AWS/GCP/Render, Database Replication, Webhook Reliability, DDoS Defense |
| **Syndicate Engineer 3** | **Headless Commerce & CMS/WordPress Specialist** | Custom WordPress/WooCommerce Plugins, Headless Shopify, Jamstack Migrations, 0.4s Checkout Engines |

---

## 2. Extracted Design System (Derived from YeboBank)

This portfolio leverages the high-trust, luxury-meets-fintech aesthetic of YeboBank: deep obsidian/forest backgrounds, tactile 3D gold and emerald accents, frosted glassmorphic navigation capsules, and kinetic editorial typography.

### 2.1 Design Tokens & CSS Variables

```css
:root {
  /* Surface & Base */
  --al-ink: #040C07;
  --al-obsidian: #071911;
  --al-surface-dark: rgba(10, 26, 18, 0.75);
  --al-surface-light: rgba(255, 255, 255, 0.85);
  --al-card-bg: rgba(255, 255, 255, 0.04);
  
  /* Brand Accents */
  --al-forest: #0A3020;
  --al-forest-mid: #1A5C3C;
  --al-emerald: #1CB460;
  --al-lime: #96C244;
  --al-gold: #D4A018;
  --al-gold-bright: #F0CC58;
  --al-gold-deep: #8A5E08;
  --al-terra: #BC5016;

  /* Typography Colors */
  --al-text-primary: #F0EDE6;
  --al-text-muted: rgba(240, 237, 230, 0.72);
  --al-text-soft: rgba(240, 237, 230, 0.45);
  --al-text-dark: #071911;

  /* Borders & Glass Dividers */
  --al-glass-border: rgba(255, 255, 255, 0.12);
  --al-glass-border-highlight: rgba(255, 255, 255, 0.25);
  --al-glass-glow: rgba(240, 204, 88, 0.15);

  /* Typography Families */
  --font-display: 'Playfair Display', Georgia, serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Shadows & Depth */
  --al-shadow-capsule: 0 16px 40px -6px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.15);
  --al-shadow-gold-btn: 0 3px 12px rgba(212, 160, 24, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.45);
  --al-shadow-gold-hover: 0 6px 20px rgba(212, 160, 24, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
```

---

## 3. Component Architecture: Floating Navbar & Dynamic Hero

### 3.1 Glassmorphic Capsule Navbar (`SiteNav.tsx`)

A floating pill-shaped capsule pinned 14px from the viewport top with frosted backdrop-filter, responsive mobile drawer, and direct interactive action launchers.

```tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export interface NavActionItem {
  id: string;
  label: string;
  action: "modal" | "scroll" | "link";
  target: string;
  badge?: string;
}

const PORTFOLIO_NAV_ITEMS: NavActionItem[] = [
  { id: "mission", label: "Our Mission", action: "scroll", target: "#mission" },
  { id: "products", label: "Flagship Products", action: "scroll", target: "#products", badge: "YeboBank" },
  { id: "packages", label: "Turnkey Packages", action: "scroll", target: "#packages", badge: "Fixed Price" },
  { id: "payments", label: "Payment Rails", action: "modal", target: "payment-playground" },
  { id: "syndicate", label: "The Syndicate", action: "scroll", target: "#syndicate" },
  { id: "bitdevs", label: "BitDevs Kisumu", action: "scroll", target: "#bitdevs" },
];

export default function AltraditsNav({ onOpenLeadModal }: { onOpenLeadModal: (pkg?: string) => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`al-nav ${scrolled ? "al-nav-scrolled" : ""}`}>
      <div className="al-nav-wrap">
        {/* Brand Mark & Identity */}
        <Link href="/" className="al-brand">
          <div className="al-logo-glyph">
            <span className="al-glyph-symbol">⚡</span>
          </div>
          <div className="al-brand-text-wrap">
            <span className="al-brand-name">Altradits</span>
            <span className="al-brand-sub">Fintech & Bitcoin Studio</span>
          </div>
        </Link>

        {/* Desktop Verb Navigation Links */}
        <div className="al-navlinks">
          {PORTFOLIO_NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={item.action === "scroll" ? item.target : undefined}
              onClick={(e) => {
                if (item.action === "modal") {
                  e.preventDefault();
                  onOpenLeadModal(item.target);
                }
              }}
              className="al-nav-link"
            >
              {item.label}
              {item.badge && <span className="al-nav-badge">{item.badge}</span>}
            </a>
          ))}
        </div>

        {/* Action CTAs */}
        <div className="al-navactions">
          <button
            type="button"
            className="al-btn-gold-pill"
            onClick={() => onOpenLeadModal("instant-quote")}
          >
            <span>⚡ Book 1-Week Sprint</span>
          </button>
          
          <button
            type="button"
            className="al-mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
          >
            <span className="al-toggle-line" />
            <span className="al-toggle-line" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="al-mobile-drawer">
          <div className="al-mobile-links">
            {PORTFOLIO_NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={item.target}
                onClick={() => setMobileOpen(false)}
                className="al-mobile-link-item"
              >
                <span>{item.label}</span>
                <span className="al-arrow">→</span>
              </a>
            ))}
          </div>
          <button
            className="al-btn-gold-block"
            onClick={() => {
              setMobileOpen(false);
              onOpenLeadModal("instant-quote");
            }}
          >
            ⚡ Start 2-Click Lead Scope
          </button>
        </div>
      )}
    </nav>
  );
}
```

---

### 3.2 Dynamic Verb-Cycling Hero Section (`Hero.tsx`)

```tsx
"use client";

import React, { useState, useEffect } from "react";

interface HeroScene {
  id: string;
  verb: string;
  accentClass: "gold" | "grn" | "terra";
  tagline: string;
  subheadline: string;
  ctaText: string;
  packageType: string;
}

const HERO_SCENES: HeroScene[] = [
  {
    id: "bridge",
    verb: "Bridge.",
    accentClass: "gold",
    tagline: "EAST AFRICA BITCOIN HIGHWAY · KE · ET · SO",
    subheadline: "We engineer high-throughput payment corridors connecting M-Pesa 🇰🇪, Telebirr 🇪🇹, and EVC Plus 🇸🇴 into instant Bitcoin Lightning liquidity.",
    ctaText: "⚡ Lock In Payment Sprint",
    packageType: "payment-rails",
  },
  {
    id: "empower",
    verb: "Empower.",
    accentClass: "grn",
    tagline: "SELF-FUNDING OPEN-SOURCE BITCOIN BUILDERS",
    subheadline: "Stanley Chege Thuita & the 4-engineer Btrust Addis bootcamp syndicate: delivering world-class client apps to self-fund our Bitcoin Core & LND mastery.",
    ctaText: "⚡ Hire The Syndicate",
    packageType: "full-syndicate",
  },
  {
    id: "accelerate",
    verb: "Accelerate.",
    accentClass: "gold",
    tagline: "HIGH-CONVERTING 0.4S CHECKOUT ENGINES",
    subheadline: "Eliminate checkout abandonment with custom WooCommerce & Headless payment plugins built for zero transaction loss.",
    ctaText: "⚡ Deploy Checkout Engine",
    packageType: "woocommerce-speed",
  },
];

export default function AltraditsHero({ onLaunchEstimator }: { onLaunchEstimator: (pkg: string) => void }) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % HERO_SCENES.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  const current = HERO_SCENES[activeIdx];

  return (
    <header className="al-hero-stage">
      <div className="al-hero-wrap">
        <div className="al-hero-stage-content">
          <div className="al-hero-kicker" key={`kicker-${current.id}`}>
            <span className="al-kicker-dot" />
            <span>{current.tagline}</span>
          </div>

          <h1 className="al-hero-verb-h" key={current.id}>
            <span className={`al-hero-verb-word ${current.accentClass}`}>
              {current.verb}
            </span>
          </h1>

          <p className="al-hero-sub" key={`sub-${current.id}`}>
            {current.subheadline}
          </p>

          <div className="al-hero-cta-group">
            <button
              type="button"
              className="al-btn-primary-gold"
              onClick={() => onLaunchEstimator(current.packageType)}
            >
              {current.ctaText}
            </button>
            <a href="#products" className="al-btn-ghost-pill">
              Explore Our Products (YeboBank &amp; ChemiChemi) →
            </a>
          </div>

          <div className="al-hero-trust-bar">
            <div className="al-trust-item">
              <span className="al-trust-stat">4 Devs</span>
              <span className="al-trust-label">Btrust Bootcamp Syndicate</span>
            </div>
            <div className="al-trust-divider" />
            <div className="al-trust-item">
              <span className="al-trust-stat">3 Countries</span>
              <span className="al-trust-label">Kenya · Ethiopia · Somalia</span>
            </div>
            <div className="al-trust-divider" />
            <div className="al-trust-item">
              <span className="al-trust-stat">BitDevs KSM</span>
              <span className="al-trust-label">Co-Founder &amp; Host</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
```

---

## 4. The 4 Packaged Turnkey Products (Fixed-Price Sprints)

1. **Cross-Border PayKit (M-Pesa + Telebirr + Lightning Unified)**: (7 Days · $2,500 / 0.038 BTC) Complete gateway connecting Safaricom M-Pesa, Telebirr, and Lightning Network with automated webhooks and reconciliation.
2. **Fintech MVP in a Box (Custodial / Multi-Sig Core)**: (21 Days · $6,800 / 0.10 BTC) Next.js frontend, Go microservice, double-entry ledger, KYC modules, and multi-currency wallets.
3. **WooCommerce / WordPress Hyper-Speed Checkout Engine**: (5 Days · $1,450 / 0.022 BTC) 0.4s 1-Click checkout skipping slow cart steps, reducing abandonment by 42%.
4. **Enterprise Treasury & Chama Multi-Sig Vault**: (14 Days · $4,900 / 0.075 BTC) 2-of-3 Bitcoin multi-sig contracts, daily automated treasury sweeps, and compliant reporting.

---

## 5. The 2-Click Lead Qualification Engine (`LeadModal.tsx`)

- **Click 1**: Client specifies required payment corridors, sprint timeline, and budget tier.
- **Click 2**: Client enters WhatsApp / Direct Phone and clicks **"⚡ Transmit Brief & Open WhatsApp Chat"** — generates a pre-formatted technical brief directly to Stanley Chege Thuita.

---

## 6. Multi-Rail Payment Stack: M-Pesa, Telebirr, EVC Plus & Lightning

Supports real-time invoicing and escrow settlement across:
- **Bitcoin Lightning Network**: LNURL-Pay, WebLN, BTCPay Server, Satoshis.
- **East African Mobile Money**: Safaricom M-Pesa (Kenya 🇰🇪), Ethio Telecom Telebirr (Ethiopia 🇪🇹), Hormuud EVC Plus (Somalia 🇸🇴).
- **Global Card & Banking**: Stripe, Wise, SEPA / ACH wire.
- **Escrow Guarantees**: 50% milestone deposits held in on-chain or legal escrow released upon verifiable client sign-off.
