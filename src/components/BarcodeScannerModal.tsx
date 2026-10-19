// ============================================================
// Cashier Member Pass & Barcode / QR Scanner Modal
// 100% EAS OTA-Compatible Scanner + Instant Voucher / Pass Lookup
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { Customer } from '../types';
import { formatPhoneForDisplay } from '../utils/countries';

interface BarcodeScannerModalProps {
  visible: boolean;
  customers: Customer[];
  stampsRequired: number;
  onClose: () => void;
  onScannedPhone: (phone: string) => void;
}

const CAMERA_SCANNER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, sans-serif; }
  body { background: #0F172A; color: #FFF; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
  #videoWrap { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  video { width: 100%; height: 100%; object-fit: cover; }
  .frame { position: absolute; width: 230px; height: 150px; border: 2.5px solid #38BDF8; border-radius: 18px; box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.55); pointer-events: none; }
  .laser { position: absolute; top: 15%; left: 8%; right: 8%; height: 2px; background: #10B981; box-shadow: 0 0 8px #10B981; animation: scan 2s infinite ease-in-out; }
  @keyframes scan { 0%, 100% { top: 15%; } 50% { top: 85%; } }
  .status { position: absolute; bottom: 14px; background: rgba(15,23,42,0.85); padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 700; color: #BAE6FD; border: 1px solid #334155; }
</style>
</head>
<body>
  <div id="videoWrap">
    <video id="video" playsinline autoplay muted></video>
    <div class="frame"><div class="laser"></div></div>
    <div class="status" id="statusText">Point camera at customer Pass QR / Barcode</div>
  </div>
  <script>
    (async function() {
      const video = document.getElementById('video');
      const statusText = document.getElementById('statusText');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        video.srcObject = stream;
        await video.play();
        if ('BarcodeDetector' in window) {
          const detector = new BarcodeDetector();
          setInterval(async () => {
            try {
              const codes = await detector.detect(video);
              if (codes && codes.length > 0 && codes[0].rawValue) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'SCANNED',
                  value: codes[0].rawValue
                }));
              }
            } catch (e) {}
          }, 350);
        } else {
          statusText.textContent = 'Camera active • Or enter code below';
        }
      } catch (err) {
        statusText.textContent = 'Select customer pass or enter code below';
      }
    })();
  </script>
</body>
</html>`;

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  visible,
  customers,
  stampsRequired,
  onClose,
  onScannedPhone,
}) => {
  const [quickQuery, setQuickQuery] = useState('');

  const parseScannedPayload = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      if (trimmed.includes('phone=')) {
        const match = trimmed.match(/[?&]phone=([^&]+)/);
        if (match && match[1]) {
          return decodeURIComponent(match[1]);
        }
      }
    } catch (e) {}
    const digits = trimmed.replace(/[^0-9+]/g, '');
    if (digits.length >= 6) return digits;
    return null;
  };

  const filteredMembers = useMemo(() => {
    const q = quickQuery.trim().toLowerCase().replace(/^rwd-/i, '');
    if (!q) return customers.slice(0, 6);
    return customers
      .filter((c) => {
        const phoneMatch = c.phone.toLowerCase().includes(q);
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        return phoneMatch || nameMatch;
      })
      .slice(0, 8);
  }, [customers, quickQuery]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>📸 Scan Member Pass / Voucher</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {Platform.OS !== 'web' && (
            <View style={styles.cameraBox}>
              <WebView
                originWhitelist={['*']}
                source={{ html: CAMERA_SCANNER_HTML }}
                style={{ flex: 1, backgroundColor: '#0F172A' }}
                javaScriptEnabled
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data.type === 'SCANNED' && data.value) {
                      const extracted = parseScannedPayload(data.value);
                      if (extracted) {
                        onScannedPhone(extracted);
                        onClose();
                      }
                    }
                  } catch (e) {}
                }}
              />
            </View>
          )}

          <TextInput
            style={styles.searchInput}
            value={quickQuery}
            onChangeText={setQuickQuery}
            placeholder="Last 4 digits, name, or RWD-voucher..."
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
          />

          <ScrollView style={styles.memberList} keyboardShouldPersistTaps="handled">
            {filteredMembers.map((c) => {
              const isFull = (c.current_stamps || 0) >= stampsRequired;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.memberRow}
                  onPress={() => {
                    onScannedPhone(c.phone);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>
                      {c.name || 'Loyalty Member'} {c.birthday ? '🎂' : ''}
                    </Text>
                    <Text style={styles.memberPhone}>{formatPhoneForDisplay(c.phone)}</Text>
                  </View>
                  <View style={[styles.badge, isFull && styles.badgeFull]}>
                    <Text style={[styles.badgeText, isFull && styles.badgeTextFull]}>
                      {isFull ? '🎁 FULL' : `${c.current_stamps}/${stampsRequired} ★`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#475569',
  },
  cameraBox: {
    height: 190,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 10,
  },
  memberList: {
    maxHeight: 240,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  memberPhone: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeFull: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  badgeTextFull: {
    color: '#15803D',
  },
});

