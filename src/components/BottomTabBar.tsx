// ============================================================
// Bottom Tab Bar Component
// Premium FinTech navigation bar for Add Stamp, Customers, Settings.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

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
        style={[styles.tabItem, activeTab === 'add_stamp' && styles.tabItemActive]}
        onPress={() => onTabChange('add_stamp')}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrapper, activeTab === 'add_stamp' && styles.iconWrapperActive]}>
          <Text style={[styles.tabIcon, activeTab === 'add_stamp' && styles.tabIconActive]}>
            ⚡
          </Text>
        </View>
        <Text style={[styles.tabLabel, activeTab === 'add_stamp' && styles.tabLabelActive]}>
          Add Stamp
        </Text>
      </TouchableOpacity>

      {/* Tab 2: Customers */}
      <TouchableOpacity
        style={[styles.tabItem, activeTab === 'customers' && styles.tabItemActive]}
        onPress={() => onTabChange('customers')}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrapper, activeTab === 'customers' && styles.iconWrapperActive]}>
          <Text style={[styles.tabIcon, activeTab === 'customers' && styles.tabIconActive]}>
            👥
          </Text>
        </View>
        <Text style={[styles.tabLabel, activeTab === 'customers' && styles.tabLabelActive]}>
          Customers
        </Text>
      </TouchableOpacity>

      {/* Tab 3: Settings */}
      <TouchableOpacity
        style={[styles.tabItem, activeTab === 'settings' && styles.tabItemActive]}
        onPress={() => onTabChange('settings')}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrapper, activeTab === 'settings' && styles.iconWrapperActive]}>
          <Text style={[styles.tabIcon, activeTab === 'settings' && styles.tabIconActive]}>
            ⚙️
          </Text>
        </View>
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
    borderTopColor: '#F1F5F9',
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    paddingHorizontal: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 8,
    gap: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 14,
  },
  tabItemActive: {
    backgroundColor: '#F8FAFC',
  },
  iconWrapper: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginBottom: 2,
  },
  iconWrapperActive: {
    backgroundColor: '#EFF6FF',
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.45,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.08 }],
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
});
