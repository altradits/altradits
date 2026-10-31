import { ExchangeRates } from '../types';

// Blink's public price feed (no account, no key): the live BTC price in USD, KES
// and ETB that the app shows next to sats. Ye₿ente's wallets and payments don't
// use Blink at all; they run on the Altradits Lightning node.
const BLINK_GRAPHQL_ENDPOINT = 'https://api.blink.sv/graphql';

interface BlinkPriceData {
  base: number;
  offset: number;
}

interface BlinkRealtimePriceResponse {
  data?: {
    usd?: { btcSatPrice: BlinkPriceData; timestamp: number };
    kes?: { btcSatPrice: BlinkPriceData; timestamp: number };
    etb?: { btcSatPrice: BlinkPriceData; timestamp: number };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Parses Blink btcSatPrice structure (price of 1 sat in minor units: base / 10^offset).
 * Converts from minor units (cents/santim) to major units (/ 100), then multiplies by 10^8 for 1 BTC.
 * Result formula: (base / 10^offset) * 1_000_000
 * Example: base: 85517703125, offset: 12 -> 0.0855177 cents/sat -> 85,517.70 USD per BTC
 */
function parseBlinkBtcPrice(priceObj?: { btcSatPrice: BlinkPriceData }): number {
  if (!priceObj || !priceObj.btcSatPrice) return 0;
  const { base, offset } = priceObj.btcSatPrice;
  if (typeof base !== 'number' || typeof offset !== 'number') return 0;
  const satPriceInMinorUnit = base * Math.pow(10, -offset);
  const satPriceInMajorUnit = satPriceInMinorUnit / 100;
  const btcPrice = satPriceInMajorUnit * 100_000_000;
  return Math.round(btcPrice * 100) / 100;
}

/**
 * Fetches real-time market rates directly from Blink GraphQL API.
 * Queries KES, ETB, and USD realtime prices in a single batch query.
 */
export async function fetchBlinkLiveRates(): Promise<ExchangeRates> {
  const query = `
    query GetBlinkRates {
      usd: realtimePrice(currency: "USD") {
        btcSatPrice {
          base
          offset
        }
        timestamp
      }
      kes: realtimePrice(currency: "KES") {
        btcSatPrice {
          base
          offset
        }
        timestamp
      }
      etb: realtimePrice(currency: "ETB") {
        btcSatPrice {
          base
          offset
        }
        timestamp
      }
    }
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  const res = await fetch(BLINK_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`Blink GraphQL returned HTTP ${res.status}`);
  }

  const json: BlinkRealtimePriceResponse = await res.json();
  if (json.errors && json.errors.length > 0 && !json.data) {
    throw new Error(`Blink GraphQL error: ${json.errors[0].message}`);
  }

  const btcUsd = parseBlinkBtcPrice(json.data?.usd);
  const btcKes = parseBlinkBtcPrice(json.data?.kes);
  const btcEtb = parseBlinkBtcPrice(json.data?.etb);

  if (btcUsd <= 0 || btcKes <= 0 || btcEtb <= 0) {
    throw new Error('Blink API returned invalid or zero price points.');
  }

  const usdKes = Math.round((btcKes / btcUsd) * 100) / 100;
  const usdEtb = Math.round((btcEtb / btcUsd) * 100) / 100;

  return {
    btcUsd,
    btcKes: Math.round(btcKes),
    btcEtb: Math.round(btcEtb),
    usdKes,
    usdEtb,
    change24hUsd: 0,
    change24hKes: 0,
    change24hEtb: 0,
    lastUpdated: Date.now(),
    isLive: true,
    source: 'blink',
  };
}
