export interface ThemeTokens {
  bgRoot: string;
  bgNav: string;
  bgSurface: string;
  bgInput: string;
  bgTabActive: string;
  bgButtonNeutral: string;
  borderSubtle: string;
  borderModal: string;
  borderInteractive: string;
  accentPrimary: string;
  accentPrimaryHover: string;
  accentSecondary: string;
  accentSecondaryHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  statusSuccess: string;
  statusError: string;
}

export interface BrandPalette {
  id: string;
  name: string;
  tagline: string;
  tokens: ThemeTokens;
}

export const PALETTES: Record<string, BrandPalette> = {
  obsidianPlum: {
    id: 'obsidianPlum',
    name: 'Obsidian Plum',
    tagline: 'Default Stan Style - Royal Violet and Muted Wine on Deep Obsidian',
    tokens: {
      bgRoot: '#120E16',
      bgNav: '#16101D',
      bgSurface: '#1D1627',
      bgInput: '#140E1B',
      bgTabActive: '#2E203C',
      bgButtonNeutral: '#231A2D',
      borderSubtle: '#382B44',
      borderModal: '#3A2D47',
      borderInteractive: '#3C2E49',
      accentPrimary: '#763698',
      accentPrimaryHover: '#8A41B0',
      accentSecondary: '#946069',
      accentSecondaryHover: '#A96E78',
      textPrimary: '#F8F0E7',
      textSecondary: '#D1B9B3',
      textMuted: '#9B97A2',
      textDisabled: '#554653',
      statusSuccess: '#34D399',
      statusError: '#F87171',
    },
  },
  solarAmber: {
    id: 'solarAmber',
    name: 'Solar Amber',
    tagline: 'Bitcoin Standard - Gold and Bronze on Deep Charcoal',
    tokens: {
      bgRoot: '#0E0D0B',
      bgNav: '#171410',
      bgSurface: '#1F1B14',
      bgInput: '#14110D',
      bgTabActive: '#332712',
      bgButtonNeutral: '#241F16',
      borderSubtle: '#3A3022',
      borderModal: '#473B28',
      borderInteractive: '#52432D',
      accentPrimary: '#D97706',
      accentPrimaryHover: '#F59E0B',
      accentSecondary: '#B45309',
      accentSecondaryHover: '#D97706',
      textPrimary: '#FFFDF8',
      textSecondary: '#E6D7B5',
      textMuted: '#A39882',
      textDisabled: '#5C5443',
      statusSuccess: '#34D399',
      statusError: '#F87171',
    },
  },
  kigaliEmerald: {
    id: 'kigaliEmerald',
    name: 'Kigali Emerald',
    tagline: 'African Mobile Rails - Deep Jade and Emerald on Dark Pine',
    tokens: {
      bgRoot: '#09120E',
      bgNav: '#0D1A14',
      bgSurface: '#13231B',
      bgInput: '#0B1712',
      bgTabActive: '#1A382A',
      bgButtonNeutral: '#162B21',
      borderSubtle: '#234434',
      borderModal: '#2B523F',
      borderInteractive: '#33614A',
      accentPrimary: '#059669',
      accentPrimaryHover: '#10B981',
      accentSecondary: '#0D9488',
      accentSecondaryHover: '#14B8A6',
      textPrimary: '#F0FDF4',
      textSecondary: '#A7F3D0',
      textMuted: '#81A392',
      textDisabled: '#466355',
      statusSuccess: '#34D399',
      statusError: '#F87171',
    },
  },
  nileSlate: {
    id: 'nileSlate',
    name: 'Nile Slate',
    tagline: 'Institutional Settlement - Steel and Cobalt on Midnight',
    tokens: {
      bgRoot: '#0A0F17',
      bgNav: '#0E1621',
      bgSurface: '#15202E',
      bgInput: '#0D141E',
      bgTabActive: '#1B2E45',
      bgButtonNeutral: '#172536',
      borderSubtle: '#263B54',
      borderModal: '#2E4765',
      borderInteractive: '#375477',
      accentPrimary: '#2563EB',
      accentPrimaryHover: '#3B82F6',
      accentSecondary: '#0284C7',
      accentSecondaryHover: '#38BDF8',
      textPrimary: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#8E9FB5',
      textDisabled: '#51637A',
      statusSuccess: '#34D399',
      statusError: '#F87171',
    },
  },
};

const STORAGE_KEY = 'yebente_palette_id';

export function getSavedPaletteId(): string {
  if (typeof window === 'undefined') return 'obsidianPlum';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && PALETTES[saved]) return saved;
  return 'obsidianPlum';
}

export function savePaletteId(id: string): void {
  if (typeof window === 'undefined') return;
  if (PALETTES[id]) {
    localStorage.setItem(STORAGE_KEY, id);
    applyPalette(id);
  }
}

export const DEFAULT_PALETTE_ID = 'obsidianPlum';
export const DEFAULT_PALETTE = PALETTES.obsidianPlum;

export function applyPalette(id?: string): void {
  if (typeof document === 'undefined') return;
  const palette = (id && PALETTES[id]) || PALETTES.obsidianPlum;
  const root = document.documentElement;
  const t = palette.tokens;

  root.style.setProperty('--bg-root', t.bgRoot);
  root.style.setProperty('--bg-nav', t.bgNav);
  root.style.setProperty('--bg-surface', t.bgSurface);
  root.style.setProperty('--bg-input', t.bgInput);
  root.style.setProperty('--bg-tab-active', t.bgTabActive);
  root.style.setProperty('--bg-button-neutral', t.bgButtonNeutral);
  root.style.setProperty('--border-subtle', t.borderSubtle);
  root.style.setProperty('--border-modal', t.borderModal);
  root.style.setProperty('--border-interactive', t.borderInteractive);
  root.style.setProperty('--accent-primary', t.accentPrimary);
  root.style.setProperty('--accent-primary-hover', t.accentPrimaryHover);
  root.style.setProperty('--accent-secondary', t.accentSecondary);
  root.style.setProperty('--accent-secondary-hover', t.accentSecondaryHover);
  root.style.setProperty('--text-primary', t.textPrimary);
  root.style.setProperty('--text-secondary', t.textSecondary);
  root.style.setProperty('--text-muted', t.textMuted);
  root.style.setProperty('--text-disabled', t.textDisabled);
  root.style.setProperty('--status-success', t.statusSuccess);
  root.style.setProperty('--status-error', t.statusError);
}

// Automatically apply the brand kit palette on load
if (typeof document !== 'undefined') {
  applyPalette(getSavedPaletteId());
}
