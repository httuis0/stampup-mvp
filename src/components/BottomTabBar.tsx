// ============================================================
// Bottom Tab Bar Component
// Fast, simple navigation bar between Add Stamp, Customers, Settings.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type TabType = 'add_stamp' | 'customers' | 'settings';

interface BottomTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <View style={styles.tabBar}>
      {/* Tab 1: Add Stamp */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabChange('add_stamp')}
        activeOpacity={0.7}
      >
        <Text style={[styles.tabIcon, activeTab === 'add_stamp' && styles.tabIconActive]}>
          🎟️
        </Text>
        <Text style={[styles.tabLabel, activeTab === 'add_stamp' && styles.tabLabelActive]}>
          Add Stamp
        </Text>
      </TouchableOpacity>

      {/* Tab 2: Customers */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabChange('customers')}
        activeOpacity={0.7}
      >
        <Text style={[styles.tabIcon, activeTab === 'customers' && styles.tabIconActive]}>
          👥
        </Text>
        <Text style={[styles.tabLabel, activeTab === 'customers' && styles.tabLabelActive]}>
          Customers
        </Text>
      </TouchableOpacity>

      {/* Tab 3: Settings */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabChange('settings')}
        activeOpacity={0.7}
      >
        <Text style={[styles.tabIcon, activeTab === 'settings' && styles.tabIconActive]}>
          ⚙️
        </Text>
        <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>
          Settings
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingVertical: 10,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 4,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabLabelActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
});
