import { api } from './altraditsWallet';

export interface CardOrder {
  redirectUrl: string;
  trackingId: string;
  satsAmount: number;
  kes: number;
}

// Starts a card or bank top-up: the server quotes shillings to sats and the
// provider answers with its secure checkout page. Card details never touch us.
export async function orderCardTopup(kes: number, email: string): Promise<CardOrder> {
  return api<CardOrder>('POST', 'card/order', { kes, email });
}

export interface CardTopupState {
  state: 'paid' | 'pending' | 'failed';
  paid: boolean;
  satsAmount: number;
}

// Asks the server, which asks the provider: paid only on an explicit Completed.
export async function cardTopupStatus(trackingId: string): Promise<CardTopupState> {
  return api<CardTopupState>('GET', `card/status/${encodeURIComponent(trackingId)}`);
}
