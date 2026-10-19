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
  BackHandler,
  AppState,
  Platform,
} from 'react-native';
import * as Updates from 'expo-updates';
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
import {
  AppNotification,
  subscribeToNotifications,
  syncRecentActivityToNotifications,
  addNotification,
} from './src/utils/notifications';
import { NotificationBanner } from './src/components/NotificationBanner';
import { NotificationCenterModal } from './src/components/NotificationCenterModal';
import { SoundBridge } from './src/components/SoundBridge';
import { WhatsAppBridge } from './src/components/WhatsAppBridge';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [shopLoading, setShopLoading] = useState<boolean>(false);

  // Automatic OTA Update Checker (Checks on launch & every foreground resume)
  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__) return;

    const checkAndApplyOtaUpdate = async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        // Ignore in dev or offline
      }
    };

    checkAndApplyOtaUpdate();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkAndApplyOtaUpdate();
      }
    });

    return () => sub.remove();
  }, []);

  // Multi-shop support
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShop, setActiveShop] = useState<Shop | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('add_stamp');

  // Cashier Mode (Manager PIN & Password lock)
  const [cashierMode, setCashierMode] = useState<boolean>(false);
  const [cashierPin, setCashierPin] = useState<string>('1234');
  const [unlockModalVisible, setUnlockModalVisible] = useState<boolean>(false);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [unlockLoading, setUnlockLoading] = useState<boolean>(false);

  // In-App Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationModalVisible, setNotificationModalVisible] = useState<boolean>(false);

  // Subscribe to notifications for active shop
  useEffect(() => {
    if (!activeShop) return;
    const unsubscribe = subscribeToNotifications(activeShop.id, setNotifications);
    syncRecentActivityToNotifications(activeShop.id, activeShop.name, activeShop.reward_text);
    return () => unsubscribe();
  }, [activeShop?.id]);

  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  // Load Cashier Mode, locked shop, and PIN from persistent storage on startup
  useEffect(() => {
    const initCashierState = async () => {
      try {
        const [modeVal, shopIdVal, shopDataVal, pinVal] = await Promise.all([
          AsyncStorage.getItem('stampup_cashier_mode'),
          AsyncStorage.getItem('stampup_cashier_shop_id'),
          AsyncStorage.getItem('stampup_cashier_shop_data'),
          AsyncStorage.getItem('stampup_cashier_pin'),
        ]);

        if (pinVal) {
          setCashierPin(pinVal);
        }

        if (modeVal === 'true') {
          setCashierMode(true);
          setActiveTab('add_stamp');
          if (shopDataVal) {
            try {
              const cachedShop = JSON.parse(shopDataVal) as Shop;
              if (cachedShop && cachedShop.id) {
                setActiveShop(cachedShop);
                setShops((prev) => (prev.length === 0 ? [cachedShop] : prev));
                setLoading(false);
                setShopLoading(false);
              }
            } catch (e) {
              console.error('Error parsing cached cashier shop data:', e);
            }
          }
        }
      } catch (err) {
        console.error('Error initializing cashier mode state:', err);
      }
    };

    initCashierState();
  }, []);

  // Prevent Android hardware back button bypass when locked in Cashier Mode
  useEffect(() => {
    if (!cashierMode) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (unlockModalVisible) {
        setUnlockModalVisible(false);
        setEnteredPin('');
      }
      return true; // Strictly intercept back press
    });
    return () => backHandler.remove();
  }, [cashierMode, unlockModalVisible]);

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

        // Check if Cashier Mode is locked to a specific shop
        const isCashier = (await AsyncStorage.getItem('stampup_cashier_mode')) === 'true';
        const cashierShopId = await AsyncStorage.getItem('stampup_cashier_shop_id');

        if (isCashier && cashierShopId) {
          const lockedShop = loadedShops.find((s) => s.id === cashierShopId);
          if (lockedShop) {
            setActiveShop(lockedShop);
            await AsyncStorage.setItem('stampup_cashier_shop_data', JSON.stringify(lockedShop));
            return;
          }
        }

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
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session?.user) {
        loadUserShops(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setShops([]);
        setActiveShop(null);
        setCashierMode(false);
        await AsyncStorage.multiRemove([
          'stampup_cashier_mode',
          'stampup_cashier_shop_id',
          'stampup_cashier_shop_data',
        ]);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  // Enter Cashier Mode - Permanently persists for this shop even across restarts
  const handleEnterCashierMode = async () => {
    if (!activeShop) return;
    setCashierMode(true);
    setActiveTab('add_stamp');
    await AsyncStorage.setItem('stampup_cashier_mode', 'true');
    await AsyncStorage.setItem('stampup_cashier_shop_id', activeShop.id);
    await AsyncStorage.setItem('stampup_cashier_shop_data', JSON.stringify(activeShop));

    addNotification({
      shopId: activeShop.id,
      type: 'security',
      title: '🛡️ Cashier Mode Enabled',
      message: `App locked to "${activeShop.name}" with Manager PIN protection.`,
    });

    Alert.alert(
      'Cashier Mode Active 🛡️',
      `Locked to "${activeShop.name}". The app will remain locked in Cashier Mode even across app restarts and device reboots until unlocked with the Manager PIN or password.`
    );
  };

  // Exit Cashier Mode via PIN or Account Password
  const handleUnlockCashierMode = async () => {
    const input = enteredPin.trim();
    if (!input) return;

    // Check 1: 4-digit Manager PIN
    if (input === cashierPin) {
      setCashierMode(false);
      setUnlockModalVisible(false);
      setEnteredPin('');
      await AsyncStorage.multiRemove([
        'stampup_cashier_mode',
        'stampup_cashier_shop_id',
        'stampup_cashier_shop_data',
      ]);

      if (activeShop) {
        addNotification({
          shopId: activeShop.id,
          type: 'security',
          title: '🔓 Cashier Mode Unlocked',
          message: 'Manager PIN verified. Full manager access restored.',
        });
      }
      return;
    }

    // Check 2: Account Password if logged in
    if (session?.user?.email) {
      setUnlockLoading(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: session.user.email,
          password: input,
        });
        if (!error) {
          setCashierMode(false);
          setUnlockModalVisible(false);
          setEnteredPin('');
          await AsyncStorage.multiRemove([
            'stampup_cashier_mode',
            'stampup_cashier_shop_id',
            'stampup_cashier_shop_data',
          ]);

          if (activeShop) {
            addNotification({
              shopId: activeShop.id,
              type: 'security',
              title: '🔓 Cashier Mode Unlocked',
              message: 'Account password verified. Full manager access restored.',
            });
          }
          return;
        }
      } catch (e) {
        console.error('Password check error in unlock:', e);
      } finally {
        setUnlockLoading(false);
      }
    }

    Alert.alert('Incorrect PIN or Password', 'Please enter your valid 4-digit Manager PIN or account password to unlock.');
    setEnteredPin('');
  };

  // Update Manager PIN
  const handleUpdatePin = async (newPin: string) => {
    setCashierPin(newPin);
    await AsyncStorage.setItem('stampup_cashier_pin', newPin);

    if (activeShop) {
      addNotification({
        shopId: activeShop.id,
        type: 'security',
        title: '🔑 Manager PIN Updated',
        message: 'The 4-digit manager security PIN was updated successfully.',
      });
    }

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
          <SoundBridge />
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
          <SoundBridge />
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
        <SoundBridge />
        <WhatsAppBridge />

        {/* IN-APP FLOATING NOTIFICATION BANNER */}
        <NotificationBanner onPressBanner={() => setNotificationModalVisible(true)} />

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
          {activeTab === 'add_stamp' && (
            <AddStampScreen
              shop={activeShop}
              onOpenNotifications={() => setNotificationModalVisible(true)}
              unreadNotifsCount={unreadNotifCount}
            />
          )}

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
                Enter your 4-digit Manager PIN or account password to exit Cashier Mode:
              </Text>

              <TextInput
                style={styles.unlockPinInput}
                placeholder="PIN or Password"
                placeholderTextColor="#9CA3AF"
                value={enteredPin}
                onChangeText={(t) => setEnteredPin(t)}
                secureTextEntry={true}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={true}
              />

              <View style={styles.unlockModalButtons}>
                <TouchableOpacity
                  style={styles.cancelUnlockBtn}
                  onPress={() => {
                    setUnlockModalVisible(false);
                    setEnteredPin('');
                  }}
                  disabled={unlockLoading}
                >
                  <Text style={styles.cancelUnlockBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmUnlockBtn, (!enteredPin.trim() || unlockLoading) && { opacity: 0.6 }]}
                  onPress={handleUnlockCashierMode}
                  disabled={!enteredPin.trim() || unlockLoading}
                >
                  {unlockLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmUnlockBtnText}>Unlock</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* NOTIFICATION CENTER MODAL */}
        {activeShop && (
          <NotificationCenterModal
            visible={notificationModalVisible}
            shopId={activeShop.id}
            notifications={notifications}
            onClose={() => setNotificationModalVisible(false)}
            onRequestSelect={() => {
              setActiveTab('add_stamp');
            }}
          />
        )}
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
  cashierNotifBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    position: 'relative',
  },
  cashierNotifIcon: {
    fontSize: 16,
  },
  cashierNotifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  cashierNotifBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    maxWidth: 240,
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
