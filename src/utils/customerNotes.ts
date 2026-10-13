// ============================================================
// Customer Notes & VIP Status Utility
// Local persistent notes per shop + VIP badge rules.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Customer } from '../types';

const STORAGE_KEY_PREFIX = '@stampup_customer_notes_';

/**
 * VIP Status Calculation:
 * A customer is VIP if they have redeemed at least 1 reward
 * OR have accumulated 5 or more stamps.
 */
export const isVipCustomer = (customer?: Partial<Customer> | null): boolean => {
  if (!customer) return false;
  return (customer.rewards_given || 0) >= 1 || (customer.current_stamps || 0) >= 5;
};

/**
 * Normalize phone string into clean digit key for consistent map lookups.
 */
export const cleanPhoneKey = (phone: string): string => {
  return (phone || '').replace(/[^0-9]/g, '');
};

/**
 * Retrieve a customer note for a specific shop and customer phone.
 */
export const getCustomerNote = async (shopId: string, phone: string): Promise<string> => {
  try {
    const key = `${STORAGE_KEY_PREFIX}${shopId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return '';
    const map = JSON.parse(raw);
    return map[cleanPhoneKey(phone)] || '';
  } catch {
    return '';
  }
};

/**
 * Save or update a note for a customer. Passing an empty string removes the note.
 */
export const saveCustomerNote = async (
  shopId: string,
  phone: string,
  note: string
): Promise<void> => {
  try {
    const key = `${STORAGE_KEY_PREFIX}${shopId}`;
    const raw = await AsyncStorage.getItem(key);
    const map = raw ? JSON.parse(raw) : {};
    const clean = cleanPhoneKey(phone);
    if (note.trim()) {
      map[clean] = note.trim();
    } else {
      delete map[clean];
    }
    await AsyncStorage.setItem(key, JSON.stringify(map));
  } catch (e) {
    console.error('Error saving customer note:', e);
  }
};

/**
 * Retrieve all customer notes for a shop (useful for bulk views/lists).
 */
export const getAllCustomerNotes = async (
  shopId: string
): Promise<Record<string, string>> => {
  try {
    const key = `${STORAGE_KEY_PREFIX}${shopId}`;
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
