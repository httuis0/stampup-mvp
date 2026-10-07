// ============================================================
// Screen 2: Shop Setup (First time onboarding)
// Allows new owners to configure their shop name, reward,
// and stamps required.
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
  const [stampsRequired, setStampsRequired] = useState<number>(APP_CONFIG.DEFAULT_STAMPS_REQUIRED);
  const [rewardText, setRewardText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

      const { data, error } = await supabase
        .from('shops')
        .insert({
          owner_id: ownerId,
          name: shopName.trim(),
          slug: slug,
          stamps_required: stampsRequired,
          reward_text: rewardText.trim(),
        })
        .select()
        .single();

      if (error) {
        setErrorMessage(error.message || strings.common.error);
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
          <Text style={styles.title}>🏪 {strings.setup.title}</Text>
          <Text style={styles.subtitle}>{strings.setup.subtitle}</Text>
        </View>

        {/* Card Form */}
        <View style={styles.card}>
          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Shop Name */}
          <Text style={styles.label}>{strings.setup.shopNameLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={strings.setup.shopNamePlaceholder}
            placeholderTextColor="#9CA3AF"
            value={shopName}
            onChangeText={setShopName}
            editable={!loading}
          />

          {/* Stamps Required Stepper */}
          <Text style={styles.label}>{strings.setup.stampsRequiredLabel}</Text>
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
          <Text style={styles.label}>{strings.setup.rewardTextLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={strings.setup.rewardTextPlaceholder}
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
              <Text style={styles.primaryButtonText}>{strings.setup.saveShopButton}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E3A8A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#4B5563',
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
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
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: '#111827',
    marginBottom: 20,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: 8,
    marginBottom: 20,
  },
  stepperButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  stepperButtonText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 30,
  },
  stepperValueContainer: {
    alignItems: 'center',
  },
  stepperValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  stepperValueLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
