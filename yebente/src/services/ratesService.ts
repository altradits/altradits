import { ExchangeRates } from '../types';
import { fetchBlinkLiveRates } from './blinkService';

const STORAGE_KEY = 'altradits_rates_cache_v2';

/**
 * Returns previously verified live rates from persistent cache if available, or null.
 * Ensures offline transactions and currency conversions continue without network connection.
 */
export function getCachedRates(): ExchangeRates | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as ExchangeRates;
      if (parsed.btcUsd > 0 && parsed.btcKes > 0) {
        return {
          ...parsed,
          isLive: false, // marked as cached
          source: 'cache',
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Saves rates to persistent cache
 */
export function saveCachedRates(rates: ExchangeRates): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // ignore
  }
}

/**
 * Fetches real-time market rates with Blink API as the primary currency conversion engine.
 * Seamlessly falls back to persistent cache when offline or if network issues occur.
 */
export async function fetchLiveRates(): Promise<ExchangeRates> {
  const errors: string[] = [];

  // 1. Primary: Fetch real-time BTC, KES, ETB, and USD rates directly from Blink GraphQL API
  try {
    const blinkRates = await fetchBlinkLiveRates();
    if (blinkRates.btcUsd > 0 && blinkRates.btcKes > 0) {
      const enrichedRates: ExchangeRates = {
        ...blinkRates,
        source: 'blink',
        isLive: true,
      };
      saveCachedRates(enrichedRates);
      return enrichedRates;
    }
  } catch (err: unknown) {
    errors.push(`Blink: ${err instanceof Error ? err.message : 'failed'}`);
  }

  // 2. Secondary fallback: Check persistent cache before external secondary calls if offline
  const cached = getCachedRates();
  if (typeof navigator !== 'undefined' && !navigator.onLine && cached && cached.btcUsd > 0) {
    return cached;
  }

  // 3. Secondary provider: Coinbase Spot + Forex open.er-api.com
  let btcUsd: number | null = null;
  let change24hUsd: number | null = null;
  let usdKes: number | null = null;
  let usdEtb: number | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const cbRes = await fetch('https://api.coinbase.com/v2/prices/spot?currency=USD', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (cbRes.ok) {
      const cbData = await cbRes.json();
      const price = parseFloat(cbData?.data?.amount);
      if (!isNaN(price) && price > 0) {
        btcUsd = price;
      }
    } else {
      errors.push(`Coinbase HTTP ${cbRes.status}`);
    }
  } catch (err: unknown) {
    errors.push(`Coinbase: ${err instanceof Error ? err.message : 'timeout'}`);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      if (fxData?.rates) {
        if (typeof fxData.rates.KES === 'number') {
          usdKes = fxData.rates.KES;
        }
        if (typeof fxData.rates.ETB === 'number') {
          usdEtb = fxData.rates.ETB;
        }
      }
    } else {
      errors.push(`Forex HTTP ${fxRes.status}`);
    }
  } catch (err: unknown) {
    errors.push(`Forex: ${err instanceof Error ? err.message : 'timeout'}`);
  }

  const effectiveUsdKes = usdKes || cached?.usdKes;
  const effectiveUsdEtb = usdEtb || cached?.usdEtb;
  const effectiveChange = change24hUsd !== null ? change24hUsd : (cached?.change24hUsd ?? 0);

  if (btcUsd !== null && btcUsd > 0 && effectiveUsdKes && effectiveUsdEtb) {
    const finalBtcKes = Math.round(btcUsd * effectiveUsdKes);
    const finalBtcEtb = Math.round(btcUsd * effectiveUsdEtb);

    const secondaryRates: ExchangeRates = {
      btcUsd: Math.round(btcUsd * 100) / 100,
      btcKes: finalBtcKes,
      btcEtb: finalBtcEtb,
      usdKes: Math.round(effectiveUsdKes * 100) / 100,
      usdEtb: Math.round(effectiveUsdEtb * 100) / 100,
      change24hUsd: Math.round(effectiveChange * 100) / 100,
      change24hKes: Math.round(effectiveChange * 100) / 100,
      change24hEtb: Math.round(effectiveChange * 100) / 100,
      lastUpdated: Date.now(),
      isLive: true,
      source: 'coinbase',
    };

    saveCachedRates(secondaryRates);
    return secondaryRates;
  }

  // 4. Return cached rates if any provider failed or device is offline
  if (cached && cached.btcUsd > 0) {
    return cached;
  }

  throw new Error(
    `Exchange rates unavailable: Unable to retrieve rates from Blink, Coinbase, or Forex (${errors.join(', ')}). Connect to the internet or configure a rate feed proxy.`
  );
}
