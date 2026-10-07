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
        // If optional columns are not yet added to DB table, retry with base fields
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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🏪 Setup Your Shop</Text>
          <Text style={styles.subtitle}>
            Enter your business details, pinpoint your store on Google Maps, and set customer rewards.
          </Text>
        </View>

        {/* Card Form */}
        <View style={styles.card}>
          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Section 1: Shop Identity */}
          <Text style={styles.sectionHeader}>🏢 Store Identity</Text>

          {/* Shop Name */}
          <Text style={styles.label}>Shop Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Chai Corner Downtown"
            placeholderTextColor="#9CA3AF"
            value={shopName}
            onChangeText={setShopName}
            editable={!loading}
          />

          {/* Shop / Unit Number */}
          <Text style={styles.label}>Shop / Unit Number (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Shop #14, Ground Floor, Unit G-02"
            placeholderTextColor="#9CA3AF"
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
            >
              <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
              <Text style={styles.countryDialCode}>{selectedCountry.dialCode}</Text>
              <Text style={styles.dropdownArrow}>▾</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.phoneInput}
              placeholder={`e.g. ${selectedCountry.format}`}
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              value={shopPhone}
              onChangeText={setShopPhone}
              editable={!loading}
            />
          </View>

          {/* Section 2: Real Google Map Location */}
          <View style={styles.divider} />
          <Text style={styles.sectionHeader}>📍 Location (Real Google Map)</Text>
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
          <Text style={styles.sectionHeader}>🎁 Loyalty & Stamp Rules</Text>

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
            placeholderTextColor="#9CA3AF"
            value={rewardText}
            onChangeText={setRewardText}
            editable={!loading}
          />

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleSaveShop}
            disabled={loading}
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
    backgroundColor: '#F3F4F6',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E3A8A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E3A8A',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 18,
  },
  helperSubtext: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 48,
    gap: 4,
  },
  countryFlag: {
    fontSize: 18,
  },
  countryDialCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  dropdownArrow: {
    fontSize: 10,
    color: '#64748B',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: '#111827',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  stepperButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2563EB',
    lineHeight: 28,
  },
  stepperValueContainer: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  stepperValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  stepperValueLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
