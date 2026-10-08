// ============================================================
// Screen 2: Shop Setup (First time onboarding)
// Allows new owners to configure their shop name, shop number,
// contact phone, real Google Map location, reward text, and stamps.
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { strings } from '../constants/strings';
import { APP_CONFIG } from '../constants/config';
import { generateShopSlug } from '../utils/slug';
import { CountryPickerModal } from '../components/CountryPickerModal';
import { Country, findCountryByDialCode } from '../utils/countries';
import { GoogleMapPicker, LocationData } from '../components/GoogleMapPicker';
import type { Shop } from '../types';

interface ShopSetupScreenProps {
  ownerId: string;
  onShopCreated: (shop: Shop) => void;
}

export const ShopSetupScreen: React.FC<ShopSetupScreenProps> = ({
  ownerId,
  onShopCreated,
}) => {
  const [shopName, setShopName] = useState<string>('');
  const [shopNumber, setShopNumber] = useState<string>('');
  const [shopPhone, setShopPhone] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(findCountryByDialCode('+971'));
  const [countryModalVisible, setCountryModalVisible] = useState<boolean>(false);

  // Location via Google Map Picker
  const [address, setAddress] = useState<string>('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string | null>(null);

  // Rewards configuration
  const [stampsRequired, setStampsRequired] = useState<number>(APP_CONFIG.DEFAULT_STAMPS_REQUIRED);
  const [rewardText, setRewardText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle location update from GoogleMapPicker
  const handleLocationSelect = (data: LocationData) => {
    setAddress(data.address);
    setLatitude(data.latitude);
    setLongitude(data.longitude);
    setGoogleMapsUrl(data.googleMapsUrl);
  };

  // Validate form inputs
  const validateForm = (): boolean => {
    setErrorMessage(null);

    if (!shopName.trim()) {
      setErrorMessage(strings.setup.nameEmptyError);
      return false;
    }

    if (stampsRequired < APP_CONFIG.MIN_STAMPS || stampsRequired > APP_CONFIG.MAX_STAMPS) {
      setErrorMessage(strings.setup.stampsRangeError);
      return false;
    }

    if (!rewardText.trim()) {
      setErrorMessage(strings.setup.rewardEmptyError);
      return false;
    }

    return true;
  };

  // Create shop in Supabase
  const handleSaveShop = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const slug = generateShopSlug(shopName);

      const payload: any = {
        owner_id: ownerId,
        name: shopName.trim(),
        slug: slug,
        stamps_required: stampsRequired,
        reward_text: rewardText.trim(),
        default_country_code: selectedCountry.dialCode,
        shop_number: shopNumber.trim() || null,
        phone: shopPhone.trim() ? `${selectedCountry.dialCode} ${shopPhone.trim()}` : null,
        address: address.trim() || null,
        latitude: latitude,
        longitude: longitude,
        google_maps_url: googleMapsUrl,
      };

      const { data, error } = await supabase
        .from('shops')
        .insert(payload)
        .select()
        .single();

      if (error) {
        if (error.message && (error.message.includes('column') || error.message.includes('schema'))) {
          const fallbackPayload = {
            owner_id: ownerId,
            name: shopName.trim(),
            slug: slug,
            stamps_required: stampsRequired,
            reward_text: rewardText.trim(),
            default_country_code: selectedCountry.dialCode,
          };
          const { data: fbData, error: fbError } = await supabase
            .from('shops')
            .insert(fallbackPayload)
            .select()
            .single();

          if (fbError) {
            setErrorMessage(fbError.message);
          } else if (fbData) {
            onShopCreated(fbData as Shop);
          }
        } else {
          setErrorMessage(error.message || strings.common.error);
        }
      } else if (data) {
        onShopCreated(data as Shop);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || strings.common.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerPill}>
            <Text style={styles.headerPillText}>🏪 Shop Setup</Text>
          </View>
          <Text style={styles.title}>Setup Your Shop POS</Text>
          <Text style={styles.subtitle}>
            Enter your store details, pinpoint your location on Google Maps, and create your loyalty rules.
          </Text>
        </View>

        {/* Card Form */}
        <View style={styles.card}>
          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {/* Section 1: Shop Identity */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionNumber}>1</Text>
            <Text style={styles.sectionHeader}>Store Identity</Text>
          </View>

          {/* Shop Name */}
          <Text style={styles.label}>Shop Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Chai Corner Downtown"
            placeholderTextColor="#94A3B8"
            value={shopName}
            onChangeText={setShopName}
            editable={!loading}
          />

          {/* Shop / Unit Number */}
          <Text style={styles.label}>Shop / Unit Number (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Shop #14, Ground Floor, Unit G-02"
            placeholderTextColor="#94A3B8"
            value={shopNumber}
            onChangeText={setShopNumber}
            editable={!loading}
          />

          {/* Shop Contact Phone */}
          <Text style={styles.label}>Shop Contact Phone (Optional)</Text>
          <View style={styles.phoneRow}>
            <TouchableOpacity
              style={styles.countryBtn}
              onPress={() => setCountryModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
              <Text style={styles.countryDialCode}>{selectedCountry.dialCode}</Text>
              <Text style={styles.dropdownArrow}>▾</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.phoneInput}
              placeholder={`e.g. ${selectedCountry.format}`}
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={shopPhone}
              onChangeText={setShopPhone}
              editable={!loading}
            />
          </View>

          {/* Section 2: Real Google Map Location */}
          <View style={styles.divider} />
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionNumber}>2</Text>
            <Text style={styles.sectionHeader}>Location (Real Google Map)</Text>
          </View>
          <Text style={styles.helperSubtext}>
            Search your store address or use GPS to place the exact pin on Google Maps.
          </Text>

          <GoogleMapPicker
            initialAddress={address}
            initialLatitude={latitude}
            initialLongitude={longitude}
            onLocationSelect={handleLocationSelect}
          />

          {/* Section 3: Loyalty Program Rules */}
          <View style={styles.divider} />
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionNumber}>3</Text>
            <Text style={styles.sectionHeader}>Loyalty & Stamp Rules</Text>
          </View>

          {/* Stamps Required Stepper */}
          <Text style={styles.label}>Stamps Required for Reward</Text>
          <Text style={styles.helperText}>{strings.setup.stampsRequiredHelper}</Text>

          <View style={styles.stepperContainer}>
            <TouchableOpacity
              style={[
                styles.stepperButton,
                stampsRequired <= APP_CONFIG.MIN_STAMPS && styles.stepperButtonDisabled,
              ]}
              onPress={() => setStampsRequired((prev) => Math.max(APP_CONFIG.MIN_STAMPS, prev - 1))}
              disabled={loading || stampsRequired <= APP_CONFIG.MIN_STAMPS}
            >
              <Text style={styles.stepperButtonText}>-</Text>
            </TouchableOpacity>

            <View style={styles.stepperValueContainer}>
              <Text style={styles.stepperValue}>{stampsRequired}</Text>
              <Text style={styles.stepperValueLabel}>stamps</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.stepperButton,
                stampsRequired >= APP_CONFIG.MAX_STAMPS && styles.stepperButtonDisabled,
              ]}
              onPress={() => setStampsRequired((prev) => Math.min(APP_CONFIG.MAX_STAMPS, prev + 1))}
              disabled={loading || stampsRequired >= APP_CONFIG.MAX_STAMPS}
            >
              <Text style={styles.stepperButtonText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Reward Description */}
          <Text style={styles.label}>Reward Description *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Free specialty coffee or pastry"
            placeholderTextColor="#94A3B8"
            value={rewardText}
            onChangeText={setRewardText}
            editable={!loading}
          />

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleSaveShop}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>🚀 Complete Setup & Launch</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

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
    padding: 20,
    paddingBottom: 40,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  headerPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 10,
  },
  headerPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 24,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 18,
  },
  helperSubtext: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
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
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 10,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  countryFlag: {
    fontSize: 20,
  },
  countryDialCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#64748B',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 6,
    marginBottom: 12,
  },
  stepperButton: {
    width: 44,
    height: 44,
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
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepperValueLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
