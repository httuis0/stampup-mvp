// ============================================================
// Shared Phone Number Normalization
// Used by both the React Native shop app and customer web page.
// ============================================================

import { APP_CONFIG } from '../constants/config';

export interface PhoneValidationResult {
  isValid: boolean;
  normalized: string;
  errorMessage?: string;
}

/**
 * Normalizes a phone number to standard international E.164 format.
 *
 * Rules:
 * - Strips spaces, dashes, brackets, dots.
 * - Local UAE numbers like "0501234567" -> "+971501234567"
 * - Country code without plus like "971501234567" -> "+971501234567"
 * - International numbers like "+971501234567" -> "+971501234567"
 * - Validates length: total digits between 8 and 15 digits.
 */
export function normalizePhone(
  rawInput: string,
  defaultCountryCode: string = APP_CONFIG.DEFAULT_COUNTRY_CODE
): PhoneValidationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      isValid: false,
      normalized: '',
      errorMessage: 'Please check the phone number.',
    };
  }

  // 1. Remove all spaces, dashes, brackets, and periods
  let cleaned = rawInput.trim().replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.length === 0) {
    return {
      isValid: false,
      normalized: '',
      errorMessage: 'Please check the phone number.',
    };
  }

  // Digits of the default country code (e.g. "971" from "+971")
  const ccDigits = defaultCountryCode.replace(/[^0-9]/g, '');

  let normalized = '';

  // 2. Handle international prefix "00"
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // 3. Handle local leading zero (e.g. 0501234567)
  if (/^0[0-9]/.test(cleaned)) {
    normalized = defaultCountryCode + cleaned.slice(1);
  }
  // 4. Handle number already starting with +
  else if (cleaned.startsWith('+')) {
    normalized = cleaned;
  }
  // 5. Handle number starting with country code digits without plus (e.g. 971501234567)
  else if (cleaned.startsWith(ccDigits)) {
    normalized = '+' + cleaned;
  }
  // 6. Otherwise prepend default country code
  else {
    normalized = defaultCountryCode + cleaned;
  }

  // 7. Basic digit count check (8 to 15 digits worldwide)
  const digitsOnly = normalized.replace(/[^0-9]/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return {
      isValid: false,
      normalized: '',
      errorMessage: 'Please check the phone number.',
    };
  }

  return {
    isValid: true,
    normalized,
  };
}

/**
 * Friendly formatter for display on screens (e.g. "+971 50 123 4567")
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  if (phone.startsWith('+971') && phone.length === 13) {
    // Format: +971 50 123 4567
    return `${phone.slice(0, 4)} ${phone.slice(4, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;
  }
  return phone;
}
