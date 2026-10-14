// ============================================================
// In-App Notification Banner (Toast)
// Pops down animated from top of screen upon new events
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import {
  AppNotification,
  subscribeToToast,
  NotificationType,
} from '../utils/notifications';

interface NotificationBannerProps {
  onPressBanner: () => void;
}

const getNotificationIcon = (type: NotificationType): string => {
  switch (type) {
    case 'reward':
      return '🎁';
    case 'request':
      return '🔔';
    case 'stamp':
      return '☕';
    case 'vip':
      return '⭐';
    case 'customer':
      return '👤';
    case 'offline_sync':
      return '📴';
    case 'security':
      return '🛡️';
    default:
      return '✨';
  }
};

const getNotificationColor = (type: NotificationType): string => {
  switch (type) {
    case 'reward':
      return '#059669'; // Emerald green
    case 'request':
      return '#2563EB'; // Blue
    case 'vip':
      return '#7C3AED'; // Purple
    case 'security':
      return '#D97706'; // Amber
    case 'offline_sync':
      return '#0D9488'; // Teal
    default:
      return '#1E293B';
  }
};

export const NotificationBanner: React.FC<NotificationBannerProps> = ({ onPressBanner }) => {
  const [currentNotif, setCurrentNotif] = useState<AppNotification | null>(null);
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const dismissTimer = useRef<any>(null);

  useEffect(() => {
    const unsubscribe = subscribeToToast((notif) => {
      // Clear any pending dismissal
      if (dismissTimer.current) clearTimeout(dismissTimer.current);

      setCurrentNotif(notif);

      // Slide down
      Animated.spring(slideAnim, {
        toValue: 12,
        tension: 80,
        friction: 9,
        useNativeDriver: true,
      }).start();

      // Auto dismiss after 4 seconds
      dismissTimer.current = setTimeout(() => {
        dismissBanner();
      }, 4200);
    });

    return () => {
      unsubscribe();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const dismissBanner = () => {
    Animated.timing(slideAnim, {
      toValue: -140,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setCurrentNotif(null);
    });
  };

  if (!currentNotif) return null;

  const accentColor = getNotificationColor(currentNotif.type);
  const icon = getNotificationIcon(currentNotif.type);

  return (
    <Animated.View
      style={[
        styles.bannerContainer,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.bannerCard, { borderLeftColor: accentColor }]}
        activeOpacity={0.9}
        onPress={() => {
          dismissBanner();
          onPressBanner();
        }}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${accentColor}18` }]}>
          <Text style={styles.iconText}>{icon}</Text>
        </View>

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.titleText, { color: accentColor }]} numberOfLines={1}>
              {currentNotif.title}
            </Text>
            <Text style={styles.timeText}>Just now</Text>
          </View>
          <Text style={styles.messageText} numberOfLines={2}>
            {currentNotif.message}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={(e) => {
            e.stopPropagation();
            dismissBanner();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 20,
    left: 14,
    right: 14,
    zIndex: 99999,
    elevation: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 18,
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    marginRight: 6,
  },
  timeText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  messageText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    fontWeight: '500',
  },
  closeBtn: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  closeBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
  },
});
