// ============================================================
// Built-In Background WhatsApp Web Auto-Sender Bridge
// Runs a persistent desktop-mode WhatsApp Web session inside
// the app. Once linked (via 8-digit phone code or QR code),
// it automatically sends stamp & reward messages in the
// background with ZERO cashier interaction.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import {
  registerWhatsAppBridgeHandler,
  WhatsAppBridgeJob,
  setWhatsAppBridgeStatus,
  WhatsAppBridgeStatus,
} from '../utils/whatsappBridge';
import { supabase } from '../lib/supabase';

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BEFORE_LOAD_JS = `
(function() {
  try {
    Object.defineProperty(navigator, 'userAgent', {
      get: function() { return '${DESKTOP_USER_AGENT}'; },
      configurable: true
    });
    Object.defineProperty(navigator, 'platform', {
      get: function() { return 'MacIntel'; },
      configurable: true
    });
    Object.defineProperty(navigator, 'vendor', {
      get: function() { return 'Google Inc.'; },
      configurable: true
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: function() { return 0; },
      configurable: true
    });
  } catch (e) {}
})();
true;
`;

const BRIDGE_MONITOR_JS = `
(function() {
  if (window.__STAMPUP_WA_MONITOR_INSTALLED) return;
  window.__STAMPUP_WA_MONITOR_INSTALLED = true;

  function postToRN(payload) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (e) {}
  }

  function findSendButton() {
    var selectors = [
      'button[aria-label="Send"]',
      'button[aria-label="send"]',
      '[data-testid="compose-btn-send"]',
      'span[data-icon="send"]',
      'span[data-icon="wds-ic-send-filled"]',
      'span[data-icon="send-filled"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) {
        return el.closest('button') || el;
      }
    }
    return null;
  }

  setInterval(function() {
    try {
      // 1. Check login state
      var hasPane = !!(
        document.querySelector('#pane-side') ||
        document.querySelector('[data-testid="chat-list"]') ||
        document.querySelector('[aria-label="Chat list"]') ||
        document.querySelector('#main')
      );
      var hasLanding = !!(
        document.querySelector('canvas[aria-label]') ||
        document.querySelector('[data-ref]') ||
        (document.body && document.body.innerText && (
          document.body.innerText.indexOf('Link with phone number') !== -1 ||
          document.body.innerText.indexOf('Use WhatsApp on your computer') !== -1 ||
          document.body.innerText.indexOf('Enter code on phone') !== -1
        ))
      );

      if (hasPane) {
        postToRN({ type: 'status', status: 'connected' });
      } else if (hasLanding) {
        postToRN({ type: 'status', status: 'needs_link' });
      }

      // 2. If an auto-send job is active, look for the Send button and click it
      if (window.__STAMPUP_PENDING_SEND) {
        var sendBtn = findSendButton();
        if (sendBtn) {
          window.__STAMPUP_PENDING_SEND = false;
          setTimeout(function() {
            try {
              var btn = findSendButton() || sendBtn;
              btn.click();
              postToRN({ type: 'sent_ok' });
            } catch (err) {
              postToRN({ type: 'sent_error', error: String(err) });
            }
          }, 350);
          return;
        }

        // Also check if WhatsApp showed an invalid phone popup
        var bodyText = document.body ? document.body.innerText : '';
        if (
          bodyText.indexOf('Phone number shared via url is invalid') !== -1 ||
          bodyText.indexOf('url is invalid') !== -1
        ) {
          window.__STAMPUP_PENDING_SEND = false;
          var okBtn = document.querySelector('[data-testid="popup-controls-ok"]') || document.querySelector('div[role="dialog"] button');
          if (okBtn) okBtn.click();
          postToRN({ type: 'sent_error', error: 'Invalid WhatsApp number' });
        }
      }
    } catch (e) {}
  }, 650);
})();
true;
`;

export const WhatsAppBridge: React.FC = () => {
  const webViewRef = useRef<WebView>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [status, setStatus] = useState<WhatsAppBridgeStatus>('initializing');
  const queueRef = useRef<WhatsAppBridgeJob[]>([]);
  const activeJobRef = useRef<WhatsAppBridgeJob | null>(null);
  const jobTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStatus = (next: WhatsAppBridgeStatus) => {
    setStatus(next);
    setWhatsAppBridgeStatus(next);
  };

  const processNextJob = () => {
    if (activeJobRef.current || queueRef.current.length === 0) return;
    const nextJob = queueRef.current.shift()!;
    activeJobRef.current = nextJob;
    updateStatus('sending');

    const encodedText = encodeURIComponent(nextJob.text);
    const targetUrl = `https://web.whatsapp.com/send?phone=${nextJob.phone}&text=${encodedText}`;

    const navJs = `
      (function() {
        window.__STAMPUP_PENDING_SEND = true;
        window.location.href = ${JSON.stringify(targetUrl)};
      })();
      true;
    `;
    webViewRef.current?.injectJavaScript(navJs);

    // Safety timeout (22 seconds max per message so queue never stalls)
    if (jobTimeoutRef.current) clearTimeout(jobTimeoutRef.current);
    jobTimeoutRef.current = setTimeout(() => {
      if (activeJobRef.current && activeJobRef.current.id === nextJob.id) {
        activeJobRef.current = null;
        updateStatus('connected');
        processNextJob();
      }
    }, 22000);
  };

  useEffect(() => {
    const unregister = registerWhatsAppBridgeHandler(
      (job) => {
        queueRef.current.push(job);
        processNextJob();
      },
      (visible) => {
        setModalVisible(visible);
      }
    );
    return unregister;
  }, []);

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event?.nativeEvent?.data || '{}');
      if (data.type === 'status') {
        if (!activeJobRef.current) {
          updateStatus(data.status);
        }
      } else if (data.type === 'sent_ok') {
        const finishedJob = activeJobRef.current;
        activeJobRef.current = null;
        if (jobTimeoutRef.current) clearTimeout(jobTimeoutRef.current);
        updateStatus('connected');

        if (finishedJob?.outboxId) {
          try {
            await supabase
              .from('whatsapp_outbox')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
              })
              .eq('id', finishedJob.outboxId);
          } catch {}
        }

        setTimeout(processNextJob, 800);
      } else if (data.type === 'sent_error') {
        const failedJob = activeJobRef.current;
        activeJobRef.current = null;
        if (jobTimeoutRef.current) clearTimeout(jobTimeoutRef.current);
        updateStatus('connected');

        if (failedJob?.outboxId) {
          try {
            await supabase
              .from('whatsapp_outbox')
              .update({
                status: 'failed',
                error_message: data.error || 'Auto-send failed',
              })
              .eq('id', failedJob.outboxId);
          } catch {}
        }

        setTimeout(processNextJob, 800);
      }
    } catch {}
  };

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View
      style={modalVisible ? styles.fullscreenOverlay : styles.hiddenBackgroundContainer}
      pointerEvents={modalVisible ? 'auto' : 'none'}
    >
      {modalVisible && (
        <View style={styles.headerBar}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.headerTitle}>🔗 Link Shop WhatsApp</Text>
              <View
                style={[
                  styles.statusPill,
                  status === 'connected' ? styles.statusConnected : styles.statusPending,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    { color: status === 'connected' ? '#065F46' : '#92400E' },
                  ]}
                >
                  {status === 'connected'
                    ? '✓ Connected & Active'
                    : status === 'sending'
                    ? '⚡ Sending...'
                    : 'Link Required'}
                </Text>
              </View>
            </View>
            <Text style={styles.headerSub}>
              {status === 'connected'
                ? 'Your WhatsApp is linked! Tap Done below — messages will now send automatically in the background.'
                : 'Tap "Link with phone number" below (or scan QR) once to enable 100% automatic background messages.'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => setModalVisible(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.doneBtnText}>✓ Done</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={modalVisible ? styles.webviewExpanded : styles.webviewHidden}>
        <WebView
          ref={webViewRef}
          source={{ uri: 'https://web.whatsapp.com' }}
          userAgent={DESKTOP_USER_AGENT}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          mediaPlaybackRequiresUserAction={false}
          injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD_JS}
          injectedJavaScript={BRIDGE_MONITOR_JS}
          onMessage={handleWebViewMessage}
          onLoadEnd={() => {
            webViewRef.current?.injectJavaScript(BRIDGE_MONITOR_JS);
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenBackgroundContainer: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 4,
    height: 4,
    opacity: 0.01,
    overflow: 'hidden',
    zIndex: 1,
  },
  fullscreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F172A',
    zIndex: 99999,
  },
  headerBar: {
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 4,
    lineHeight: 16,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusConnected: {
    backgroundColor: '#D1FAE5',
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  doneBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  webviewExpanded: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webviewHidden: {
    width: 360,
    height: 640,
  },
});
