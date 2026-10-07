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
      // 1. Strict Active Customer Check: Only active/registered customers can receive stamps!
      const { data: existingCust, error: checkError } = await supabase
        .from('customers')
        .select('id, current_stamps, last_stamp_at')
        .eq('shop_id', shop.id)
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (checkError) {
        setErrorMessage('Could not verify customer record. Please try again.');
        playWarningFeedback();
        setLoading(false);
        return;
      }

      if (!existingCust) {
        setErrorMessage(
          '⚠️ Customer not found. Only active customers who joined via QR code or requested a stamp can receive stamps.'
        );
        playWarningFeedback();
        setLoading(false);
        return;
      }

      // 2. Customer exists and is active -> Execute stamp
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

  // Render visual circles
  const renderCircles = (current: number, total: number) => {
    const circles = [];
    for (let i = 1; i <= total; i++) {
      const isFilled = i <= current;
      circles.push(
        <View key={i} style={[styles.circle, isFilled && styles.circleFilled]}>
          <Text style={[styles.circleText, isFilled && styles.circleTextFilled]}>
            {isFilled ? '★' : i}
          </Text>
        </View>
      );
    }
    return <View style={styles.circlesGrid}>{circles}</View>;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Top Header Row */}
        <View style={styles.topHeader}>
          <View style={styles.headerTitles}>
            <Text style={styles.shopNameText}>{shop.name}</Text>
            <Text style={styles.rewardSubtext}>Reward: {shop.reward_text}</Text>
          </View>
          <View style={styles.headerBadges}>
            {/* Small New Requests Button with Live Badge */}
            <TouchableOpacity
              style={[
                styles.newRequestsBtn,
                pendingRequests.length > 0 && styles.newRequestsBtnActive,
              ]}
              onPress={() => setShowRequestsModal(true)}
            >
              <Text style={styles.newRequestsBtnIcon}>🔔</Text>
              <Text
                style={[
                  styles.newRequestsBtnText,
                  pendingRequests.length > 0 && styles.newRequestsBtnTextActive,
                ]}
              >
                New Requests
              </Text>
              {pendingRequests.length > 0 && (
                <View style={styles.requestCountBadge}>
                  <Text style={styles.requestCountBadgeText}>{pendingRequests.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.shiftBadge}>
              <Text style={styles.shiftBadgeText}>⚡ {todayStampsCount} today</Text>
            </View>
          </View>
        </View>

        {/* ---------------------------------------------------- */}
        {/* INLINE NEW REQUESTS BANNER (If any pending) */}
        {/* ---------------------------------------------------- */}
        {pendingRequests.length > 0 && (
          <View style={styles.requestsPanel}>
            <View style={styles.requestsPanelHeader}>
              <Text style={styles.requestsPanelTitle}>
                🔔 Incoming Customer Requests ({pendingRequests.length})
              </Text>
              <TouchableOpacity onPress={() => setShowRequestsModal(true)}>
                <Text style={styles.requestsPanelViewAll}>View All ↗</Text>
              </TouchableOpacity>
            </View>

            {/* Single Line Requests */}
            {pendingRequests.slice(0, 3).map((req) => (
              <View key={req.id} style={styles.singleLineRequestRow}>
                <View style={styles.requestLeftCol}>
                  <Text style={styles.requestPhoneText} numberOfLines={1}>
                    {formatPhoneForDisplay(req.phone)}
                  </Text>
                  <Text style={styles.requestTimeAgoText} numberOfLines={1}>
                    • {getTimeAgo(req.created_at)}
                  </Text>
                </View>

                <View style={styles.requestRightCol}>
                  {/* Green Accept Button */}
                  <TouchableOpacity
                    style={[
                      styles.singleLineAcceptBtn,
                      resolvingId === req.id && styles.btnDisabled,
                    ]}
                    onPress={() => handleResolveRequest(req.id, 'accept')}
                    disabled={resolvingId === req.id}
                  >
                    {resolvingId === req.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.singleLineAcceptText}>✓ Accept</Text>
                    )}
                  </TouchableOpacity>

                  {/* Red Reject Button */}
                  <TouchableOpacity
                    style={[
                      styles.singleLineRejectBtn,
                      resolvingId === req.id && styles.btnDisabled,
                    ]}
                    onPress={() => handleResolveRequest(req.id, 'reject')}
                    disabled={resolvingId === req.id}
                  >
                    <Text style={styles.singleLineRejectText}>✕ Reject</Text>
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
            <Text style={styles.undoText}>
              Stamp added for {lastAction.phone.slice(-4)} ({undoSecondsLeft}s)
            </Text>
            <TouchableOpacity style={styles.undoButton} onPress={handleUndo} disabled={undoLoading}>
              {undoLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.undoButtonText}>↩️ Undo</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* STATUS BANNER: SUCCESS */}
        {/* ---------------------------------------------------- */}
        {successInfo && (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerTitle}>✓ Stamp Added!</Text>
            <Text style={styles.successBannerSubtitle}>
              {formatPhoneForDisplay(successInfo.phone)} has {successInfo.currentStamps} of {successInfo.stampsRequired} stamps
            </Text>
            {renderCircles(successInfo.currentStamps, successInfo.stampsRequired)}
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* STATUS BANNER: CARD FULL */}
        {/* ---------------------------------------------------- */}
        {cardFullInfo && (
          <View style={styles.cardFullBanner}>
            <Text style={styles.cardFullTitle}>🎉 {strings.addStamp.cardFullTitle}</Text>
            <Text style={styles.cardFullSubtitle}>
              {formatPhoneForDisplay(cardFullInfo.phone)} earned: {shop.reward_text}
            </Text>
            {renderCircles(cardFullInfo.currentStamps, cardFullInfo.stampsRequired)}
            <TouchableOpacity
              style={[styles.rewardButton, rewardLoading && styles.buttonDisabled]}
              onPress={() => handleGiveReward(cardFullInfo.phone)}
              disabled={rewardLoading}
            >
              {rewardLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.rewardButtonText}>🎁 {strings.addStamp.giveRewardButton}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* STATUS BANNER: TOO SOON */}
        {/* ---------------------------------------------------- */}
        {tooSoonInfo && (
          <View style={styles.tooSoonBanner}>
            <Text style={styles.tooSoonTitle}>⏳ Too Soon to Stamp</Text>
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
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* PHONE NUMBER INPUT BOX WITH COUNTRY SELECTOR */}
        {/* ---------------------------------------------------- */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Enter Active Customer Mobile Number:</Text>

          <View style={styles.phoneInputRow}>
            {/* Country Selector Button */}
            <TouchableOpacity
              style={styles.countryButton}
              onPress={() => setCountryModalVisible(true)}
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
              placeholder={`e.g. ${selectedCountry.format}`}
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              autoFocus={false}
              editable={!loading}
            />

            {phone.length > 0 && (
              <TouchableOpacity style={styles.clearBtn} onPress={() => setPhone('')}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Clean format preview hint */}
          <View style={styles.phoneHintRow}>
            <Text style={styles.phoneHintText}>
              Format: <Text style={styles.phoneHintBold}>{selectedCountry.dialCode} {selectedCountry.format}</Text>
            </Text>
            <Text style={styles.phoneHintText}>• Active cards only</Text>
          </View>

          {/* Big Add Stamp Button */}
          <TouchableOpacity
            style={[styles.bigAddButton, loading && styles.buttonDisabled]}
            onPress={() => handleAddStamp()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.bigAddButtonText}>⚡ {strings.addStamp.addStampButton}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ---------------------------------------------------- */}
        {/* MATCHING SEARCH RESULTS / HINTS (When typing) */}
        {/* ---------------------------------------------------- */}
        {matchingCustomers.length > 0 && (
          <View style={styles.quickSection}>
            <Text style={styles.quickSectionTitle}>🔍 Matching Active Customers (Tap to +1 Stamp):</Text>
            {matchingCustomers.map((cust) => (
              <View key={cust.id} style={styles.customerRow}>
                <View style={styles.customerRowInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                    {cust.name ? (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>
                        👤 {cust.name} •{' '}
                      </Text>
                    ) : null}
                    <Text style={styles.customerRowPhone}>{formatPhoneForDisplay(cust.phone)}</Text>
                  </View>
                  <Text style={styles.customerRowStamps}>
                    ★ {cust.current_stamps} / {shop.stamps_required} stamps
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.quickStampBtn}
                  onPress={() => handleAddStamp(cust.phone)}
                >
                  <Text style={styles.quickStampBtnText}>+1 Stamp</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ---------------------------------------------------- */}
        {/* RECENT CUSTOMERS (When input is empty) */}
        {/* ---------------------------------------------------- */}
        {matchingCustomers.length === 0 && recentCustomers.length > 0 && (
          <View style={styles.quickSection}>
            <Text style={styles.quickSectionTitle}>⚡ Recent Active Customers (1-Tap +1 Stamp):</Text>
            {recentCustomers.map((cust) => (
              <View key={cust.id} style={styles.customerRow}>
                <View style={styles.customerRowInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                    {cust.name ? (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>
                        👤 {cust.name} •{' '}
                      </Text>
                    ) : null}
                    <Text style={styles.customerRowPhone}>{formatPhoneForDisplay(cust.phone)}</Text>
                  </View>
                  <Text style={styles.customerRowStamps}>
                    ★ {cust.current_stamps} / {shop.stamps_required} stamps
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.quickStampBtn}
                  onPress={() => handleAddStamp(cust.phone)}
                >
                  <Text style={styles.quickStampBtnText}>+1 Stamp</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
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
              <Text style={styles.modalTitle}>🔔 Stamp Requests ({pendingRequests.length})</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowRequestsModal(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {pendingRequests.length === 0 ? (
                <View style={styles.emptyRequestsBox}>
                  <Text style={styles.emptyRequestsIcon}>☕</Text>
                  <Text style={styles.emptyRequestsTitle}>No Pending Requests</Text>
                  <Text style={styles.emptyRequestsSubtitle}>
                    When customers tap "Request a stamp" on their web card, they will appear here in real time.
                  </Text>
                </View>
              ) : (
                pendingRequests.map((req) => (
                  <View key={req.id} style={styles.singleLineRequestRowModal}>
                    <View style={styles.requestLeftCol}>
                      {req.customer_name ? (
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', marginBottom: 2 }} numberOfLines={1}>
                          👤 {req.customer_name}
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
                      {/* Green Accept Button */}
                      <TouchableOpacity
                        style={[
                          styles.singleLineAcceptBtn,
                          resolvingId === req.id && styles.btnDisabled,
                        ]}
                        onPress={() => handleResolveRequest(req.id, 'accept')}
                        disabled={resolvingId === req.id}
                      >
                        {resolvingId === req.id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.singleLineAcceptText}>✓ Accept</Text>
                        )}
                      </TouchableOpacity>

                      {/* Red Reject Button */}
                      <TouchableOpacity
                        style={[
                          styles.singleLineRejectBtn,
                          resolvingId === req.id && styles.btnDisabled,
                        ]}
                        onPress={() => handleResolveRequest(req.id, 'reject')}
                        disabled={resolvingId === req.id}
                      >
                        <Text style={styles.singleLineRejectText}>✕ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setShowRequestsModal(false)}
            >
              <Text style={styles.modalDoneBtnText}>Close</Text>
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
            <Text style={styles.confirmModalIcon}>⚡</Text>
            <Text style={styles.confirmModalTitle}>Add Stamp?</Text>
            <Text style={styles.confirmModalMessage}>
              Are you sure you want to add +1 stamp for{' '}
              <Text style={styles.confirmModalPhone}>
                {pendingStampPhone ? formatPhoneForDisplay(pendingStampPhone) : ''}
              </Text>
              ?
            </Text>

            <View style={styles.confirmModalButtonsRow}>
              <TouchableOpacity
                style={styles.confirmModalCancelBtn}
                onPress={() => {
                  setConfirmStampModalVisible(false);
                  setPendingStampPhone(null);
                }}
                disabled={loading}
              >
                <Text style={styles.confirmModalCancelText}>No, Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmModalConfirmBtn}
                onPress={executeConfirmedStamp}
                disabled={loading}
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
    backgroundColor: '#F3F4F6',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  headerTitles: {
    flex: 1,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shopNameText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  rewardSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  newRequestsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
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
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
  },
  shiftBadgeText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 11,
  },
  requestsPanel: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  requestsPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  requestsPanelTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  requestsPanelViewAll: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  singleLineRequestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
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
  requestLeftCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    flexWrap: 'nowrap',
  },
  requestPhoneText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
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
    backgroundColor: '#16A34A', // Green
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  singleLineAcceptText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  singleLineRejectBtn: {
    backgroundColor: '#DC2626', // Red
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleLineRejectText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
    paddingVertical: 12,
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
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  undoText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
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
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 10,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 56,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
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
    fontWeight: '700',
    color: '#1F2937',
  },
  countryDropdownArrow: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 4,
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 12,
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
    fontSize: 13,
    fontWeight: '800',
  },
  phoneHintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  phoneHintText: {
    fontSize: 12,
    color: '#64748B',
  },
  phoneHintBold: {
    fontWeight: '700',
    color: '#1E3A8A',
  },
  bigAddButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  bigAddButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  quickSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  quickSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  customerRowInfo: {
    flex: 1,
  },
  customerRowPhone: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  customerRowStamps: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '700',
    marginTop: 2,
  },
  quickStampBtn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickStampBtnText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '800',
  },
  successBanner: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  successBannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 4,
  },
  successBannerSubtitle: {
    fontSize: 14,
    color: '#047857',
    fontWeight: '600',
    marginBottom: 12,
  },
  cardFullBanner: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 2,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  cardFullTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#92400E',
    marginBottom: 4,
  },
  cardFullSubtitle: {
    fontSize: 14,
    color: '#B45309',
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  rewardButton: {
    backgroundColor: '#D97706',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  rewardButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  tooSoonBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
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
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  circlesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 6,
  },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleFilled: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  circleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  circleTextFilled: {
    color: '#FBBF24',
    fontSize: 16,
  },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmModalIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
  },
  confirmModalMessage: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  confirmModalPhone: {
    fontWeight: '800',
    color: '#1E3A8A',
  },
  confirmModalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
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
    borderColor: '#CBD5E1',
  },
  confirmModalCancelText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmModalConfirmBtn: {
    flex: 1,
    backgroundColor: '#16A34A', // Green
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
    fontSize: 15,
    fontWeight: '800',
  },
});
