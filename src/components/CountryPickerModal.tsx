// ============================================================
// Country Picker Modal Component
// Allows searching and selecting countries worldwide.
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { COUNTRIES, Country } from '../utils/countries';

interface CountryPickerModalProps {
  visible: boolean;
  selectedCountry: Country;
  onSelectCountry: (country: Country) => void;
  onClose: () => void;
}

export const CountryPickerModal: React.FC<CountryPickerModalProps> = ({
  visible,
  selectedCountry,
  onSelectCountry,
  onClose,
}) => {
  const [search, setSearch] = useState('');

  const filteredCountries = COUNTRIES.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Select Country / Region</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Search country or dial code (e.g. UK, +1)..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            autoFocus={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Country List */}
        <FlatList
          data={filteredCountries}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = item.dialCode === selectedCountry.dialCode && item.code === selectedCountry.code;
            return (
              <TouchableOpacity
                style={[styles.countryRow, isSelected && styles.countryRowSelected]}
                onPress={() => {
                  onSelectCountry(item);
                  onClose();
                }}
              >
                <Text style={styles.flag}>{item.flag}</Text>
                <View style={styles.countryInfo}>
                  <Text style={[styles.countryName, isSelected && styles.countryNameSelected]}>
                    {item.name}
                  </Text>
                  <Text style={styles.countryFormat}>e.g. {item.format}</Text>
                </View>
                <Text style={[styles.dialCode, isSelected && styles.dialCodeSelected]}>
                  {item.dialCode}
                </Text>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  closeBtnText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 15,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  countryRowSelected: {
    backgroundColor: '#EFF6FF',
  },
  flag: {
    fontSize: 26,
    marginRight: 14,
  },
  countryInfo: {
    flex: 1,
  },
  countryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  countryNameSelected: {
    color: '#1E3A8A',
    fontWeight: '800',
  },
  countryFormat: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  dialCode: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4B5563',
    marginRight: 8,
  },
  dialCodeSelected: {
    color: '#2563EB',
  },
  checkmark: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2563EB',
  },
});
