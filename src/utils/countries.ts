// ============================================================
// Countries and International Phone Formatting Utility
// ============================================================

export interface Country {
  code: string;       // ISO 2-letter (e.g. 'AE')
  name: string;       // Full name (e.g. 'United Arab Emirates')
  dialCode: string;   // Dial code (e.g. '+971')
  flag: string;       // Flag emoji (e.g. '🇦🇪')
  format: string;     // Visual placeholder (e.g. '50 123 4567')
  minDigits: number;  // Minimum national number digits (excluding country code)
  maxDigits: number;  // Maximum national number digits (excluding country code)
  prefixPattern?: RegExp; // Optional mobile prefix regex (e.g. /^5/ for UAE)
  prefixHint?: string;    // Human hint (e.g. 'starts with 5')
}

export const COUNTRIES: Country[] = [
  // Middle East & GCC
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', format: '50 123 4567', minDigits: 9, maxDigits: 9, prefixPattern: /^5[024568]/, prefixHint: 'must start with 50, 52, 54, 55, 56, or 58' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦', format: '50 123 4567', minDigits: 9, maxDigits: 9, prefixPattern: /^5/, prefixHint: 'must start with 5' },
  { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦', format: '3312 3456', minDigits: 8, maxDigits: 8, prefixPattern: /^[3567]/, prefixHint: 'must start with 3, 5, 6, or 7' },
  { code: 'KW', name: 'Kuwait', dialCode: '+965', flag: '🇰🇼', format: '9123 4567', minDigits: 8, maxDigits: 8, prefixPattern: /^[569]/, prefixHint: 'must start with 5, 6, or 9' },
  { code: 'BH', name: 'Bahrain', dialCode: '+973', flag: '🇧🇭', format: '3912 3456', minDigits: 8, maxDigits: 8, prefixPattern: /^[36]/, prefixHint: 'must start with 3 or 6' },
  { code: 'OM', name: 'Oman', dialCode: '+968', flag: '🇴🇲', format: '9123 4567', minDigits: 8, maxDigits: 8, prefixPattern: /^[79]/, prefixHint: 'must start with 7 or 9' },
  { code: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬', format: '10 1234 5678', minDigits: 10, maxDigits: 10, prefixPattern: /^1[0125]/, prefixHint: 'must start with 10, 11, 12, or 15' },
  { code: 'JO', name: 'Jordan', dialCode: '+962', flag: '🇯🇴', format: '7 9123 4567', minDigits: 9, maxDigits: 9, prefixPattern: /^7[789]/, prefixHint: 'must start with 77, 78, or 79' },
  { code: 'LB', name: 'Lebanon', dialCode: '+961', flag: '🇱🇧', format: '70 123 456', minDigits: 7, maxDigits: 8, prefixPattern: /^[378]/, prefixHint: 'must start with 3, 7, or 8' },

  // Americas
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', format: '(555) 123-4567', minDigits: 10, maxDigits: 10, prefixPattern: /^[2-9]/, prefixHint: 'valid 10-digit US mobile number' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', format: '(555) 123-4567', minDigits: 10, maxDigits: 10, prefixPattern: /^[2-9]/, prefixHint: 'valid 10-digit Canadian mobile number' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽', format: '55 1234 5678', minDigits: 10, maxDigits: 10 },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷', format: '11 91234-5678', minDigits: 10, maxDigits: 11 },

  // Europe
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', format: '7911 123456', minDigits: 10, maxDigits: 10, prefixPattern: /^7/, prefixHint: 'must start with 7' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', format: '151 23456789', minDigits: 10, maxDigits: 11, prefixPattern: /^1[567]/, prefixHint: 'must start with 15, 16, or 17' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', format: '6 12 34 56 78', minDigits: 9, maxDigits: 9, prefixPattern: /^[67]/, prefixHint: 'must start with 6 or 7' },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹', format: '312 345 6789', minDigits: 9, maxDigits: 10, prefixPattern: /^3/, prefixHint: 'must start with 3' },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸', format: '612 34 56 78', minDigits: 9, maxDigits: 9, prefixPattern: /^[67]/, prefixHint: 'must start with 6 or 7' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱', format: '6 12345678', minDigits: 9, maxDigits: 9, prefixPattern: /^6/, prefixHint: 'must start with 6' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭', format: '79 123 45 67', minDigits: 9, maxDigits: 9, prefixPattern: /^7/, prefixHint: 'must start with 7' },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪', format: '70 123 45 67', minDigits: 9, maxDigits: 9, prefixPattern: /^7/, prefixHint: 'must start with 7' },
  { code: 'TR', name: 'Turkey', dialCode: '+90', flag: '🇹🇷', format: '512 345 67 89', minDigits: 10, maxDigits: 10, prefixPattern: /^5/, prefixHint: 'must start with 5' },

  // Asia & Oceania
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', format: '98765 43210', minDigits: 10, maxDigits: 10, prefixPattern: /^[6-9]/, prefixHint: 'must start with 6, 7, 8, or 9' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰', format: '300 1234567', minDigits: 10, maxDigits: 10, prefixPattern: /^3/, prefixHint: 'must start with 3' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩', format: '1712-345678', minDigits: 10, maxDigits: 10, prefixPattern: /^1[3-9]/, prefixHint: 'must start with 13–19' },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭', format: '912 345 6789', minDigits: 10, maxDigits: 10, prefixPattern: /^9/, prefixHint: 'must start with 9' },
  { code: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩', format: '812-3456-7890', minDigits: 9, maxDigits: 12, prefixPattern: /^8/, prefixHint: 'must start with 8' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾', format: '12-345 6789', minDigits: 9, maxDigits: 10, prefixPattern: /^1/, prefixHint: 'must start with 1' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬', format: '8123 4567', minDigits: 8, maxDigits: 8, prefixPattern: /^[89]/, prefixHint: 'must start with 8 or 9' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', format: '412 345 678', minDigits: 9, maxDigits: 9, prefixPattern: /^4/, prefixHint: 'must start with 4' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿', format: '21 123 4567', minDigits: 8, maxDigits: 10, prefixPattern: /^2/, prefixHint: 'must start with 2' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦', format: '82 123 4567', minDigits: 9, maxDigits: 9, prefixPattern: /^[678]/, prefixHint: 'must start with 6, 7, or 8' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬', format: '802 123 4567', minDigits: 10, maxDigits: 10, prefixPattern: /^[789]/, prefixHint: 'must start with 7, 8, or 9' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪', format: '712 345678', minDigits: 9, maxDigits: 9, prefixPattern: /^[71]/, prefixHint: 'must start with 7 or 1' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵', format: '90-1234-5678', minDigits: 10, maxDigits: 10, prefixPattern: /^[789]0/, prefixHint: 'must start with 70, 80, or 90' },
  { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷', format: '10-1234-5678', minDigits: 9, maxDigits: 10, prefixPattern: /^10/, prefixHint: 'must start with 10' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // UAE +971

export function findCountryByDialCode(dialCode: string): Country {
  const match = COUNTRIES.find((c) => c.dialCode === dialCode);
  return match || DEFAULT_COUNTRY;
}

export function findCountryByCode(code: string): Country {
  const match = COUNTRIES.find((c) => c.code.toUpperCase() === code.toUpperCase());
  return match || DEFAULT_COUNTRY;
}

/**
 * Validates a national phone number strictly based on country rules
 */
export function validatePhoneNumber(
  rawInput: string,
  country: Country = DEFAULT_COUNTRY
): { isValid: boolean; normalized: string; error?: string } {
  if (!rawInput || !rawInput.trim()) {
    return { isValid: false, normalized: '', error: 'Phone number cannot be empty.' };
  }

  let cleaned = rawInput.replace(/[\s\-\(\)\.]/g, '');

  // If user pasted a full international number with +
  if (cleaned.startsWith('+')) {
    const matchedCountry = COUNTRIES.find((c) => cleaned.startsWith(c.dialCode));
    if (matchedCountry) {
      const nationalPart = cleaned.slice(matchedCountry.dialCode.length).replace(/^0+/, '');
      if (nationalPart.length < matchedCountry.minDigits || nationalPart.length > matchedCountry.maxDigits) {
        return {
          isValid: false,
          normalized: '',
          error: `Invalid length for ${matchedCountry.name}. Expected ${matchedCountry.minDigits} digits.`,
        };
      }
      if (matchedCountry.prefixPattern && !matchedCountry.prefixPattern.test(nationalPart)) {
        return {
          isValid: false,
          normalized: '',
          error: `Invalid format for ${matchedCountry.flag} ${matchedCountry.name} (${matchedCountry.prefixHint || 'check mobile prefix'}).`,
        };
      }
      return { isValid: true, normalized: `${matchedCountry.dialCode}${nationalPart}` };
    }
  }

  // Strip leading 0 if present (e.g. 050 -> 50)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.replace(/^0+/, '');
  }

  // Only digits allowed
  if (!/^\d+$/.test(cleaned)) {
    return { isValid: false, normalized: '', error: 'Phone number must contain digits only.' };
  }

  if (cleaned.length < country.minDigits || cleaned.length > country.maxDigits) {
    return {
      isValid: false,
      normalized: '',
      error: `Please enter a valid ${country.minDigits}-digit number for ${country.flag} ${country.name}.`,
    };
  }

  if (country.prefixPattern && !country.prefixPattern.test(cleaned)) {
    return {
      isValid: false,
      normalized: '',
      error: `Invalid ${country.flag} ${country.name} number. It ${country.prefixHint || 'does not match the standard mobile format'}.`,
    };
  }

  return {
    isValid: true,
    normalized: `${country.dialCode}${cleaned}`,
  };
}

/**
 * Formats a phone number cleanly for UI display: e.g. "+971 50 123 4567"
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.trim();
  const matchedCountry = COUNTRIES.find((c) => cleaned.startsWith(c.dialCode));
  if (matchedCountry) {
    const national = cleaned.slice(matchedCountry.dialCode.length);
    return `${matchedCountry.flag} ${matchedCountry.dialCode} ${national}`;
  }
  return phone;
}
