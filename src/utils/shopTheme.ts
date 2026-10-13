// ============================================================
// Shop Theme & Custom Stamp Icon Utility
// Supports custom stamp icons (Coffee, Boba, Bakery, Barber, etc.)
// with local persistence and cross-screen reactivity.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export interface StampThemeOption {
  id: string;
  label: string;
  icon: string;
  color: string;
  category: string;
}

export const STAMP_THEMES: StampThemeOption[] = [
  { id: 'star', label: 'Classic Star', icon: '⭐', color: '#2563EB', category: 'General' },
  { id: 'coffee', label: 'Coffee & Cafe', icon: '☕', color: '#78350F', category: 'Cafe' },
  { id: 'boba', label: 'Boba & Tea', icon: '🧋', color: '#9333EA', category: 'Tea' },
  { id: 'bakery', label: 'Bakery & Pastry', icon: '🥐', color: '#D97706', category: 'Bakery' },
  { id: 'burger', label: 'Burgers & Diner', icon: '🍔', color: '#DC2626', category: 'Dining' },
  { id: 'pizza', label: 'Pizza & Italian', icon: '🍕', color: '#E11D48', category: 'Dining' },
  { id: 'icecream', label: 'Ice Cream & Dessert', icon: '🍦', color: '#EC4899', category: 'Dessert' },
  { id: 'salon', label: 'Salon & Barber', icon: '✂️', color: '#0F766E', category: 'Services' },
];

export const DEFAULT_THEME = STAMP_THEMES[0];

const STORAGE_PREFIX = '@stampup_shop_theme_';
type ThemeChangeListener = (theme: StampThemeOption) => void;
const listeners = new Map<string, Set<ThemeChangeListener>>();

export function getThemeById(themeId?: string | null): StampThemeOption {
  if (!themeId) return DEFAULT_THEME;
  const found = STAMP_THEMES.find((t) => t.id === themeId || t.icon === themeId);
  return found || DEFAULT_THEME;
}

export async function getShopTheme(shopId: string, shopFallbackIcon?: string | null): Promise<StampThemeOption> {
  try {
    const cached = await AsyncStorage.getItem(`${STORAGE_PREFIX}${shopId}`);
    if (cached) {
      return getThemeById(cached);
    }
  } catch (e) {
    console.warn('Failed to load cached shop theme:', e);
  }

  if (shopFallbackIcon) {
    return getThemeById(shopFallbackIcon);
  }

  return DEFAULT_THEME;
}

export async function saveShopTheme(shopId: string, themeId: string): Promise<StampThemeOption> {
  const selectedTheme = getThemeById(themeId);

  // 1. Save in local cache
  try {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${shopId}`, selectedTheme.id);
  } catch (e) {
    console.warn('Failed to save shop theme locally:', e);
  }

  // 2. Try saving to Supabase if column exists
  try {
    await supabase
      .from('shops')
      .update({ stamp_icon: selectedTheme.icon } as any)
      .eq('id', shopId);
  } catch (e) {
    // Graceful fallback if column doesn't exist
  }

  // 3. Notify active listeners
  const shopListeners = listeners.get(shopId);
  if (shopListeners) {
    shopListeners.forEach((fn) => fn(selectedTheme));
  }

  return selectedTheme;
}

export function subscribeToShopTheme(
  shopId: string,
  listener: ThemeChangeListener
): () => void {
  if (!listeners.has(shopId)) {
    listeners.set(shopId, new Set());
  }
  listeners.get(shopId)!.add(listener);

  // Initial emit
  getShopTheme(shopId).then(listener);

  return () => {
    listeners.get(shopId)?.delete(listener);
  };
}
