// ============================================================
// Offline Resilience Utility (Stamp Queue & Auto-Sync)
// Safely queues customer stamps when shop Wi-Fi or mobile
// data drops, and flushes to Supabase once back online.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const QUEUE_STORAGE_KEY = '@stampup_offline_stamps_queue';

export interface QueuedStamp {
  id: string;
  shopId: string;
  phone: string;
  timestamp: number;
  retryCount: number;
}

export interface SyncResult {
  synced: number;
  failed: number;
  remaining: number;
  details: Array<{ phone: string; status: string; message?: string }>;
}

type QueueListener = (queue: QueuedStamp[]) => void;
const listeners = new Set<QueueListener>();

const notifyListeners = (queue: QueuedStamp[]) => {
  listeners.forEach((listener) => {
    try {
      listener(queue);
    } catch (e) {
      console.warn('Queue listener error:', e);
    }
  });
};

/**
 * Check if an error or browser state indicates offline / network loss
 */
export function isNetworkError(error: any): boolean {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (!error) return false;
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection refused') ||
    msg.includes('internet') ||
    msg.includes('offline') ||
    msg.includes('abort') ||
    error?.status === 0 ||
    error?.code === 'NETWORK_ERROR'
  );
}

/**
 * Retrieve all currently pending stamps in local storage
 */
export async function getOfflineQueue(): Promise<QueuedStamp[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to read offline stamp queue:', e);
    return [];
  }
}

/**
 * Add a new stamp to the offline queue
 */
export async function enqueueOfflineStamp(
  shopId: string,
  phone: string
): Promise<QueuedStamp> {
  const newStamp: QueuedStamp = {
    id: `stamp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    shopId,
    phone,
    timestamp: Date.now(),
    retryCount: 0,
  };

  try {
    const currentQueue = await getOfflineQueue();
    const updatedQueue = [...currentQueue, newStamp];
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
    notifyListeners(updatedQueue);
  } catch (e) {
    console.warn('Failed to enqueue offline stamp:', e);
  }

  return newStamp;
}

/**
 * Remove a specific stamp by id
 */
export async function removeQueuedStamp(id: string): Promise<void> {
  try {
    const currentQueue = await getOfflineQueue();
    const updatedQueue = currentQueue.filter((item) => item.id !== id);
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
    notifyListeners(updatedQueue);
  } catch (e) {
    console.warn('Failed to remove queued stamp:', e);
  }
}

/**
 * Clear the entire queue
 */
export async function clearOfflineQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
    notifyListeners([]);
  } catch (e) {
    console.warn('Failed to clear offline queue:', e);
  }
}

/**
 * Subscribe to changes in the offline queue
 */
export function subscribeToOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  // Immediate emission of current state
  getOfflineQueue().then((q) => listener(q));
  return () => {
    listeners.delete(listener);
  };
}

let isSyncing = false;

/**
 * Flush and sync all pending queued stamps to Supabase
 */
export async function processOfflineQueue(targetShopId?: string): Promise<SyncResult> {
  if (isSyncing) {
    const q = await getOfflineQueue();
    return { synced: 0, failed: 0, remaining: q.length, details: [] };
  }

  isSyncing = true;
  const result: SyncResult = {
    synced: 0,
    failed: 0,
    remaining: 0,
    details: [],
  };

  try {
    let queue = await getOfflineQueue();
    if (queue.length === 0) {
      isSyncing = false;
      return result;
    }

    const itemsToProcess = targetShopId
      ? queue.filter((item) => item.shopId === targetShopId)
      : queue;

    const remainingItems: QueuedStamp[] = [];

    for (const item of itemsToProcess) {
      try {
        const { data, error } = await supabase.rpc('add_stamp', {
          p_shop_id: item.shopId,
          p_phone: item.phone,
        });

        if (error) {
          if (isNetworkError(error)) {
            // Still offline - preserve this and remaining items, abort sync loop
            remainingItems.push(item);
            // Append rest of unattempted items
            const currentIndex = itemsToProcess.indexOf(item);
            const untouched = itemsToProcess.slice(currentIndex + 1);
            remainingItems.push(...untouched);
            break;
          }

          // Permanent error (e.g., schema or bad data)
          item.retryCount += 1;
          if (item.retryCount < 3) {
            remainingItems.push(item);
          } else {
            result.failed += 1;
            result.details.push({
              phone: item.phone,
              status: 'dropped',
              message: error.message,
            });
          }
          continue;
        }

        // Successfully sent to cloud
        result.synced += 1;
        result.details.push({
          phone: item.phone,
          status: data?.status || 'ok',
        });
      } catch (err: any) {
        if (isNetworkError(err)) {
          remainingItems.push(item);
          const currentIndex = itemsToProcess.indexOf(item);
          const untouched = itemsToProcess.slice(currentIndex + 1);
          remainingItems.push(...untouched);
          break;
        }

        item.retryCount += 1;
        if (item.retryCount < 3) {
          remainingItems.push(item);
        } else {
          result.failed += 1;
          result.details.push({
            phone: item.phone,
            status: 'dropped',
            message: err?.message,
          });
        }
      }
    }

    // Combine remaining processed items with items for other shops (if filtered)
    const otherShopsItems = targetShopId
      ? queue.filter((item) => item.shopId !== targetShopId)
      : [];

    const finalQueue = [...otherShopsItems, ...remainingItems];
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(finalQueue));
    notifyListeners(finalQueue);

    result.remaining = finalQueue.length;
  } catch (e) {
    console.warn('Error during offline queue sync:', e);
  } finally {
    isSyncing = false;
  }

  return result;
}
