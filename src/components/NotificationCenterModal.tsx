// ============================================================
// Notification Center Modal
// Full-screen / Bottom sheet feed of recent activity, alerts,
// stamp requests, and reward milestones.
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  AppNotification,
  NotificationType,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
} from '../utils/notifications';
import type { StampRequest } from '../types';

interface NotificationCenterModalProps {
  visible: boolean;
  shopId: string;
  notifications: AppNotification[];
  onClose: () => void;
  onRequestSelect?: (requestId: string) => void;
  pendingRequests?: StampRequest[];
  onResolveRequest?: (requestId: string, action: 'accept' | 'reject') => Promise<void>;
  resolvingId?: string | null;
}

type FilterCategory = 'all' | 'reward' | 'request' | 'alerts';

// Relative timestamp helper
const formatRelativeTime = (isoString: string): string => {
  try {
    const now = Date.now();
    const past = new Date(isoString).getTime();
    const diffSec = Math.floor((now - past) / 1000);

    if (diffSec < 45) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return 'Yesterday';

    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recent';
  }
};

const getBadgeConfig = (type: NotificationType): { icon: string; bg: string; text: string } => {
  switch (type) {
    case 'reward':
      return { icon: '🎁', bg: '#DCFCE7', text: '#15803D' };
    case 'request':
      return { icon: '🔔', bg: '#DBEAFE', text: '#1D4ED8' };
    case 'stamp':
      return { icon: '☕', bg: '#EEF2FF', text: '#4338CA' };
    case 'vip':
      return { icon: '⭐', bg: '#F3E8FF', text: '#7E22CE' };
    case 'customer':
      return { icon: '👤', bg: '#E0F2FE', text: '#0369A1' };
    case 'offline_sync':
      return { icon: '📴', bg: '#CCFBF1', text: '#0F766E' };
    case 'security':
      return { icon: '🛡️', bg: '#FEF3C7', text: '#B45309' };
    default:
      return { icon: '✨', bg: '#F1F5F9', text: '#334155' };
  }
};

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  visible,
  shopId,
  notifications,
  onClose,
  onRequestSelect,
  pendingRequests,
  onResolveRequest,
  resolvingId,
}) => {
  const [filter, setFilter] = useState<FilterCategory>('all');

  const unreadCount = useMemo(() => {
    const unreadNotifs = notifications.filter((n) => !n.read).length;
    const reqCount = pendingRequests?.length || 0;
    return unreadNotifs + reqCount;
  }, [notifications, pendingRequests]);

  // Filter notifications based on active tab
  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'reward') return notifications.filter((n) => n.type === 'reward');
    if (filter === 'request') return notifications.filter((n) => n.type === 'request');
    if (filter === 'alerts') {
      return notifications.filter((n) =>
        ['security', 'offline_sync', 'system'].includes(n.type)
      );
    }
    return notifications;
  }, [notifications, filter]);

  const handleItemPress = (notif: AppNotification) => {
    if (!notif.read) {
      markNotificationAsRead(shopId, notif.id);
    }

    // If it's a stamp request, notify parent
    if (notif.type === 'request' && notif.metadata?.requestId && onRequestSelect) {
      onClose();
      onRequestSelect(notif.metadata.requestId);
    }
  };

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead(shopId);
  };

  const handleClearAll = () => {
    clearAllNotifications(shopId);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Notifications</Text>
              {unreadCount > 0 && (
                <View style={styles.unreadChip}>
                  <Text style={styles.unreadChipText}>{unreadCount} new</Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Actions Toolbar */}
          <View style={styles.actionsBar}>
            {/* Filter Tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterTabsRow}
            >
              <TouchableOpacity
                style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
                onPress={() => setFilter('all')}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    filter === 'all' && styles.filterTabTextActive,
                  ]}
                >
                  All ({notifications.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterTab, filter === 'reward' && styles.filterTabActive]}
                onPress={() => setFilter('reward')}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    filter === 'reward' && styles.filterTabTextActive,
                  ]}
                >
                  🎁 Rewards
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterTab, filter === 'request' && styles.filterTabActive]}
                onPress={() => setFilter('request')}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    filter === 'request' && styles.filterTabTextActive,
                  ]}
                >
                  🔔 Requests
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterTab, filter === 'alerts' && styles.filterTabActive]}
                onPress={() => setFilter('alerts')}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    filter === 'alerts' && styles.filterTabTextActive,
                  ]}
                >
                  ⚡ Alerts
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Quick Action Icons */}
            <View style={styles.toolsRow}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  style={styles.actionToolBtn}
                  onPress={handleMarkAllRead}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionToolText}>✓✓ Mark read</Text>
                </TouchableOpacity>
              )}
              {notifications.length > 0 && (
                <TouchableOpacity
                  style={styles.actionToolBtn}
                  onPress={handleClearAll}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionToolText, { color: '#EF4444' }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Notification List & Counter Requests */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Live Counter Requests Block (if pending) */}
            {pendingRequests && pendingRequests.length > 0 && (filter === 'all' || filter === 'request') && (
              <View style={styles.liveRequestsSection}>
                <View style={styles.liveRequestsHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveRequestsTitle}>
                      Counter Requests ({pendingRequests.length})
                    </Text>
                  </View>
                </View>

                {pendingRequests.map((req) => (
                  <View key={req.id} style={styles.requestCard}>
                    <View style={styles.requestAvatarCircle}>
                      <Text style={styles.requestAvatarText}>
                        {(req.customer_name ? req.customer_name.slice(0, 2) : req.phone.slice(-2)).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.requestInfo}>
                      {req.customer_name ? (
                        <Text style={styles.requestCustomerName} numberOfLines={1}>
                          {req.customer_name}
                        </Text>
                      ) : null}
                      <Text style={styles.requestPhoneText}>{req.phone}</Text>
                      <Text style={styles.requestTimeText}>{formatRelativeTime(req.created_at)}</Text>
                    </View>

                    {onResolveRequest && (
                      <View style={styles.requestActionBtns}>
                        <TouchableOpacity
                          style={[styles.rejectBtn, resolvingId === req.id && { opacity: 0.5 }]}
                          onPress={() => onResolveRequest(req.id, 'reject')}
                          disabled={resolvingId === req.id}
                        >
                          <Text style={styles.rejectBtnText}>✕</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.acceptBtn, resolvingId === req.id && { opacity: 0.5 }]}
                          onPress={() => onResolveRequest(req.id, 'accept')}
                          disabled={resolvingId === req.id}
                        >
                          {resolvingId === req.id ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.acceptBtnText}>✓ Accept</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {filteredNotifications.length === 0 && (!pendingRequests || pendingRequests.length === 0) ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>🔕</Text>
                <Text style={styles.emptyStateTitle}>No Notifications</Text>
                <Text style={styles.emptyStateSubtitle}>
                  You're all caught up! Customer stamp requests, rewards, and sync alerts will appear here in real time.
                </Text>
              </View>
            ) : (
              filteredNotifications.map((item) => {
                const badge = getBadgeConfig(item.type);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.notifItem,
                      !item.read && styles.notifItemUnread,
                    ]}
                    onPress={() => handleItemPress(item)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.notifIconContainer,
                        { backgroundColor: badge.bg },
                      ]}
                    >
                      <Text style={styles.notifIcon}>{badge.icon}</Text>
                    </View>

                    <View style={styles.notifBody}>
                      <View style={styles.notifTopRow}>
                        <Text
                          style={[
                            styles.notifTitle,
                            !item.read && styles.notifTitleUnread,
                          ]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Text style={styles.notifTime}>
                          {formatRelativeTime(item.timestamp)}
                        </Text>
                      </View>

                      <Text style={styles.notifMessage} numberOfLines={2}>
                        {item.message}
                      </Text>

                      {item.type === 'request' && !item.read && (
                        <View style={styles.inlineActionHint}>
                          <Text style={styles.inlineActionHintText}>
                            👉 Tap to review counter request
                          </Text>
                        </View>
                      )}
                    </View>

                    {!item.read && <View style={styles.unreadDot} />}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    minHeight: '55%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 25,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  unreadChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  unreadChipText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  actionsBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: 8,
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterTab: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  filterTabActive: {
    backgroundColor: '#0F172A',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 4,
  },
  actionToolBtn: {
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  actionToolText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 10,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  notifItemUnread: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  notifIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notifIcon: {
    fontSize: 18,
  },
  notifBody: {
    flex: 1,
  },
  notifTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
    marginRight: 6,
  },
  notifTitleUnread: {
    color: '#0F172A',
    fontWeight: '800',
  },
  notifTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  notifMessage: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  inlineActionHint: {
    marginTop: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  inlineActionHintText: {
    fontSize: 10,
    color: '#2563EB',
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
    marginLeft: 6,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },
  liveRequestsSection: {
    backgroundColor: '#EFF6FF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  liveRequestsHeader: {
    marginBottom: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  liveRequestsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  requestAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  requestAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  requestInfo: {
    flex: 1,
  },
  requestCustomerName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  requestPhoneText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  requestTimeText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  requestActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rejectBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtnText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 14,
  },
  acceptBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
});
