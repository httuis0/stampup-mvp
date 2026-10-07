// ============================================================
// StampUp MVP - Root Application
// Multi-Shop Branch Switcher, Cashier Mode PIN Lock,
// Authentication state, and Bottom Tab Navigation.
// ============================================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { AuthScreen } from './src/screens/AuthScreen';
import { ShopSetupScreen } from './src/screens/ShopSetupScreen';
import { AddStampScreen } from './src/screens/AddStampScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { BottomTabBar, TabType } from './src/components/BottomTabBar';
import { strings } from './src/constants/strings';
import type { Shop } from './src/types';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [shopLoading, setShopLoading] = useState<boolean>(false);

  // Multi-shop support
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShop, setActiveShop] = useState<Shop | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('add_stamp');

  // Cashier Mode (Manager PIN lock)
  const [cashierMode, setCashierMode] = useState<boolean>(false);
  const [cashierPin, setCashierPin] = useState<string>('1234');
  const [unlockModalVisible, setUnlockModalVisible] = useState<boolean>(false);
  const [enteredPin, setEnteredPin] = useState<string>('');

  // Load Cashier Mode & PIN from storage
  useEffect(() => {
    AsyncStorage.getItem('stampup_cashier_mode').then((val) => {
      if (val === 'true') setCashierMode(true);
    });
    AsyncStorage.getItem('stampup_cashier_pin').then((val) => {
      if (val) setCashierPin(val);
    });
  }, []);

  // Load all shops owned by current user
  const loadUserShops = async (userId: string) => {
    setShopLoading(true);
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading shops:', error);
      } else if (data && data.length > 0) {
        const loadedShops = data as Shop[];
        setShops(loadedShops);
        // Default to first shop or keep current if valid
        setActiveShop((prev) => {
          if (prev) {
            const found = loadedShops.find((s) => s.id === prev.id);
            if (found) return found;
          }
          return loadedShops[0];
        });
      } else {
        setShops([]);
        setActiveShop(null);
      }
    } catch (err) {
      console.error('Failed to load shops:', err);
    } finally {
      setShopLoading(false);
    }
  };

  useEffect(() => {
    // Failsafe timeout: guarantee app unblocks loading after 3.5s even if offline
    const timer = setTimeout(() => {
      setLoading(false);
      setShopLoading(false);
    }, 3500);

    // 1. Fetch active session on startup with error catching
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timer);
        setSession(session);
        if (session?.user) {
          loadUserShops(session.user.id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Session get error:', err);
        setLoading(false);
      });

    // 2. Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadUserShops(session.user.id);
      } else {
        setShops([]);
        setActiveShop(null);
        setCashierMode(false);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  // Enter Cashier Mode
  const handleEnterCashierMode = async () => {
    setCashierMode(true);
    setActiveTab('add_stamp');
    await AsyncStorage.setItem('stampup_cashier_mode', 'true');
    Alert.alert(
      'Cashier Mode Active 🛡️',
      'The app is now locked to the Add Stamp screen. Tap "Manager Unlock" at the top to exit.'
    );
  };

  // Exit Cashier Mode via PIN
  const handleUnlockCashierMode = async () => {
    if (enteredPin === cashierPin) {
      setCashierMode(false);
      setUnlockModalVisible(false);
      setEnteredPin('');
      await AsyncStorage.setItem('stampup_cashier_mode', 'false');
    } else {
      Alert.alert('Incorrect PIN', 'The Manager PIN you entered is incorrect.');
      setEnteredPin('');
    }
  };

  // Update Manager PIN
  const handleUpdatePin = async (newPin: string) => {
    setCashierPin(newPin);
    await AsyncStorage.setItem('stampup_cashier_pin', newPin);
    Alert.alert('PIN Updated', 'Your 4-digit Manager PIN was saved.');
  };

  // Handle Logout
  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setShops([]);
    setActiveShop(null);
    setCashierMode(false);
    await AsyncStorage.setItem('stampup_cashier_mode', 'false');
    setLoading(false);
  };

  // Prevent blank screen while loading session
  if (loading || shopLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>{strings.common.loading}</Text>
      </View>
    );
  }

  // Not logged in -> Screen 1: Login / Sign Up
  if (!session) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="dark" />
          <AuthScreen onSuccess={() => setLoading(false)} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Logged in, but no shop created yet -> Screen 2: Shop Setup
  if (!activeShop || shops.length === 0) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="dark" />
          <ShopSetupScreen
            ownerId={session.user.id}
            onShopCreated={(newShop) => {
              setShops([newShop]);
              setActiveShop(newShop);
              setActiveTab('add_stamp');
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Logged in with active shop -> Main App Flow
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />

        {/* ---------------------------------------------------- */}
        {/* CASHIER MODE TOP BAR */}
        {/* ---------------------------------------------------- */}
        {cashierMode ? (
          <View style={styles.cashierTopBar}>
            <View style={styles.cashierInfo}>
              <Text style={styles.cashierBadgeText}>🛡️ CASHIER MODE</Text>
              <Text style={styles.cashierShopName}>{activeShop.name}</Text>
            </View>
            <TouchableOpacity
              style={styles.unlockBtn}
              onPress={() => setUnlockModalVisible(true)}
            >
              <Text style={styles.unlockBtnText}>🔓 Manager Unlock</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ---------------------------------------------------- */}
        {/* TAB SCREENS */}
        {/* ---------------------------------------------------- */}
        <View style={styles.tabContentContainer}>
          {activeTab === 'add_stamp' && <AddStampScreen shop={activeShop} />}

          {!cashierMode && activeTab === 'customers' && (
            <CustomersScreen shop={activeShop} />
          )}

          {!cashierMode && activeTab === 'settings' && (
            <SettingsScreen
              shop={activeShop}
              shops={shops}
              userEmail={session.user.email || ''}
              cashierPin={cashierPin}
              onSelectShop={(s) => setActiveShop(s)}
              onShopCreated={(newShop) => {
                setShops((prev) => [newShop, ...prev]);
                setActiveShop(newShop);
              }}
              onShopUpdated={(updated) => {
                setShops((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                setActiveShop(updated);
              }}
              onEnterCashierMode={handleEnterCashierMode}
              onUpdatePin={handleUpdatePin}
              onLogout={handleLogout}
            />
          )}
        </View>

        {/* ---------------------------------------------------- */}
        {/* BOTTOM TAB BAR (Hidden in Cashier Mode) */}
        {/* ---------------------------------------------------- */}
        {!cashierMode && (
          <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        )}

        {/* ---------------------------------------------------- */}
        {/* MANAGER PIN UNLOCK MODAL */}
        {/* ---------------------------------------------------- */}
        <Modal
          visible={unlockModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setUnlockModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.unlockModalCard}>
              <Text style={styles.unlockModalTitle}>🔐 Manager Unlock</Text>
              <Text style={styles.unlockModalSubtitle}>
                Enter your 4-digit Manager PIN to exit Cashier Mode and access settings:
              </Text>

              <TextInput
                style={styles.unlockPinInput}
                placeholder="••••"
                placeholderTextColor="#9CA3AF"
                value={enteredPin}
                onChangeText={(t) => setEnteredPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
                autoFocus={true}
              />

              <View style={styles.unlockModalButtons}>
                <TouchableOpacity
                  style={styles.cancelUnlockBtn}
                  onPress={() => {
                    setUnlockModalVisible(false);
                    setEnteredPin('');
                  }}
                >
                  <Text style={styles.cancelUnlockBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmUnlockBtn}
                  onPress={handleUnlockCashierMode}
                >
                  <Text style={styles.confirmUnlockBtnText}>Unlock</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '500',
  },
  cashierTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cashierInfo: {
    flex: 1,
  },
  cashierBadgeText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cashierShopName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  unlockBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tabContentContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  unlockModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  unlockModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E3A8A',
    marginBottom: 8,
  },
  unlockModalSubtitle: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  unlockPinInput: {
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    width: 140,
    marginBottom: 24,
    color: '#111827',
  },
  unlockModalButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  cancelUnlockBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelUnlockBtnText: {
    color: '#4B5563',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmUnlockBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmUnlockBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
