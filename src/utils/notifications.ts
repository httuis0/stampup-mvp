// ============================================================
// Notification Utility & In-App Activity Engine
// Manages real-time notifications for customer requests,
// reward milestones, offline syncs, and security alerts.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { playNotificationFeedback } from './feedback';

export type NotificationType =
  | 'request'
  | 'reward'
  | 'stamp'
  | 'vip'
  | 'customer'
  | 'offline_sync'
  | 'security'
  | 'system';

export interface AppNotification {
  id: string;
  shopId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO string
  read: boolean;
  metadata?: {
    phone?: string;
    stamps?: number;
    rewardText?: string;
    requestId?: string;
    [key: string]: any;
  };
}

const STORAGE_PREFIX = '@stampup_notifs_';

// In-memory listeners for real-time reactivity
type NotificationListener = (notifs: AppNotification[]) => void;
type ToastListener = (notif: AppNotification) => void;

const listenersMap = new Map<string, Set<NotificationListener>>();
const toastListeners = new Set<ToastListener>();

/**
 * Fetch all notifications for a specific shop
 */
export async function getNotifications(shopId: string): Promise<AppNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${shopId}`);
    if (!raw) return [];
    return JSON.parse(raw) as AppNotification[];
  } catch (e) {
    console.error('Failed to get notifications:', e);
    return [];
  }
}

/**
 * Save notifications list for a specific shop
 */
export async function saveNotifications(shopId: string, notifs: AppNotification[]): Promise<void> {
  try {
    // Keep last 80 notifications
    const trimmed = notifs.slice(0, 80);
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${shopId}`, JSON.stringify(trimmed));
    emitUpdate(shopId, trimmed);
  } catch (e) {
    console.error('Failed to save notifications:', e);
  }
}

/**
 * Add a new notification and trigger audio/haptic feedback and toast banner
 */
export async function addNotification(
  notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>
): Promise<AppNotification> {
  const newNotif: AppNotification = {
    ...notif,
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };

  try {
    const current = await getNotifications(notif.shopId);

    // Prevent duplicate request notifications for same request ID
    if (newNotif.metadata?.requestId) {
      const exists = current.some((n) => n.metadata?.requestId === newNotif.metadata?.requestId);
      if (exists) return newNotif;
    }

    const updated = [newNotif, ...current];
    await saveNotifications(notif.shopId, updated);

    // Trigger double-chime feedback
    playNotificationFeedback();

    // Broadcast toast to banner listener
    toastListeners.forEach((fn) => fn(newNotif));
  } catch (e) {
    console.error('Failed to add notification:', e);
  }

  return newNotif;
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(shopId: string, id: string): Promise<void> {
  try {
    const current = await getNotifications(shopId);
    const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
    await saveNotifications(shopId, updated);
  } catch (e) {
    console.error('Failed to mark notification as read:', e);
  }
}

/**
 * Mark all notifications as read for a shop
 */
export async function markAllNotificationsAsRead(shopId: string): Promise<void> {
  try {
    const current = await getNotifications(shopId);
    const updated = current.map((n) => ({ ...n, read: true }));
    await saveNotifications(shopId, updated);
  } catch (e) {
    console.error('Failed to mark all as read:', e);
  }
}

/**
 * Clear all notifications for a shop
 */
export async function clearAllNotifications(shopId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${shopId}`);
    emitUpdate(shopId, []);
  } catch (e) {
    console.error('Failed to clear notifications:', e);
  }
}

/**
 * Get count of unread notifications
 */
export async function getUnreadNotificationCount(shopId: string): Promise<number> {
  try {
    const current = await getNotifications(shopId);
    return current.filter((n) => !n.read).length;
  } catch {
    return 0;
  }
}

/**
 * Subscribe to notification updates for a shop
 */
export function subscribeToNotifications(
  shopId: string,
  callback: NotificationListener
): () => void {
  if (!listenersMap.has(shopId)) {
    listenersMap.set(shopId, new Set());
  }
  listenersMap.get(shopId)!.add(callback);

  // Initial push
  getNotifications(shopId).then(callback);

  return () => {
    listenersMap.get(shopId)?.delete(callback);
  };
}

/**
 * Subscribe to global in-app toast alerts
 */
export function subscribeToToast(callback: ToastListener): () => void {
  toastListeners.add(callback);
  return () => {
    toastListeners.delete(callback);
  };
}

function emitUpdate(shopId: string, notifs: AppNotification[]) {
  const set = listenersMap.get(shopId);
  if (set) {
    set.forEach((fn) => fn(notifs));
  }
}

/**
 * Sync recent Supabase activity (rewards & new customers) into notification history if missing
 */
export async function syncRecentActivityToNotifications(
  shopId: string,
  shopName: string,
  rewardText: string
): Promise<void> {
  try {
    const current = await getNotifications(shopId);

    // If notifications already populated, don't re-seed
    if (current.length > 0) return;

    // Fetch last 5 rewards
    const { data: rewards } = await supabase
      .from('rewards')
      .select('id, created_at, customer_id')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (rewards && rewards.length > 0) {
      const seeded: AppNotification[] = rewards.map((r) => ({
        id: `seeded_${r.id}`,
        shopId,
        type: 'reward',
        title: '🎉 Free Reward Redeemed',
        message: `Customer redeemed a free ${rewardText} at ${shopName}`,
        timestamp: r.created_at,
        read: true,
      }));

      // Add a welcome system notification
      seeded.push({
        id: `welcome_${shopId}`,
        shopId,
        type: 'system',
        title: '🌟 Notification System Active',
        message: `Welcome to ${shopName}! You'll receive real-time alerts for customer requests, rewards, and syncs here.`,
        timestamp: new Date().toISOString(),
        read: false,
      });

      await saveNotifications(shopId, seeded);
    } else {
      // Seed welcome notification
      await addNotification({
        shopId,
        type: 'system',
        title: '🌟 Notification System Active',
        message: `Welcome to ${shopName}! You will receive live alerts when customers request stamps, earn rewards, or join.`,
      });
    }
  } catch (e) {
    console.error('Error syncing activity to notifications:', e);
  }
}
