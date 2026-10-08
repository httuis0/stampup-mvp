// ============================================================
// Screen: Settings Screen (Pipeline Organized)
// Multi-Shop Branch Switcher, Country Selector, Secure Manager PIN,
// In-App QR Code & Printable Flyer, Clean Privacy Policy, and Logout.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
  Linking,
  Platform,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';
import { strings } from '../constants/strings';
import { APP_CONFIG } from '../constants/config';
import { ShopQRCode } from '../components/ShopQRCode';
import { CountryPickerModal } from '../components/CountryPickerModal';
import { Country, findCountryByDialCode } from '../utils/countries';
import { GoogleMapPicker } from '../components/GoogleMapPicker';
import { generateShopSlug } from '../utils/slug';
import type { Shop } from '../types';

type SettingsTab = 'shop' | 'region' | 'security' | 'qr' | 'account';

interface SettingsScreenProps {
  shop: Shop;
  shops: Shop[];
  userEmail: string;
  cashierPin: string;
  onSelectShop: (shop: Shop) => void;
  onShopCreated: (newShop: Shop) => void;
  onShopUpdated: (updatedShop: Shop) => void;
  onEnterCashierMode: () => void;
  onUpdatePin: (newPin: string) => void;
  onLogout: () => void;
}

// Generate initials for shop avatar
const getShopInitials = (name: string): string => {
  const words = (name || '').trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (name || 'SH').slice(0, 2).toUpperCase();
};

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  shop,
  shops,
  userEmail,
  cashierPin,
  onSelectShop,
  onShopCreated,
  onShopUpdated,
  onEnterCashierMode,
  onUpdatePin,
  onLogout,
}) => {
  // Active Section in Pipeline
  const [activeTab, setActiveTab] = useState<SettingsTab>('shop');

  // Shop Details State
  const [shopName, setShopName] = useState<string>(shop.name);
  const [shopNumber, setShopNumber] = useState<string>(shop.shop_number || '');
  const [shopPhone, setShopPhone] = useState<string>(shop.phone || '');
  const [shopAddress, setShopAddress] = useState<string>(shop.address || '');
  const [shopLatitude, setShopLatitude] = useState<number | null>(shop.latitude || null);
  const [shopLongitude, setShopLongitude] = useState<number | null>(shop.longitude || null);
  const [shopGoogleMapsUrl, setShopGoogleMapsUrl] = useState<string | null>(shop.google_maps_url || null);
  const [stampsRequired, setStampsRequired] = useState<number>(shop.stamps_required);
  const [rewardText, setRewardText] = useState<string>(shop.reward_text);
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    findCountryByDialCode(shop.default_country_code || '+971')
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditingShopDetails, setIsEditingShopDetails] = useState<boolean>(false);

  // Modals
  const [privacyModalVisible, setPrivacyModalVisible] = useState<boolean>(false);
  const [newBranchModalVisible, setNewBranchModalVisible] = useState<boolean>(false);
  const [countryModalVisible, setCountryModalVisible] = useState<boolean>(false);
  const [changePinModalVisible, setChangePinModalVisible] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // New branch form
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [newBranchNumber, setNewBranchNumber] = useState<string>('');
  const [newBranchPhone, setNewBranchPhone] = useState<string>('');
  const [newBranchAddress, setNewBranchAddress] = useState<string>('');
  const [newBranchLatitude, setNewBranchLatitude] = useState<number | null>(null);
  const [newBranchLongitude, setNewBranchLongitude] = useState<number | null>(null);
  const [newBranchGoogleMapsUrl, setNewBranchGoogleMapsUrl] = useState<string | null>(null);
  const [newBranchStamps, setNewBranchStamps] = useState<number>(APP_CONFIG.DEFAULT_STAMPS_REQUIRED);
  const [newBranchReward, setNewBranchReward] = useState<string>('Free item');
  const [creatingBranch, setCreatingBranch] = useState<boolean>(false);

  // PIN Change Form
  const [oldPinInput, setOldPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');

  // Sync state if active shop changes
  useEffect(() => {
    setShopName(shop.name);
    setShopNumber(shop.shop_number || '');
    setShopPhone(shop.phone || '');
    setShopAddress(shop.address || '');
    setShopLatitude(shop.latitude || null);
    setShopLongitude(shop.longitude || null);
    setShopGoogleMapsUrl(shop.google_maps_url || null);
    setStampsRequired(shop.stamps_required);
    setRewardText(shop.reward_text);
    setSelectedCountry(findCountryByDialCode(shop.default_country_code || '+971'));
    setSuccessMessage(null);
    setErrorMessage(null);
    setIsEditingShopDetails(false);
  }, [shop]);

  // Customer page web link
  const slug = shop.slug || generateShopSlug(shop.name);
  const customerWebBase =
    process.env.EXPO_PUBLIC_CUSTOMER_WEB_URL || 'https://stampup-cards.vercel.app';
  const customerLink = `${customerWebBase.replace(/\/+$/, '')}/c/${slug}`;

  // Handle Save Shop Details
  const handleSaveShopDetails = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!shopName.trim()) {
      setErrorMessage('Shop name cannot be empty.');
      return;
    }

    if (stampsRequired < APP_CONFIG.MIN_STAMPS || stampsRequired > APP_CONFIG.MAX_STAMPS) {
      setErrorMessage(`Stamps required must be between ${APP_CONFIG.MIN_STAMPS} and ${APP_CONFIG.MAX_STAMPS}.`);
      return;
    }

    if (!rewardText.trim()) {
      setErrorMessage('Reward description cannot be empty.');
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        name: shopName.trim(),
        stamps_required: stampsRequired,
        reward_text: rewardText.trim(),
        default_country_code: selectedCountry.dialCode,
        shop_number: shopNumber.trim() || null,
        phone: shopPhone.trim() || null,
        address: shopAddress.trim() || null,
        latitude: shopLatitude,
        longitude: shopLongitude,
        google_maps_url: shopGoogleMapsUrl,
      };

      const { data, error } = await supabase
        .from('shops')
        .update(payload)
        .eq('id', shop.id)
        .select()
        .single();

      if (error) {
        if (error.message && (error.message.includes('column') || error.message.includes('schema'))) {
          const fallbackPayload = {
            name: shopName.trim(),
            stamps_required: stampsRequired,
            reward_text: rewardText.trim(),
            default_country_code: selectedCountry.dialCode,
          };
          const { data: fbData, error: fbError } = await supabase
            .from('shops')
            .update(fallbackPayload)
            .eq('id', shop.id)
            .select()
            .single();

          if (fbError) {
            setErrorMessage(fbError.message);
          } else if (fbData) {
            onShopUpdated(fbData as Shop);
            setSuccessMessage('Shop details updated successfully!');
            setIsEditingShopDetails(false);
          }
        } else {
          setErrorMessage(error.message || strings.common.error);
        }
      } else if (data) {
        onShopUpdated(data as Shop);
        setSuccessMessage('Shop details updated successfully!');
        setIsEditingShopDetails(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || strings.common.error);
    } finally {
      setLoading(false);
    }
  };

  // Handle Creating a New Branch
  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) {
      Alert.alert('Error', 'Branch name cannot be empty.');
      return;
    }

    setCreatingBranch(true);

    try {
      const slug = generateShopSlug(newBranchName);

      const branchPayload: any = {
        owner_id: shop.owner_id,
        name: newBranchName.trim(),
        slug: slug,
        stamps_required: newBranchStamps,
        reward_text: newBranchReward.trim(),
        default_country_code: selectedCountry.dialCode,
        shop_number: newBranchNumber.trim() || null,
        phone: newBranchPhone.trim() || null,
        address: newBranchAddress.trim() || null,
        latitude: newBranchLatitude,
        longitude: newBranchLongitude,
        google_maps_url: newBranchGoogleMapsUrl,
      };

      const { data, error } = await supabase
        .from('shops')
        .insert(branchPayload)
        .select()
        .single();

      if (error) {
        if (error.message && (error.message.includes('column') || error.message.includes('schema'))) {
          const fallbackBranch = {
            owner_id: shop.owner_id,
            name: newBranchName.trim(),
            slug: slug,
            stamps_required: newBranchStamps,
            reward_text: newBranchReward.trim(),
            default_country_code: selectedCountry.dialCode,
          };
          const { data: fbData, error: fbError } = await supabase
            .from('shops')
            .insert(fallbackBranch)
            .select()
            .single();

          if (fbError) {
            Alert.alert('Error', fbError.message);
          } else if (fbData) {
            onShopCreated(fbData as Shop);
            setNewBranchModalVisible(false);
            setNewBranchName('');
            setNewBranchNumber('');
            setNewBranchPhone('');
            setNewBranchAddress('');
            Alert.alert('Success 🎉', `Branch "${fbData.name}" created!`);
          }
        } else {
          Alert.alert('Error', error.message || strings.common.error);
        }
      } else if (data) {
        onShopCreated(data as Shop);
        setNewBranchModalVisible(false);
        setNewBranchName('');
        setNewBranchNumber('');
        setNewBranchPhone('');
        setNewBranchAddress('');
        Alert.alert('Success 🎉', `Branch "${data.name}" created!`);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || strings.common.error);
    } finally {
      setCreatingBranch(false);
    }
  };

  // Handle Secure PIN Change
  const handleSavePin = () => {
    if (oldPinInput !== cashierPin) {
      Alert.alert('Error', 'Current Manager PIN is incorrect.');
      return;
    }
    if (newPinInput.length !== 4 || !/^\d{4}$/.test(newPinInput)) {
      Alert.alert('Error', 'New PIN must be exactly 4 digits.');
      return;
    }
    if (newPinInput !== confirmPinInput) {
      Alert.alert('Error', 'New PIN and Confirm PIN do not match.');
      return;
    }

    onUpdatePin(newPinInput);
    setChangePinModalVisible(false);
    setOldPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    Alert.alert('PIN Updated 🔒', 'Your new 4-digit Manager PIN has been saved securely.');
  };

  // Copy Customer Web Link
  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(customerLink);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2500);
      if (Platform.OS !== 'web') {
        Alert.alert('Link Copied! 📋', customerLink);
      }
    } catch (e) {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(customerLink);
        setCopiedNotification(true);
        setTimeout(() => setCopiedNotification(false), 2500);
      } else {
        try {
          await Share.share({
            title: `${shop.name} Loyalty Card`,
            message: `Collect stamps and earn rewards at ${shop.name}! Open: ${customerLink}`,
            url: customerLink,
          });
        } catch (shareErr) {}
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderLeft}>
          <Text style={styles.screenTitle}>Settings</Text>
          <Text style={styles.screenSubtitle}>Manage shops, locations & security</Text>
        </View>
        <View style={styles.activeShopPill}>
          <Text style={styles.activeShopPillText} numberOfLines={1}>{shop.name}</Text>
        </View>
      </View>

      {/* PIPELINE NAVIGATION BAR (Tabbed Sections) */}
      <View style={styles.pipelineBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pipelineScroll}>
          <TouchableOpacity
            style={[styles.pipelineTab, activeTab === 'shop' && styles.pipelineTabActive]}
            onPress={() => setActiveTab('shop')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pipelineTabText, activeTab === 'shop' && styles.pipelineTabTextActive]}>
              🏬 Shop & Branches
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pipelineTab, activeTab === 'region' && styles.pipelineTabActive]}
            onPress={() => setActiveTab('region')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pipelineTabText, activeTab === 'region' && styles.pipelineTabTextActive]}>
              🌍 Region ({selectedCountry.flag})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pipelineTab, activeTab === 'security' && styles.pipelineTabActive]}
            onPress={() => setActiveTab('security')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pipelineTabText, activeTab === 'security' && styles.pipelineTabTextActive]}>
              🛡️ Cashier & PIN
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pipelineTab, activeTab === 'qr' && styles.pipelineTabActive]}
            onPress={() => setActiveTab('qr')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pipelineTabText, activeTab === 'qr' && styles.pipelineTabTextActive]}>
              📱 QR & Stand
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pipelineTab, activeTab === 'account' && styles.pipelineTabActive]}
            onPress={() => setActiveTab('account')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pipelineTabText, activeTab === 'account' && styles.pipelineTabTextActive]}>
              ⚖️ Legal & Account
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Notification Messages */}
        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          </View>
        )}
        {successMessage && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>✓ {successMessage}</Text>
          </View>
        )}

        {/* -------------------------------------------------------- */}
        {/* TAB 1: SHOP & BRANCHES */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'shop' && (
          <View>
            {/* Active Shop Overview Card */}
            <View style={styles.card}>
              <View style={styles.shopOverviewHeader}>
                <View style={styles.shopAvatarSquircle}>
                  <Text style={styles.shopAvatarText}>{getShopInitials(shop.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.shopOverviewTitle}>{shop.name}</Text>
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>Active Shop</Text>
                    </View>
                  </View>
                  <Text style={styles.shopItemSlug}>/{shop.slug}</Text>
                </View>

                {!isEditingShopDetails && (
                  <TouchableOpacity
                    style={styles.editShopBtn}
                    onPress={() => setIsEditingShopDetails(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.editShopBtnText}>✏️ Edit</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!isEditingShopDetails ? (
                /* Collapsed / Clean Shop Overview Grid */
                <View style={styles.shopOverviewDetails}>
                  <View style={styles.overviewRow}>
                    <Text style={styles.overviewLabel}>🏢 Unit / Shop #</Text>
                    <Text style={styles.overviewValue}>{shop.shop_number || 'Not specified'}</Text>
                  </View>

                  <View style={styles.overviewRow}>
                    <Text style={styles.overviewLabel}>📞 Contact Phone</Text>
                    <Text style={styles.overviewValue}>{shop.phone || 'Not specified'}</Text>
                  </View>

                  <View style={styles.overviewRow}>
                    <Text style={styles.overviewLabel}>📍 Location</Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.overviewValue}>{shop.address || 'Address not configured'}</Text>
                      {shop.google_maps_url ? (
                        <TouchableOpacity
                          style={{ marginTop: 4 }}
                          onPress={() => Linking.openURL(shop.google_maps_url!)}
                        >
                          <Text style={styles.overviewMapLink}>View on Google Maps ↗</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  <View style={[styles.overviewRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.overviewLabel}>🎯 Reward Rule</Text>
                    <Text style={styles.overviewValue}>
                      {shop.stamps_required} stamps = {shop.reward_text}
                    </Text>
                  </View>
                </View>
              ) : (
                /* Expanded Edit Form */
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.cardSubtitle}>
                    Update your shop profile and map location. Customers will see these details on their digital pass.
                  </Text>

                  <Text style={styles.inputLabel}>Shop Name:</Text>
                  <TextInput
                    style={styles.input}
                    value={shopName}
                    onChangeText={setShopName}
                    placeholder="e.g. Chai Corner"
                    placeholderTextColor="#94A3B8"
                    editable={!loading}
                  />

                  <Text style={styles.inputLabel}>Shop / Unit Number (Optional):</Text>
                  <TextInput
                    style={styles.input}
                    value={shopNumber}
                    onChangeText={setShopNumber}
                    placeholder="e.g. Shop #14, Ground Floor"
                    placeholderTextColor="#94A3B8"
                    editable={!loading}
                  />

                  <Text style={styles.inputLabel}>Shop Contact Phone (Optional):</Text>
                  <TextInput
                    style={styles.input}
                    value={shopPhone}
                    onChangeText={setShopPhone}
                    placeholder="e.g. +971 50 123 4567"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    editable={!loading}
                  />

                  {/* Location on Google Maps */}
                  <Text style={styles.inputLabel}>Shop Location (Real Google Map):</Text>
                  <GoogleMapPicker
                    initialAddress={shopAddress}
                    initialLatitude={shopLatitude}
                    initialLongitude={shopLongitude}
                    onLocationSelect={(data) => {
                      setShopAddress(data.address);
                      setShopLatitude(data.latitude);
                      setShopLongitude(data.longitude);
                      setShopGoogleMapsUrl(data.googleMapsUrl);
                    }}
                  />

                  <Text style={styles.inputLabel}>Stamps Required for Reward:</Text>
                  <View style={styles.stepperContainer}>
                    <TouchableOpacity
                      style={[styles.stepperButton, stampsRequired <= APP_CONFIG.MIN_STAMPS && styles.stepperButtonDisabled]}
                      onPress={() => setStampsRequired((prev) => Math.max(APP_CONFIG.MIN_STAMPS, prev - 1))}
                      disabled={loading || stampsRequired <= APP_CONFIG.MIN_STAMPS}
                    >
                      <Text style={styles.stepperButtonText}>-</Text>
                    </TouchableOpacity>

                    <View style={styles.stepperValueContainer}>
                      <Text style={styles.stepperValue}>{stampsRequired}</Text>
                      <Text style={styles.stepperValueLabel}>stamps = reward</Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.stepperButton, stampsRequired >= APP_CONFIG.MAX_STAMPS && styles.stepperButtonDisabled]}
                      onPress={() => setStampsRequired((prev) => Math.min(APP_CONFIG.MAX_STAMPS, prev + 1))}
                      disabled={loading || stampsRequired >= APP_CONFIG.MAX_STAMPS}
                    >
                      <Text style={styles.stepperButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.inputLabel}>Reward Description:</Text>
                  <TextInput
                    style={styles.input}
                    value={rewardText}
                    onChangeText={setRewardText}
                    placeholder="e.g. Free karak chai or coffee"
                    placeholderTextColor="#94A3B8"
                    editable={!loading}
                  />

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <TouchableOpacity
                      style={[styles.primaryButton, { flex: 1, marginTop: 0 }, loading && styles.buttonDisabled]}
                      onPress={handleSaveShopDetails}
                      disabled={loading}
                    >
                      {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryButtonText}>Save Changes</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.outlineButton, { flex: 0.7, marginTop: 0, marginBottom: 0 }]}
                      onPress={() => {
                        setIsEditingShopDetails(false);
                        setShopName(shop.name);
                        setShopNumber(shop.shop_number || '');
                        setShopPhone(shop.phone || '');
                        setShopAddress(shop.address || '');
                        setShopLatitude(shop.latitude || null);
                        setShopLongitude(shop.longitude || null);
                        setShopGoogleMapsUrl(shop.google_maps_url || null);
                        setStampsRequired(shop.stamps_required);
                        setRewardText(shop.reward_text);
                      }}
                      disabled={loading}
                    >
                      <Text style={styles.outlineButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* My Branches Section */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardTitle}>My Shops & Branches</Text>
                  <Text style={styles.cardSubtitle}>
                    Manage all your branch locations and switch anytime.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.smallAddBtn}
                  onPress={() => setNewBranchModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.smallAddBtnText}>+ Add Branch</Text>
                </TouchableOpacity>
              </View>

              {shops.map((s) => {
                const isActive = s.id === shop.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.shopItemRow, isActive && styles.shopItemRowActive]}
                    onPress={() => onSelectShop(s)}
                    disabled={isActive}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.branchAvatarSquircle, isActive && styles.branchAvatarSquircleActive]}>
                      <Text style={[styles.branchAvatarText, isActive && styles.branchAvatarTextActive]}>
                        {getShopInitials(s.name)}
                      </Text>
                    </View>

                    <View style={styles.shopItemInfo}>
                      <Text style={[styles.shopItemName, isActive && styles.shopItemNameActive]}>{s.name}</Text>
                      <Text style={styles.shopItemSlug}>/{s.slug}</Text>
                      {s.address ? (
                        <Text style={styles.shopItemAddress} numberOfLines={1}>📍 {s.address}</Text>
                      ) : null}
                    </View>
                    {isActive ? (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>Active</Text>
                      </View>
                    ) : (
                      <View style={styles.switchPill}>
                        <Text style={styles.switchText}>Switch</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* -------------------------------------------------------- */}
        {/* TAB 2: REGION & COUNTRY */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'region' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🌍 Shop Country & Phone Format</Text>
            <Text style={styles.cardSubtitle}>
              Sets the default country code and strict phone number format used by cashiers when adding customer stamps.
            </Text>

            <TouchableOpacity
              style={styles.countrySelectBox}
              onPress={() => setCountryModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.countrySelectFlag}>{selectedCountry.flag}</Text>
              <View style={styles.countrySelectInfo}>
                <Text style={styles.countrySelectName}>{selectedCountry.name}</Text>
                <Text style={styles.countrySelectFormat}>Code: {selectedCountry.dialCode} • Format: {selectedCountry.format}</Text>
              </View>
              <View style={styles.changeCountryPill}>
                <Text style={styles.changeCountryBtnText}>Change ▾</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled, { marginTop: 20 }]}
              onPress={handleSaveShopDetails}
              disabled={loading}
              activeOpacity={0.7}
            >
              {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryButtonText}>Save Country Setting</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* -------------------------------------------------------- */}
        {/* TAB 3: CASHIER & PIN */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'security' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🛡️ Cashier Lock & Manager PIN</Text>
            <Text style={styles.cardSubtitle}>
              Cashier Mode locks the app to the Add Stamp screen. Cashiers cannot view settings, switch shops, or delete customers without your 4-digit PIN.
            </Text>

            {/* Secure PIN Status Box */}
            <View style={styles.securePinBox}>
              <View>
                <Text style={styles.securePinLabel}>Manager PIN Status</Text>
                <Text style={styles.securePinMasked}>•••• (Active & Encrypted)</Text>
              </View>
              <TouchableOpacity
                style={styles.changePinButton}
                onPress={() => setChangePinModalVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.changePinButtonText}>Change PIN</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.cashierModeButton}
              onPress={onEnterCashierMode}
              activeOpacity={0.7}
            >
              <Text style={styles.cashierModeButtonText}>🔒 Enter Cashier Mode Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* -------------------------------------------------------- */}
        {/* TAB 4: QR & PRINTABLE STAND */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'qr' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📱 Customer QR Code & Counter Stand</Text>
            <Text style={styles.cardSubtitle}>
              Customers point any phone camera at this QR code to view their stamp balance in their browser (no app download needed).
            </Text>

            <ShopQRCode shopName={shop.name} customerLink={customerLink} />

            {/* Display exact URL for user verification */}
            <View style={styles.urlDisplayCard}>
              <Text style={styles.urlDisplayLabel}>Customer Card Link:</Text>
              <TouchableOpacity
                onPress={() => Linking.openURL(customerLink)}
                activeOpacity={0.7}
              >
                <Text style={styles.urlDisplayText} numberOfLines={2}>
                  {customerLink}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1 }]}
                onPress={handleCopyLink}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>
                  {copiedNotification ? '✓ Link Copied!' : '📋 Copy Link'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1, backgroundColor: '#F8FAFC' }]}
                onPress={() => {
                  Share.share({
                    title: `${shop.name} Loyalty Card`,
                    message: `Collect stamps and earn rewards at ${shop.name}! Open: ${customerLink}`,
                    url: customerLink,
                  });
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>
                  📤 Share Link
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.printFlyerButton}
              onPress={() => {
                const flyerUrl = `${customerWebBase.replace(/\/+$/, '')}/flyer.html?shop=${slug}&name=${encodeURIComponent(shop.name)}&reward=${encodeURIComponent(shop.reward_text)}&stamps=${shop.stamps_required}`;
                Linking.openURL(flyerUrl);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.printFlyerButtonText}>
                🖨️ Open Clean Tabletop Counter Flyer
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* -------------------------------------------------------- */}
        {/* TAB 5: LEGAL & ACCOUNT */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'account' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⚖️ Legal, Privacy & Account</Text>

            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => setPrivacyModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.outlineButtonText}>📄 View Customer Privacy Policy</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <Text style={styles.accountLabel}>{strings.auth.loggedInAs}:</Text>
            <Text style={styles.accountEmail}>{userEmail}</Text>

            <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.7}>
              <Text style={styles.logoutButtonText}>{strings.settings.logout}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* -------------------------------------------------------- */}
      {/* MODAL: CHANGE MANAGER PIN */}
      {/* -------------------------------------------------------- */}
      <Modal visible={changePinModalVisible} animationType="fade" transparent={true} onRequestClose={() => setChangePinModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>🔒 Change Manager PIN</Text>
            <Text style={styles.modalSubtitle}>Enter your current PIN and choose a new 4-digit PIN.</Text>

            <Text style={styles.inputLabel}>Current 4-Digit PIN:</Text>
            <TextInput
              style={styles.modalPinInput}
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
              value={oldPinInput}
              onChangeText={(t) => setOldPinInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="••••"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>New 4-Digit PIN:</Text>
            <TextInput
              style={styles.modalPinInput}
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
              value={newPinInput}
              onChangeText={(t) => setNewPinInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="••••"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>Confirm New 4-Digit PIN:</Text>
            <TextInput
              style={styles.modalPinInput}
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
              value={confirmPinInput}
              onChangeText={(t) => setConfirmPinInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="••••"
              placeholderTextColor="#94A3B8"
            />

            <TouchableOpacity style={styles.primaryButton} onPress={handleSavePin} activeOpacity={0.7}>
              <Text style={styles.primaryButtonText}>Save New PIN</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => {
                setChangePinModalVisible(false);
                setOldPinInput('');
                setNewPinInput('');
                setConfirmPinInput('');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.closeModalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------- */}
      {/* MODAL: ADD NEW BRANCH */}
      {/* -------------------------------------------------------- */}
      <Modal visible={newBranchModalVisible} animationType="slide" transparent={true} onRequestClose={() => setNewBranchModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>🏬 Add New Branch / Shop</Text>
              <Text style={styles.modalSubtitle}>Create a new branch with its own loyalty cards and location.</Text>

              <Text style={styles.inputLabel}>Branch Name *:</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Chai Corner - Downtown"
                placeholderTextColor="#94A3B8"
                value={newBranchName}
                onChangeText={setNewBranchName}
              />

              <Text style={styles.inputLabel}>Shop / Unit Number (Optional):</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Unit G-12, Food Court"
                placeholderTextColor="#94A3B8"
                value={newBranchNumber}
                onChangeText={setNewBranchNumber}
              />

              <Text style={styles.inputLabel}>Shop Contact Phone (Optional):</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. +971 50 987 6543"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={newBranchPhone}
                onChangeText={setNewBranchPhone}
              />

              {/* Location via Real Google Map Picker */}
              <Text style={styles.inputLabel}>Branch Location (Real Google Map):</Text>
              <GoogleMapPicker
                initialAddress={newBranchAddress}
                initialLatitude={newBranchLatitude}
                initialLongitude={newBranchLongitude}
                onLocationSelect={(data) => {
                  setNewBranchAddress(data.address);
                  setNewBranchLatitude(data.latitude);
                  setNewBranchLongitude(data.longitude);
                  setNewBranchGoogleMapsUrl(data.googleMapsUrl);
                }}
              />

              <Text style={styles.inputLabel}>Stamps Required: ({newBranchStamps})</Text>
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setNewBranchStamps((p) => Math.max(APP_CONFIG.MIN_STAMPS, p - 1))}
                >
                  <Text style={styles.stepperButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{newBranchStamps}</Text>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setNewBranchStamps((p) => Math.min(APP_CONFIG.MAX_STAMPS, p + 1))}
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Reward Description:</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Free chai"
                placeholderTextColor="#94A3B8"
                value={newBranchReward}
                onChangeText={setNewBranchReward}
              />

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleCreateBranch}
                disabled={creatingBranch}
                activeOpacity={0.7}
              >
                {creatingBranch ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryButtonText}>Create Branch</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setNewBranchModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.closeModalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------- */}
      {/* MODAL: PRIVACY POLICY */}
      {/* -------------------------------------------------------- */}
      <Modal visible={privacyModalVisible} animationType="slide" transparent={true} onRequestClose={() => setPrivacyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Privacy Policy</Text>

              <Text style={styles.policyHeading}>1. What data is collected?</Text>
              <Text style={styles.policyBody}>
                We only collect customer phone numbers and their stamp counts / reward history. We do not collect payment data or advertising identifiers.
              </Text>

              <Text style={styles.policyHeading}>2. Why is this data collected?</Text>
              <Text style={styles.policyBody}>
                To maintain a digital stamp loyalty card on behalf of the café or shop, allowing customers to receive free rewards after qualifying purchases.
              </Text>

              <Text style={styles.policyHeading}>3. Who can see this data?</Text>
              <Text style={styles.policyBody}>
                Only the authenticated shop owner and authorized cashiers who register the customer. Anonymous customer links only display stamp counts for that specific phone number.
              </Text>

              <Text style={styles.policyHeading}>4. How to request data deletion?</Text>
              <Text style={styles.policyBody}>
                Customers may ask the cashier or contact the shop to delete their phone number. The shop owner can delete any customer record instantly from their Customers screen, permanently purging all stamp and reward history.
              </Text>

              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setPrivacyModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  topHeaderLeft: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  activeShopPill: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    maxWidth: 140,
  },
  activeShopPillText: {
    color: '#2563EB',
    fontWeight: '800',
    fontSize: 12,
  },

  /* Segmented Pipeline Tabs */
  pipelineBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
  },
  pipelineScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pipelineTab: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pipelineTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  pipelineTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  pipelineTabTextActive: {
    color: '#FFFFFF',
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  /* Card Surfaces */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
    lineHeight: 18,
  },

  /* Shop Overview */
  shopOverviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  shopAvatarSquircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2563EB',
  },
  shopOverviewTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  editShopBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editShopBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  shopOverviewDetails: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  overviewLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    width: 120,
  },
  overviewValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    textAlign: 'right',
  },
  overviewMapLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    textAlign: 'right',
  },

  /* Branch List */
  shopItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
    gap: 10,
  },
  shopItemRowActive: {
    borderColor: '#A7F3D0',
    backgroundColor: '#FAFCFB',
  },
  branchAvatarSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchAvatarSquircleActive: {
    backgroundColor: '#ECFDF5',
  },
  branchAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  branchAvatarTextActive: {
    color: '#059669',
  },
  shopItemInfo: {
    flex: 1,
  },
  shopItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  shopItemNameActive: {
    color: '#065F46',
  },
  shopItemSlug: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  shopItemAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  activeBadgeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
  },
  switchPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  switchText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },
  smallAddBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  smallAddBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  /* Country Section */
  countrySelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  countrySelectFlag: {
    fontSize: 28,
    marginRight: 12,
  },
  countrySelectInfo: {
    flex: 1,
  },
  countrySelectName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  countrySelectFormat: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  changeCountryPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  changeCountryBtnText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 13,
  },

  /* Security / Cashier Lock */
  securePinBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  securePinLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  securePinMasked: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  changePinButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  changePinButtonText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  cashierModeButton: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cashierModeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  /* Buttons & Inputs */
  urlDisplayCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    marginBottom: 4,
  },
  urlDisplayLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  urlDisplayText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    lineHeight: 18,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  printFlyerButton: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  printFlyerButtonText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 6,
    marginBottom: 14,
  },
  stepperButton: {
    width: 42,
    height: 42,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  stepperButtonText: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stepperValueContainer: {
    alignItems: 'center',
  },
  stepperValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepperValueLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  outlineButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  accountLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: '600',
  },
  accountEmail: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  logoutButton: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FDA4AF',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#E11D48',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Notifications */
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  successText: {
    color: '#065F46',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalContent: {
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
    lineHeight: 18,
  },
  modalPinInput: {
    backgroundColor: '#F8FAFC',
    borderColor: '#2563EB',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    color: '#0F172A',
    marginBottom: 14,
  },
  closeModalButton: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  closeModalButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  policyHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
    marginBottom: 4,
  },
  policyBody: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
  },
});
