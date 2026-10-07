// ============================================================
// Shop QR Code Component
// Generates a scannable QR code for the customer web page link.
// Includes Share / Print functionality for the shop owner.
// ============================================================

import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Platform,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface ShopQRCodeProps {
  shopName: string;
  customerLink: string;
  size?: number;
}

export const ShopQRCode: React.FC<ShopQRCodeProps> = ({
  shopName,
  customerLink,
  size = 200,
}) => {
  const qrRef = useRef<any>(null);

  // Handle Share / Print
  const handleShare = async () => {
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: `${shopName} Digital Stamp Card`,
            text: `Collect stamps and earn rewards at ${shopName}!`,
            url: customerLink,
          });
        } else {
          // Open print dialog or show alert
          if (typeof window !== 'undefined') {
            window.print();
          }
        }
      } else {
        await Share.share({
          title: `${shopName} Stamp Card`,
          message: `Collect stamps and earn rewards at ${shopName}! Open: ${customerLink}`,
          url: customerLink,
        });
      }
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        Alert.alert('Share', customerLink);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* QR Code Container Box */}
      <View style={styles.qrWrapper}>
        <QRCode
          value={customerLink}
          size={size}
          color="#1E3A8A"
          backgroundColor="#FFFFFF"
          getRef={(c) => (qrRef.current = c)}
        />
      </View>

      <Text style={styles.instructionText}>
        📷 Point any phone camera at this code to view stamps
      </Text>

      {/* Share / Print Action Button */}
      <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
        <Text style={styles.shareButtonText}>
          {Platform.OS === 'web' ? '🖨️ Print / Share QR Code' : '📤 Share QR Code Link'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 12,
  },
  qrWrapper: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  instructionText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  shareButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
