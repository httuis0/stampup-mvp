// ============================================================
// Screen 3: Add Stamp (Main Cashier Screen)
// Fast entry with Country Selector, Strict Validation,
// 1-Tap Quick-Stamp by Hint/Search, and Live Customer Requests.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Linking,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { strings } from '../constants/strings';
import { CountryPickerModal } from '../components/CountryPickerModal';
import {
  Country,
  findCountryByDialCode,
  validatePhoneNumber,
  formatPhoneForDisplay,
} from '../utils/countries';
import {
  playStampFeedback,
  playRewardFeedback,
  playWarningFeedback,
  playUndoFeedback,
} from '../utils/feedback';
import type { Shop, Customer, StampRequest } from '../types';

interface AddStampScreenProps {
  shop: Shop;
}

interface LastActionInfo {
  phone: string;
  currentStamps: number;
  stampsRequired: number;
  timestamp: number;
}

const customerWebBase =
  process.env.EXPO_PUBLIC_CUSTOMER_WEB_URL || 'https://stampup-cards.vercel.app';

const sendWhatsApp = (phone: string, text: string) => {
  const cleanDigits = phone.replace(/[^0-9]/g, '');
  const encoded = encodeURIComponent(text);
  const url = `https://wa.me/${cleanDigits}?text=${encoded}`;
  Linking.openURL(url).catch(() => {
    Alert.alert('WhatsApp Error', 'Could not open WhatsApp on this device.');
  });
};

export const AddStampScreen: React.FC<AddStampScreenProps> = ({ shop }) => {
  const [phone, setPhone] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    findCountryByDialCode(shop.default_country_code || '+971')
  );
  const [countryModalVisible, setCountryModalVisible] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [rewardLoading, setRewardLoading] = useState<boolean>(false);

  // Status banners
  const [successInfo, setSuccessInfo] = useState<{
    message: string;
    currentStamps: number;
    stampsRequired: number;
    phone: string;
  } | null>(null);

  const [cardFullInfo, setCardFullInfo] = useState<{
    phone: string;
    currentStamps: number;
    stampsRequired: number;
  } | null>(null);

  const [tooSoonInfo, setTooSoonInfo] = useState<{
    minutesLeft: number;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Shift counter: stamps given today
  const [todayStampsCount, setTodayStampsCount] = useState<number>(0);

  // Quick Stamp: Recent & Matching customers
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [matchingCustomers, setMatchingCustomers] = useState<Customer[]>([]);

  // Incoming Customer Stamp Requests
  const [pendingRequests, setPendingRequests] = useState<StampRequest[]>([]);
  const [showRequestsModal, setShowRequestsModal] = useState<boolean>(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Undo button state (active for 30 seconds)
  const [lastAction, setLastAction] = useState<LastActionInfo | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState<number>(0);
  const [undoLoading, setUndoLoading] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update country if shop changes
  useEffect(() => {
    setSelectedCountry(findCountryByDialCode(shop.default_country_code || '+971'));
  }, [shop.default_country_code]);

  // Fetch stamps given today
  const fetchTodayStamps = async () => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from('stamps')
        .select('*', { count: 'exact', head: true })
        .eq('shop_id', shop.id)
        .gte('created_at', startOfDay.toISOString());

      if (!error && typeof count === 'number') {
        setTodayStampsCount(count);
      }
    } catch (e) {}
  };

  // Fetch Recent Customers for quick 1-tap re-stamp
  const fetchRecentCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('shop_id', shop.id)
        .order('last_stamp_at', { ascending: false, nullsFirst: false })
        .limit(6);

      if (!error && data) {
        setRecentCustomers(data as Customer[]);
      }
    } catch (e) {}
  };

  // Fetch Live Pending Stamp Requests
  const fetchPendingRequests = async () => {
    try {
      const { data, error } = await supabase.rpc('get_pending_stamp_requests', {
        p_shop_id: shop.id,
      });

      if (!error && data && data.requests) {
        setPendingRequests(data.requests as StampRequest[]);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchTodayStamps();
    fetchRecentCustomers();
    fetchPendingRequests();

    // Poll for customer requests and stats every 4 seconds
    const interval = setInterval(() => {
      fetchPendingRequests();
    }, 4000);

    return () => clearInterval(interval);
  }, [shop.id]);

  // Filter matching active customers when typing
  useEffect(() => {
    const cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');
    if (cleaned.length >= 2) {
      // Find matching registered customers whose phone contains these digits
      supabase
        .from('customers')
        .select('*')
        .eq('shop_id', shop.id)
        .ilike('phone', `%${cleaned}%`)
        .limit(5)
        .then(({ data }) => {
          if (data) setMatchingCustomers(data as Customer[]);
        });
    } else {
      setMatchingCustomers([]);
    }
  }, [phone, shop.id]);

  // 30-second Undo Countdown Timer
  useEffect(() => {
    if (undoSecondsLeft > 0) {
      timerRef.current = setTimeout(() => {
        setUndoSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else {
      setLastAction(null);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [undoSecondsLeft]);

  // Clear all status banners
  const clearStatuses = () => {
    setSuccessInfo(null);
    setCardFullInfo(null);
    setTooSoonInfo(null);
    setErrorMessage(null);
  };

  // Add Stamp Confirmation Modal State
  const [confirmStampModalVisible, setConfirmStampModalVisible] = useState<boolean>(false);
  const [pendingStampPhone, setPendingStampPhone] = useState<string | null>(null);

  // Helper for human-readable relative time
  const getTimeAgo = (dateStr: string): string => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // Helper for customer avatar initials
  const getInitials = (name?: string | null, phoneStr?: string | null): string => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (phoneStr) {
      const digits = phoneStr.replace(/[^0-9]/g, '');
      return digits.slice(-2);
    }
    return '★';
  };

  // Step 1: Trigger Confirmation Popup
  const handleAddStamp = (targetPhone?: string) => {
    clearStatuses();
    const phoneToUse = targetPhone || phone;

    // Strict Phone Format & Prefix Validation
    const validation = validatePhoneNumber(phoneToUse, selectedCountry);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Please check phone number format.');
      playWarningFeedback();
      return;
    }

    setPendingStampPhone(validation.normalized);
    setConfirmStampModalVisible(true);
  };

  // Step 2: Execute Stamp upon Cashier/Manager "Yes" Confirmation
  const executeConfirmedStamp = async () => {
    if (!pendingStampPhone) return;
    const normalizedPhone = pendingStampPhone;

    setConfirmStampModalVisible(false);
    setLoading(true);

    try {
      // 1. Execute stamp directly (backend will create customer if they don't exist)
      const { data, error } = await supabase.rpc('add_stamp', {
        p_shop_id: shop.id,
        p_phone: normalizedPhone,
      });

      if (error) {
        setErrorMessage(error.message || strings.common.error);
        playWarningFeedback();
        return;
      }

      if (data.status === 'ok') {
        setSuccessInfo({
          message: strings.addStamp.stampAddedSuccess,
          currentStamps: data.current_stamps,
          stampsRequired: data.stamps_required,
          phone: normalizedPhone,
        });

        // Trigger Audio Chime & Haptics
        playStampFeedback();
        setTodayStampsCount((prev) => prev + 1);

        // Activate 30-second Undo
        setLastAction({
          phone: normalizedPhone,
          currentStamps: data.currentStamps || data.current_stamps,
          stampsRequired: data.stampsRequired || data.stamps_required,
          timestamp: Date.now(),
        });
        setUndoSecondsLeft(30);

        setPhone('');
        fetchRecentCustomers();
      } else if (data.status === 'card_full') {
        setCardFullInfo({
          phone: normalizedPhone,
          currentStamps: data.current_stamps,
          stampsRequired: data.stamps_required,
        });

        playRewardFeedback();
        setTodayStampsCount((prev) => prev + 1);

        setLastAction({
          phone: normalizedPhone,
          currentStamps: data.current_stamps,
          stampsRequired: data.stamps_required,
          timestamp: Date.now(),
        });
        setUndoSecondsLeft(30);

        setPhone('');
        fetchRecentCustomers();
      } else if (data.status === 'too_soon') {
        setTooSoonInfo({ minutesLeft: data.minutes_left || 60 });
        playWarningFeedback();
      } else if (data.status === 'not_active') {
        setErrorMessage('⚠️ No active card found for this number. Customer must scan the QR code first.');
        playWarningFeedback();
      } else if (data.status === 'invalid_phone') {
        setErrorMessage(strings.addStamp.invalidPhoneError);
        playWarningFeedback();
      } else {
        setErrorMessage(data.message || strings.common.error);
        playWarningFeedback();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || strings.common.error);
      playWarningFeedback();
    } finally {
      setLoading(false);
    }
  };

  // Handle Give Free Reward
  const handleGiveReward = async (targetPhone?: string) => {
    clearStatuses();
    const phoneToUse = targetPhone || cardFullInfo?.phone || phone;

    const validation = validatePhoneNumber(phoneToUse, selectedCountry);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Please enter a valid phone number.');
      playWarningFeedback();
      return;
    }

    setRewardLoading(true);

    try {
      const { data, error } = await supabase.rpc('give_reward', {
        p_shop_id: shop.id,
        p_phone: validation.normalized,
      });

      if (error) {
        setErrorMessage(error.message || strings.common.error);
        playWarningFeedback();
        return;
      }

      if (data.status === 'ok') {
        playRewardFeedback();
        Alert.alert(
          '🎉 Free Reward Given!',
          `Reward redeemed successfully for ${formatPhoneForDisplay(validation.normalized)}. Card stamps reset to 0.`
        );
        setPhone('');
        setLastAction(null);
        setUndoSecondsLeft(0);
        fetchRecentCustomers();
      } else if (data.status === 'not_ready') {
        setErrorMessage(`Customer has ${data.current_stamps}/${data.stamps_required} stamps. Not eligible for reward yet.`);
        playWarningFeedback();
      } else {
        setErrorMessage(data.message || strings.common.error);
        playWarningFeedback();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || strings.common.error);
      playWarningFeedback();
    } finally {
      setRewardLoading(false);
    }
  };

  // Handle Accept (Green) or Reject (Red) Stamp Request in Single Line
  const handleResolveRequest = async (requestId: string, action: 'accept' | 'reject') => {
    setResolvingId(requestId);
    try {
      const { data, error } = await supabase.rpc('resolve_stamp_request', {
        p_request_id: requestId,
        p_action: action,
      });

      if (!error && data.status === 'ok') {
        if (action === 'accept') {
          playStampFeedback();
          setTodayStampsCount((prev) => prev + 1);
          setSuccessInfo({
            message: 'Stamp Request Approved! +1 Stamp Added.',
            currentStamps: data.stamp_result?.current_stamps || 1,
            stampsRequired: shop.stamps_required,
            phone: data.phone,
          });
        }
        fetchPendingRequests();
        fetchRecentCustomers();
      } else {
        Alert.alert('Error', data?.message || 'Could not resolve request.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Network error.');
    } finally {
      setResolvingId(null);
    }
  };

  // Handle Undo Last Stamp
  const handleUndo = async () => {
    if (!lastAction) return;

    setUndoLoading(true);
    try {
      const { data, error } = await supabase.rpc('undo_last_stamp', {
        p_shop_id: shop.id,
        p_phone: lastAction.phone,
      });

      if (error) {
        Alert.alert('Undo Failed', error.message || 'Could not undo stamp.');
        return;
      }

      if (data.status === 'ok') {
        playUndoFeedback();
        setTodayStampsCount((prev) => Math.max(0, prev - 1));
        setLastAction(null);
        setUndoSecondsLeft(0);
        clearStatuses();
        Alert.alert('Stamp Undone ↩️', `Stamp removed for ${formatPhoneForDisplay(lastAction.phone)}.`);
        fetchRecentCustomers();
      } else {
        Alert.alert('Undo Failed', data.message || 'Could not undo stamp.');
      }
    } catch (err: any) {
      Alert.alert('Undo Failed', err?.message || 'Network error.');
    } finally {
      setUndoLoading(false);
    }
  };

  // Render visual circles with squircle stamp spots
  const renderCircles = (current: number, total: number) => {
    const circles = [];
    for (let i = 1; i <= total; i++) {
      const isFilled = i <= current;
      circles.push(
        <View key={i} style={[styles.stampSpot, isFilled && styles.stampSpotFilled]}>
          <Text style={[styles.stampSpotText, isFilled && styles.stampSpotTextFilled]}>
            {isFilled ? '★' : i}
          </Text>
        </View>
      );
    }
    return <View style={styles.stampSpotsGrid}>{circles}</View>;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Top Header Row with Brand & Shift Stats */}
        <View style={styles.topHeader}>
          <View style={styles.headerBrandContainer}>
            <View style={styles.shopAvatar}>
              <Text style={styles.shopAvatarText}>
                {shop.name ? shop.name.slice(0, 1).toUpperCase() : '🏪'}
              </Text>
            </View>
            <View style={styles.headerTitles}>
              <Text style={styles.shopNameText} numberOfLines={1}>
                {shop.name}
              </Text>
              <View style={styles.rewardPill}>
                <Text style={styles.rewardPillText} numberOfLines={1}>
                  🎯 {shop.stamps_required} stamps = {shop.reward_text}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerBadges}>
            {/* Live Requests Button with Badge */}
            <TouchableOpacity
              style={[
                styles.newRequestsBtn,
                pendingRequests.length > 0 && styles.newRequestsBtnActive,
              ]}
              onPress={() => setShowRequestsModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.newRequestsBtnIcon}>🔔</Text>
              <Text
                style={[
                  styles.newRequestsBtnText,
                  pendingRequests.length > 0 && styles.newRequestsBtnTextActive,
                ]}
              >
                Requests
              </Text>
              {pendingRequests.length > 0 && (
                <View style={styles.requestCountBadge}>
                  <Text style={styles.requestCountBadgeText}>{pendingRequests.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.shiftBadge}>
              <View style={styles.shiftBadgeDot} />
              <Text style={styles.shiftBadgeText}>{todayStampsCount} today</Text>
            </View>
          </View>
        </View>

        {/* ---------------------------------------------------- */}
        {/* INLINE LIVE COUNTER REQUESTS QUEUE (If any pending) */}
        {/* ---------------------------------------------------- */}
        {pendingRequests.length > 0 && (
          <View style={styles.requestsPanel}>
            <View style={styles.requestsPanelHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={styles.livePulseDot} />
                <Text style={styles.requestsPanelTitle}>
                  LIVE COUNTER REQUESTS ({pendingRequests.length})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowRequestsModal(true)} activeOpacity={0.7}>
                <Text style={styles.requestsPanelViewAll}>View Queue ↗</Text>
              </TouchableOpacity>
            </View>

            {pendingRequests.slice(0, 3).map((req) => (
              <View key={req.id} style={styles.singleLineRequestRow}>
                <View style={styles.requestAvatarCircle}>
                  <Text style={styles.requestAvatarText}>
                    {getInitials(req.customer_name, req.phone)}
                  </Text>
                </View>

                <View style={styles.requestLeftCol}>
                  {req.customer_name ? (
                    <Text style={styles.requestCustomerName} numberOfLines={1}>
                      {req.customer_name}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.requestPhoneText} numberOfLines={1}>
                      {formatPhoneForDisplay(req.phone)}
                    </Text>
                    <Text style={styles.requestTimeAgoText} numberOfLines={1}>
                      • {getTimeAgo(req.created_at)}
                    </Text>
                  </View>
                </View>

                <View style={styles.requestRightCol}>
                  <TouchableOpacity
                    style={[
                      styles.singleLineAcceptBtn,
                      resolvingId === req.id && styles.btnDisabled,
                    ]}
                    onPress={() => handleResolveRequest(req.id, 'accept')}
                    disabled={resolvingId === req.id}
                    activeOpacity={0.8}
                  >
                    {resolvingId === req.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.singleLineAcceptText}>✓ Accept</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.singleLineRejectBtn,
                      resolvingId === req.id && styles.btnDisabled,
                    ]}
                    onPress={() => handleResolveRequest(req.id, 'reject')}
                    disabled={resolvingId === req.id}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.singleLineRejectText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* 30-SECOND UNDO BAR */}
        {/* ---------------------------------------------------- */}
        {lastAction && undoSecondsLeft > 0 && (
          <View style={styles.undoBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={styles.undoProgressCircle}>
                <Text style={styles.undoProgressText}>{undoSecondsLeft}s</Text>
              </View>
              <Text style={styles.undoText} numberOfLines={1}>
                Stamp added for {lastAction.phone.slice(-4)}
              </Text>
            </View>
            <TouchableOpacity style={styles.undoButton} onPress={handleUndo} disabled={undoLoading} activeOpacity={0.8}>
              {undoLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.undoButtonText}>↩ Undo</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* STATUS BANNER: SUCCESS */}
        {/* ---------------------------------------------------- */}
        {successInfo && (
          <View style={styles.successBanner}>
            <View style={styles.successBannerIconCircle}>
              <Text style={styles.successBannerIconText}>✓</Text>
            </View>
            <Text style={styles.successBannerTitle}>Stamp Added Successfully!</Text>
            <Text style={styles.successBannerSubtitle}>
              {formatPhoneForDisplay(successInfo.phone)} now has {successInfo.currentStamps} of {successInfo.stampsRequired} stamps
            </Text>
            {renderCircles(successInfo.currentStamps, successInfo.stampsRequired)}

            {/* 1-Click WhatsApp Receipt Button */}
            <TouchableOpacity
              style={styles.whatsAppSuccessBtn}
              onPress={() => {
                const targetSlug = shop.slug || shop.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                // The web app expects the full phone number, including the + sign (e.g., +97150...)
                const cardUrl = `${customerWebBase.replace(/\/+$/, '')}/c/${targetSlug}?phone=${encodeURIComponent(successInfo.phone)}`;
                const text = `Hi! You just received a stamp at *${shop.name}* 🎉\n\nYou now have *${successInfo.currentStamps} of ${successInfo.stampsRequired}* stamps!\nCollect ${Math.max(0, successInfo.stampsRequired - successInfo.currentStamps)} more to unlock: *${shop.reward_text}*.\n\nView your digital card anytime here:\n${cardUrl}`;
                sendWhatsApp(successInfo.phone, text);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.whatsAppSuccessBtnText}>💬 Send WhatsApp Receipt</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* STATUS BANNER: CARD FULL */}
        {/* ---------------------------------------------------- */}
        {cardFullInfo && (
          <View style={styles.cardFullBanner}>
            <View style={styles.cardFullTrophyCircle}>
              <Text style={styles.cardFullTrophyText}>🏆</Text>
            </View>
            <Text style={styles.cardFullTitle}>Reward Earned!</Text>
            <Text style={styles.cardFullSubtitle}>
              {formatPhoneForDisplay(cardFullInfo.phone)} earned: {shop.reward_text}
            </Text>
            {renderCircles(cardFullInfo.currentStamps, cardFullInfo.stampsRequired)}
            <TouchableOpacity
              style={[styles.rewardButton, rewardLoading && styles.buttonDisabled]}
              onPress={() => handleGiveReward(cardFullInfo.phone)}
              disabled={rewardLoading}
              activeOpacity={0.85}
            >
              {rewardLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.rewardButtonText}>🎁 {strings.addStamp.giveRewardButton}</Text>
              )}
            </TouchableOpacity>

            {/* 1-Click WhatsApp Reward Notification */}
            <TouchableOpacity
              style={styles.whatsAppRewardBtn}
              onPress={() => {
                const targetSlug = shop.slug || shop.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                // The web app expects the full phone number, including the + sign (e.g., +97150...)
                const cardUrl = `${customerWebBase.replace(/\/+$/, '')}/c/${targetSlug}?phone=${encodeURIComponent(cardFullInfo.phone)}`;
                const text = `Congratulations! 🏆\nYour loyalty card at *${shop.name}* is FULL!\n\nYou've earned your reward: *${shop.reward_text}* 🎁\nVisit us anytime to claim it!\n\nView card: ${cardUrl}`;
                sendWhatsApp(cardFullInfo.phone, text);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.whatsAppRewardBtnText}>💬 Send Reward Alert on WhatsApp</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* STATUS BANNER: TOO SOON */}
        {/* ---------------------------------------------------- */}
        {tooSoonInfo && (
          <View style={styles.tooSoonBanner}>
            <Text style={styles.tooSoonTitle}>⏳ Cooldown Active</Text>
            <Text style={styles.tooSoonSubtitle}>
              {strings.addStamp.tooSoonMessage.replace('{minutes}', tooSoonInfo.minutesLeft.toString())}
            </Text>
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* ERROR MESSAGE */}
        {/* ---------------------------------------------------- */}
        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* PHONE NUMBER INPUT BOX (HERO POS SECTION) */}
        {/* ---------------------------------------------------- */}
        <View style={styles.inputCard}>
          <View style={styles.inputHeaderRow}>
            <Text style={styles.inputSectionLabel}>CUSTOMER PHONE NUMBER</Text>
            <View style={styles.activeCheckBadge}>
              <Text style={styles.activeCheckBadgeText}>✓ Active Customers</Text>
            </View>
          </View>

          <View style={styles.phoneInputRow}>
            {/* Country Selector Button */}
            <TouchableOpacity
              style={styles.countryButton}
              onPress={() => setCountryModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
              <Text style={styles.countryDialCode}>{selectedCountry.dialCode}</Text>
              <Text style={styles.countryDropdownArrow}>▾</Text>
            </TouchableOpacity>

            {/* Phone Input */}
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={(text) => {
                clearStatuses();
                setPhone(text);
              }}
              placeholder={selectedCountry.format}
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              autoFocus={false}
              editable={!loading}
            />

            {phone.length > 0 && (
              <TouchableOpacity style={styles.clearBtn} onPress={() => setPhone('')} activeOpacity={0.6}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Format preview hint */}
          <View style={styles.phoneHintRow}>
            <Text style={styles.phoneHintText}>
              Expected format: <Text style={styles.phoneHintBold}>{selectedCountry.dialCode} {selectedCountry.format}</Text>
            </Text>
          </View>

          {/* Big Add Stamp Button */}
          <TouchableOpacity
            style={[styles.bigAddButton, loading && styles.buttonDisabled]}
            onPress={() => handleAddStamp()}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.bigAddButtonContent}>
                <Text style={styles.bigAddButtonIcon}>⚡</Text>
                <Text style={styles.bigAddButtonText}>+1 Add Stamp</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ---------------------------------------------------- */}
        {/* MATCHING SEARCH RESULTS / HINTS (When typing) */}
        {/* ---------------------------------------------------- */}
        {matchingCustomers.length > 0 ? (
          <View style={styles.quickSection}>
            <Text style={styles.quickSectionTitle}>MATCHING ACTIVE CUSTOMERS</Text>
            {matchingCustomers.map((cust) => (
              <View key={cust.id} style={styles.customerRow}>
                <View style={styles.customerAvatar}>
                  <Text style={styles.customerAvatarText}>
                    {getInitials(cust.name, cust.phone)}
                  </Text>
                </View>
                <View style={styles.customerRowInfo}>
                  <Text style={styles.customerRowName} numberOfLines={1}>
                    {cust.name ? cust.name : 'Loyalty Member'}
                  </Text>
                  <Text style={styles.customerRowPhone}>
                    {formatPhoneForDisplay(cust.phone)}
                  </Text>
                  <View style={styles.miniStarProgressRow}>
                    <Text style={styles.miniStarProgressText}>
                      ★ {cust.current_stamps}/{shop.stamps_required} stamps
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.quickStampBtn}
                  onPress={() => handleAddStamp(cust.phone)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickStampBtnText}>+1 Stamp</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : recentCustomers.length > 0 ? (
          /* ---------------------------------------------------- */
          /* RECENT CUSTOMERS (When input is empty) */
          /* ---------------------------------------------------- */
          <View style={styles.quickSection}>
            <Text style={styles.quickSectionTitle}>RECENT VISITS (1-TAP RE-STAMP)</Text>
            {recentCustomers.map((cust) => (
              <View key={cust.id} style={styles.customerRow}>
                <View style={styles.customerAvatar}>
                  <Text style={styles.customerAvatarText}>
                    {getInitials(cust.name, cust.phone)}
                  </Text>
                </View>
                <View style={styles.customerRowInfo}>
                  <Text style={styles.customerRowName} numberOfLines={1}>
                    {cust.name ? cust.name : 'Loyalty Member'}
                  </Text>
                  <Text style={styles.customerRowPhone}>
                    {formatPhoneForDisplay(cust.phone)}
                  </Text>
                  <View style={styles.miniStarProgressRow}>
                    <Text style={styles.miniStarProgressText}>
                      ★ {cust.current_stamps}/{shop.stamps_required} stamps
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.quickStampBtn}
                  onPress={() => handleAddStamp(cust.phone)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickStampBtnText}>+1 Stamp</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* ---------------------------------------------------- */}
      {/* NEW REQUESTS NOTIFICATION MODAL */}
      {/* ---------------------------------------------------- */}
      <Modal
        visible={showRequestsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRequestsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.modalTitle}>🔔 Stamp Requests</Text>
                <View style={styles.modalCountPill}>
                  <Text style={styles.modalCountPillText}>{pendingRequests.length}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowRequestsModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {pendingRequests.length === 0 ? (
                <View style={styles.emptyRequestsBox}>
                  <Text style={styles.emptyRequestsIcon}>☕</Text>
                  <Text style={styles.emptyRequestsTitle}>Queue Is Clear</Text>
                  <Text style={styles.emptyRequestsSubtitle}>
                    When customers scan their card and tap "Request a stamp", requests will arrive here instantly.
                  </Text>
                </View>
              ) : (
                pendingRequests.map((req) => (
                  <View key={req.id} style={styles.singleLineRequestRowModal}>
                    <View style={styles.requestAvatarCircle}>
                      <Text style={styles.requestAvatarText}>
                        {getInitials(req.customer_name, req.phone)}
                      </Text>
                    </View>

                    <View style={styles.requestLeftCol}>
                      {req.customer_name ? (
                        <Text style={styles.requestCustomerName} numberOfLines={1}>
                          {req.customer_name}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.requestPhoneText} numberOfLines={1}>
                          {formatPhoneForDisplay(req.phone)}
                        </Text>
                        <Text style={styles.requestTimeAgoText} numberOfLines={1}>
                          • {getTimeAgo(req.created_at)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.requestRightCol}>
                      <TouchableOpacity
                        style={[
                          styles.singleLineAcceptBtn,
                          resolvingId === req.id && styles.btnDisabled,
                        ]}
                        onPress={() => handleResolveRequest(req.id, 'accept')}
                        disabled={resolvingId === req.id}
                        activeOpacity={0.8}
                      >
                        {resolvingId === req.id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.singleLineAcceptText}>✓ Accept</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.singleLineRejectBtn,
                          resolvingId === req.id && styles.btnDisabled,
                        ]}
                        onPress={() => handleResolveRequest(req.id, 'reject')}
                        disabled={resolvingId === req.id}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.singleLineRejectText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setShowRequestsModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ---------------------------------------------------- */}
      {/* ADD STAMP CONFIRMATION POPUP MODAL */}
      {/* ---------------------------------------------------- */}
      <Modal
        visible={confirmStampModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setConfirmStampModalVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalCard}>
            <View style={styles.confirmModalIconCircle}>
              <Text style={styles.confirmModalIcon}>⚡</Text>
            </View>
            <Text style={styles.confirmModalTitle}>Confirm +1 Stamp</Text>
            <Text style={styles.confirmModalMessage}>
              Are you sure you want to add a loyalty stamp for:
            </Text>

            <View style={styles.confirmPhoneBadge}>
              <Text style={styles.confirmPhoneBadgeText}>
                {pendingStampPhone ? formatPhoneForDisplay(pendingStampPhone) : ''}
              </Text>
            </View>

            <View style={styles.confirmModalButtonsRow}>
              <TouchableOpacity
                style={styles.confirmModalCancelBtn}
                onPress={() => {
                  setConfirmStampModalVisible(false);
                  setPendingStampPhone(null);
                }}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmModalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmModalConfirmBtn}
                onPress={executeConfirmedStamp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmModalConfirmText}>Yes, Add Stamp</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Country Picker Modal */}
      <CountryPickerModal
        visible={countryModalVisible}
        selectedCountry={selectedCountry}
        onSelectCountry={setSelectedCountry}
        onClose={() => setCountryModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  headerBrandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
    marginRight: 6,
  },
  shopAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopAvatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1D4ED8',
  },
  headerTitles: {
    flex: 1,
  },
  shopNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  rewardPill: {
    marginTop: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  rewardPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newRequestsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  newRequestsBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  newRequestsBtnIcon: {
    fontSize: 13,
  },
  newRequestsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  newRequestsBtnTextActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  requestCountBadge: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  requestCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  shiftBadge: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  shiftBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  shiftBadgeText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12,
  },
  requestsPanel: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FDE047',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
  },
  requestsPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  requestsPanelTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  requestsPanelViewAll: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  singleLineRequestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FEF08A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  singleLineRequestRowModal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  requestAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  requestAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  requestLeftCol: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  requestCustomerName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 1,
  },
  requestPhoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  requestTimeAgoText: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 6,
    fontWeight: '500',
  },
  requestRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  singleLineAcceptBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  singleLineAcceptText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  singleLineRejectBtn: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleLineRejectText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCountPill: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  modalCountPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
  },
  modalBody: {
    maxHeight: 380,
  },
  emptyRequestsBox: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyRequestsIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyRequestsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  emptyRequestsSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  modalDoneBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  modalDoneBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 15,
  },
  undoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  undoProgressCircle: {
    backgroundColor: '#334155',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  undoProgressText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
  },
  undoText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  undoButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  undoButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  activeCheckBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeCheckBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 58,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 10,
    borderRightWidth: 1.5,
    borderRightColor: '#E2E8F0',
    marginRight: 10,
  },
  countryFlag: {
    fontSize: 22,
    marginRight: 4,
  },
  countryDialCode: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  countryDropdownArrow: {
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 3,
  },
  phoneInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 10,
    letterSpacing: 0.5,
  },
  clearBtn: {
    backgroundColor: '#F1F5F9',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  clearBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  phoneHintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  phoneHintText: {
    fontSize: 12,
    color: '#64748B',
  },
  phoneHintBold: {
    fontWeight: '700',
    color: '#1E40AF',
  },
  bigAddButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  bigAddButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bigAddButtonIcon: {
    fontSize: 18,
    color: '#FBBF24',
  },
  bigAddButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  quickSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  quickSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  customerRowInfo: {
    flex: 1,
    marginHorizontal: 12,
  },
  customerRowName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerRowPhone: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 1,
  },
  miniStarProgressRow: {
    marginTop: 2,
  },
  miniStarProgressText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '800',
  },
  quickStampBtn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
  },
  quickStampBtnText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
  },
  successBanner: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  successBannerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBannerIconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  successBannerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#065F46',
    marginTop: 8,
    marginBottom: 2,
  },
  successBannerSubtitle: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '600',
    marginBottom: 8,
  },
  cardFullBanner: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 2,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  cardFullTrophyCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFullTrophyText: {
    fontSize: 24,
  },
  cardFullTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#92400E',
    marginTop: 8,
    marginBottom: 2,
  },
  cardFullSubtitle: {
    fontSize: 14,
    color: '#B45309',
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  rewardButton: {
    backgroundColor: '#D97706',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  rewardButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  whatsAppSuccessBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  whatsAppSuccessBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  whatsAppRewardBtn: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  whatsAppRewardBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  tooSoonBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  tooSoonTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  tooSoonSubtitle: {
    fontSize: 13,
    color: '#B45309',
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  stampSpotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 8,
  },
  stampSpot: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampSpotFilled: {
    backgroundColor: '#1E3A8A',
    borderColor: '#1E3A8A',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  stampSpotText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  stampSpotTextFilled: {
    color: '#FBBF24',
    fontSize: 16,
    fontWeight: '900',
  },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  confirmModalIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  confirmModalIcon: {
    fontSize: 26,
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 10,
    marginBottom: 4,
  },
  confirmModalMessage: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmPhoneBadge: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginVertical: 14,
  },
  confirmPhoneBadgeText: {
    fontWeight: '800',
    color: '#1E3A8A',
    fontSize: 16,
  },
  confirmModalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmModalCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  confirmModalCancelText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmModalConfirmBtn: {
    flex: 1.2,
    backgroundColor: '#16A34A',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmModalConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
