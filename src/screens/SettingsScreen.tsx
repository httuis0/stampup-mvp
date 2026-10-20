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
  Switch,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { strings } from '../constants/strings';
import { APP_CONFIG } from '../constants/config';
import { ShopQRCode } from '../components/ShopQRCode';
import { CountryPickerModal } from '../components/CountryPickerModal';
import { Country, findCountryByDialCode } from '../utils/countries';
import { GoogleMapPicker } from '../components/GoogleMapPicker';
import { generateShopSlug } from '../utils/slug';
import { pickAndUploadShopLogo, removeShopLogo } from '../utils/shopLogo';
import {
  regenerateApiKey,
  refreshTerminalCode,
  getPosWebhookUrl,
  savePosAutomationRules,
  relayWhatsAppOutboxMessage,
} from '../utils/posIntegrations';
import {
  getSoundEnabled,
  getHapticsEnabled,
  setSoundEnabled,
  setHapticsEnabled,
  playStampFeedback,
  playRewardFeedback,
  playNotificationFeedback,
} from '../utils/feedback';
import {
  STAMP_THEMES,
  getShopTheme,
  saveShopTheme,
  StampThemeOption,
} from '../utils/shopTheme';
import {
  sendViaWhatsAppBridge,
  openWhatsAppLinkerModal,
  subscribeWhatsAppBridgeStatus,
  WhatsAppBridgeStatus,
} from '../utils/whatsappBridge';
import type { Shop, FeaturedMenuItem } from '../types';

type SettingsTab =
  | 'shop'
  | 'offers'
  | 'whatsapp'
  | 'pos'
  | 'region'
  | 'security'
  | 'qr'
  | 'account';

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

  // Section Collapsed / Expanded Toggles ("do not keep them open")
  const [isEditingPromoBanner, setIsEditingPromoBanner] = useState<boolean>(false);
  const [isAddingMenuItem, setIsAddingMenuItem] = useState<boolean>(false);
  const [isConfiguringWhatsApp, setIsConfiguringWhatsApp] = useState<boolean>(false);
  const [isConfiguringPosRules, setIsConfiguringPosRules] = useState<boolean>(false);
  const [isSimulatingPos, setIsSimulatingPos] = useState<boolean>(false);
  const [outboxItems, setOutboxItems] = useState<any[]>([]);
  const [loadingOutbox, setLoadingOutbox] = useState<boolean>(false);
  const [processingOutbox, setProcessingOutbox] = useState<boolean>(false);

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
  const [selectedTheme, setSelectedTheme] = useState<StampThemeOption>(STAMP_THEMES[0]);
  const [loading, setLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditingShopDetails, setIsEditingShopDetails] = useState<boolean>(false);

  // Promo Banner & Featured Menu State
  const [promoBanner, setPromoBanner] = useState<string>(shop.promo_banner || '');
  const [featuredItems, setFeaturedItems] = useState<FeaturedMenuItem[]>(
    Array.isArray(shop.featured_items) ? shop.featured_items : []
  );
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState<string>('');
  const [newItemEmoji, setNewItemEmoji] = useState<string>('☕');
  const [savingPromoMenu, setSavingPromoMenu] = useState<boolean>(false);

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

  // Audio & Haptic Feedback State
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);

  // Load Sound & Haptic preferences on mount
  useEffect(() => {
    getSoundEnabled().then(setSoundEnabledState);
    getHapticsEnabled().then(setHapticsEnabledState);
  }, []);

  const handleToggleSound = async (value: boolean) => {
    setSoundEnabledState(value);
    await setSoundEnabled(value);
    if (value) {
      playStampFeedback();
    }
  };

  const handleToggleHaptics = async (value: boolean) => {
    setHapticsEnabledState(value);
    await setHapticsEnabled(value);
    if (value) {
      playStampFeedback();
    }
  };

  // Delete Account State (Password & PIN Protected)
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState<boolean>(false);
  const [deleteAuthInput, setDeleteAuthInput] = useState<string>('');
  const [deleteAuthError, setDeleteAuthError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);

  // Trigger Delete Account Modal
  const handleDeleteAccount = () => {
    setDeleteAuthInput('');
    setDeleteAuthError(null);
    setDeleteAccountModalVisible(true);
  };

  // Confirm and Execute Account Deletion with Password / Manager PIN Verification
  const handleConfirmDeleteAccount = async () => {
    const trimmedInput = deleteAuthInput.trim();
    if (!trimmedInput) {
      setDeleteAuthError('Please enter your account password or Manager PIN.');
      return;
    }

    setDeletingAccount(true);
    setDeleteAuthError(null);

    try {
      let authorized = false;

      // 1. Verify 4-digit Manager PIN
      if (trimmedInput === cashierPin) {
        authorized = true;
      } else {
        // 2. Verify Supabase account password using active session email
        const { data: sessionData } = await supabase.auth.getSession();
        const activeEmail = sessionData?.session?.user?.email || userEmail;
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email: activeEmail.trim().toLowerCase(),
          password: trimmedInput,
        });
        if (!authErr) {
          authorized = true;
        }
      }

      if (!authorized) {
        setDeleteAuthError('Incorrect password or Manager PIN. Deletion not authorized.');
        setDeletingAccount(false);
        return;
      }

      // 3. Execute Account Deletion RPC
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      try {
        const { error: rpcError } = await supabase.rpc('delete_user_account');
        if (rpcError) {
          console.warn('RPC delete_user_account error, applying direct cleanup fallback:', rpcError);
        }
      } catch (rpcErr) {
        console.warn('RPC call exception:', rpcErr);
      }

      // Direct fallback to purge owner's shops and customers if any remain
      if (currentUserId) {
        try {
          await supabase.from('shops').delete().eq('owner_id', currentUserId);
        } catch (delShopErr) {
          console.warn('Error purging shops fallback:', delShopErr);
        }
      }

      // 4. Wipe all local storage (cashier mode, PINs, cached data)
      try {
        await AsyncStorage.clear();
      } catch (storageErr) {
        console.warn('Storage clear error:', storageErr);
      }

      // 5. Sign out from Supabase
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.warn('Sign out error:', signOutErr);
      }

      setDeleteAccountModalVisible(false);
      onLogout();
    } catch (error: any) {
      setDeleteAuthError(error.message || 'Could not delete account. Please try again.');
    } finally {
      setDeletingAccount(false);
    }
  };

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
    setPromoBanner(shop.promo_banner || '');
    setFeaturedItems(Array.isArray(shop.featured_items) ? shop.featured_items : []);
    setSelectedCountry(findCountryByDialCode(shop.default_country_code || '+971'));
    getShopTheme(shop.id, shop.stamp_icon).then(setSelectedTheme);
    setSuccessMessage(null);
    setErrorMessage(null);
    setIsEditingShopDetails(false);
  }, [shop]);

  const handleSavePromoAndMenu = async (updatedItems?: FeaturedMenuItem[]) => {
    const itemsToSave = updatedItems !== undefined ? updatedItems : featuredItems;
    setSavingPromoMenu(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { data, error } = await supabase
        .from('shops')
        .update({
          promo_banner: promoBanner.trim() || null,
          featured_items: itemsToSave,
        })
        .eq('id', shop.id)
        .select()
        .single();

      if (error) {
        setErrorMessage(error.message || 'Could not save promo banner & menu.');
      } else if (data) {
        onShopUpdated(data as Shop);
        setSuccessMessage('Customer Card Promo Banner & Featured Menu updated!');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save promo banner & menu.');
    } finally {
      setSavingPromoMenu(false);
    }
  };

  // Customer page web link
  const slug = shop.slug || generateShopSlug(shop.name);
  const customerWebBase =
    process.env.EXPO_PUBLIC_CUSTOMER_WEB_URL || 'https://stampup-cards.vercel.app';
  const customerLink = `${customerWebBase.replace(/\/+$/, '')}/c/${slug}`;

  // Logo Upload and Removal State & Handlers
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);

  const handlePickLogo = async () => {
    setUploadingLogo(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await pickAndUploadShopLogo(shop.id);
      if (res.success && res.logoUrl) {
        onShopUpdated({ ...shop, logo_url: res.logoUrl });
        setSuccessMessage('Shop logo updated and synchronized across all cashier devices and customer cards!');
      } else if (res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    Alert.alert(
      'Remove Shop Logo',
      'Are you sure you want to remove your shop logo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setUploadingLogo(true);
            const success = await removeShopLogo(shop.id);
            setUploadingLogo(false);
            if (success) {
              onShopUpdated({ ...shop, logo_url: null });
              setSuccessMessage('Shop logo removed.');
            } else {
              setErrorMessage('Could not remove logo.');
            }
          },
        },
      ]
    );
  };

  // POS & External API Integrations State & Handlers
  const [posApiKey, setPosApiKey] = useState<string>(shop.api_key || '');
  const [posTerminalCode, setPosTerminalCode] = useState<string>(shop.pos_terminal_code || '');
  const [minBillAmountInput, setMinBillAmountInput] = useState<string>(
    shop.min_bill_amount ? String(shop.min_bill_amount) : '0'
  );
  const [whatsappWebhookUrl, setWhatsappWebhookUrl] = useState<string>(shop.whatsapp_webhook_url || '');
  const [whatsappApiToken, setWhatsappApiToken] = useState<string>(shop.whatsapp_api_token || '');
  const [savingPosRules, setSavingPosRules] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [posLoading, setPosLoading] = useState<boolean>(false);
  const [posManualModalVisible, setPosManualModalVisible] = useState<boolean>(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState<boolean>(false);
  const [testPosPhone, setTestPosPhone] = useState<string>('');
  const [testPosAmount, setTestPosAmount] = useState<string>('25.00');
  const [testPosLoading, setTestPosLoading] = useState<boolean>(false);
  const [posTestResult, setPosTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [waBridgeStatus, setWaBridgeStatus] = useState<WhatsAppBridgeStatus>('initializing');

  useEffect(() => {
    return subscribeWhatsAppBridgeStatus(setWaBridgeStatus);
  }, []);

  // Auto-normalize WhatsApp Gateway input (allows user to enter just Instance ID + Token or full URL)
  const buildNormalizedGatewayUrl = (rawUrlOrId: string, rawToken: string): string => {
    const trimmed = rawUrlOrId.trim();
    const tok = rawToken.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    // If user entered a numeric Green-API Instance ID (e.g. "7103948123" or "waInstance7103948123")
    const cleanGreenId = trimmed.replace(/^waInstance/i, '');
    if (/^\d{6,15}$/.test(cleanGreenId) && tok) {
      return `https://api.green-api.com/waInstance${cleanGreenId}/sendMessage/${tok}`;
    }
    // If user entered an UltraMsg Instance ID (e.g. "instance12345")
    if (/^instance\d+$/i.test(trimmed)) {
      return `https://api.ultramsg.com/${trimmed}/messages/chat`;
    }
    return trimmed;
  };

  // Load or generate initial POS data when opening POS tab
  const loadPosDetails = async () => {
    setPosLoading(true);
    try {
      const { data } = await supabase
        .from('shops')
        .select('api_key, pos_terminal_code, min_bill_amount, whatsapp_webhook_url, whatsapp_api_token')
        .eq('id', shop.id)
        .single();

      let activeKey = data?.api_key || posApiKey;
      let activeCode = data?.pos_terminal_code || posTerminalCode;

      if (!activeKey) {
        const generatedKey = await regenerateApiKey(shop.id);
        if (generatedKey) activeKey = generatedKey;
      }
      if (!activeCode) {
        const generatedCode = await refreshTerminalCode(shop.id);
        if (generatedCode) activeCode = generatedCode;
      }

      setPosApiKey(activeKey || '');
      setPosTerminalCode(activeCode || '');
      if (data?.min_bill_amount !== undefined && data?.min_bill_amount !== null) {
        setMinBillAmountInput(String(data.min_bill_amount));
      }
      if (data?.whatsapp_webhook_url) {
        setWhatsappWebhookUrl(data.whatsapp_webhook_url);
      }
      if (data?.whatsapp_api_token) {
        setWhatsappApiToken(data.whatsapp_api_token);
      }
    } catch (e) {
      console.warn('Error loading POS details', e);
    } finally {
      setPosLoading(false);
    }
  };

  // Load outbox queue messages for live status
  const fetchOutboxMessages = async () => {
    setLoadingOutbox(true);
    try {
      const { data } = await supabase
        .from('whatsapp_outbox')
        .select('*')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setOutboxItems(data || []);
    } catch (e) {
      console.warn('Failed to load outbox:', e);
    } finally {
      setLoadingOutbox(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'pos' || activeTab === 'whatsapp') {
      loadPosDetails();
      fetchOutboxMessages();
    }
  }, [activeTab, shop.id]);

  // Dispatch all queued outbox messages
  const handleSendAllQueuedOutbox = async () => {
    const queued = outboxItems.filter((m) => m.status === 'queued');
    if (queued.length === 0) {
      Alert.alert('Outbox Clean', 'No pending messages waiting to send.');
      return;
    }
    const finalGatewayUrl = buildNormalizedGatewayUrl(whatsappWebhookUrl, whatsappApiToken);
    if (!finalGatewayUrl) {
      Alert.alert(
        'Gateway Required',
        'Enter your WhatsApp Instance ID or Gateway URL below to send messages automatically in the background.'
      );
      setIsConfiguringWhatsApp(true);
      return;
    }

    setProcessingOutbox(true);
    let sentCount = 0;
    try {
      for (const msg of queued) {
        const res = await relayWhatsAppOutboxMessage(
          finalGatewayUrl,
          whatsappApiToken,
          msg.recipient_phone,
          msg.message_text,
          msg.id
        );
        if (res.ok) {
          sentCount++;
          await supabase
            .from('whatsapp_outbox')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', msg.id);
        }
      }
      playNotificationFeedback();
      setSuccessMessage(`Dispatched ${sentCount} queued WhatsApp message${sentCount > 1 ? 's' : ''}!`);
      await fetchOutboxMessages();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to dispatch queued messages.');
    } finally {
      setProcessingOutbox(false);
    }
  };

  const handleSavePosRules = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const parsedMin = parseFloat(minBillAmountInput) || 0;
    if (parsedMin < 0) {
      setErrorMessage('Minimum bill amount cannot be negative.');
      return;
    }

    const finalGatewayUrl = buildNormalizedGatewayUrl(whatsappWebhookUrl, whatsappApiToken);
    if (finalGatewayUrl !== whatsappWebhookUrl) {
      setWhatsappWebhookUrl(finalGatewayUrl);
    }

    setSavingPosRules(true);
    try {
      const res = await savePosAutomationRules(
        shop.id,
        parsedMin,
        finalGatewayUrl,
        whatsappApiToken
      );
      if (res.success) {
        onShopUpdated({
          ...shop,
          min_bill_amount: parsedMin,
          whatsapp_webhook_url: finalGatewayUrl.trim() || null,
          whatsapp_api_token: whatsappApiToken.trim() || null,
        });
        setSuccessMessage('Automated POS Bill Rules & WhatsApp settings saved!');
      } else {
        setErrorMessage(res.error || 'Could not save POS rules.');
      }
    } finally {
      setSavingPosRules(false);
    }
  };

  const handleTestWhatsAppGateway = async () => {
    const targetPhone = testPosPhone.trim() || shopPhone.trim();
    if (!targetPhone) {
      Alert.alert('Phone Required', 'Enter a phone number in Customer Phone below to send a live WhatsApp message.');
      return;
    }

    const testMessage = `✅ *${shop.name} Automated WhatsApp Connected!*\n\nYour StampUp POS & background WhatsApp automation is live! 🎉\n\nDigital Card: ${customerLink}`;
    const finalGatewayUrl = buildNormalizedGatewayUrl(whatsappWebhookUrl, whatsappApiToken);

    if (!finalGatewayUrl) {
      if (waBridgeStatus !== 'connected') {
        openWhatsAppLinkerModal();
        return;
      }
      sendViaWhatsAppBridge(targetPhone, testMessage);
      playNotificationFeedback();
      setPosTestResult({
        success: true,
        message: `✅ Background WhatsApp sending to ${targetPhone}!`,
      });
      return;
    }

    if (finalGatewayUrl !== whatsappWebhookUrl) {
      setWhatsappWebhookUrl(finalGatewayUrl);
    }

    setTestingWhatsApp(true);
    setPosTestResult(null);
    try {
      const res = await relayWhatsAppOutboxMessage(
        finalGatewayUrl,
        whatsappApiToken,
        targetPhone,
        testMessage
      );
      if (res.ok) {
        playNotificationFeedback();
        setPosTestResult({
          success: true,
          message: `✅ Background WhatsApp delivered to ${targetPhone}!`,
        });
      } else {
        setPosTestResult({
          success: false,
          message: `WhatsApp Gateway Error: ${res.error || 'Check Instance ID / URL & Token'}`,
        });
      }
    } catch (e: any) {
      setPosTestResult({
        success: false,
        message: e?.message || 'WhatsApp test failed',
      });
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const handleRegenerateKey = async () => {
    Alert.alert(
      'Regenerate API Key',
      'Any external Point of Sale system using the current key will be disconnected until updated. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate New Key',
          style: 'destructive',
          onPress: async () => {
            setPosLoading(true);
            const newKey = await regenerateApiKey(shop.id);
            setPosLoading(false);
            if (newKey) {
              setPosApiKey(newKey);
              setSuccessMessage('New secret POS API Key generated successfully!');
            } else {
              setErrorMessage('Failed to generate API Key.');
            }
          },
        },
      ]
    );
  };

  const handleRefreshTerminalCode = async () => {
    setPosLoading(true);
    const newCode = await refreshTerminalCode(shop.id);
    setPosLoading(false);
    if (newCode) {
      setPosTerminalCode(newCode);
      setSuccessMessage('Fresh 6-digit Cashier Terminal Pairing Code generated!');
    } else {
      setErrorMessage('Failed to generate terminal code.');
    }
  };

  const handleTestWebhook = async () => {
    if (!testPosPhone.trim()) {
      Alert.alert('Phone Required', 'Please enter a customer mobile number to simulate a POS bill punch.');
      return;
    }
    const billValue = parseFloat(testPosAmount) || 0;
    setTestPosLoading(true);
    setPosTestResult(null);
    try {
      const { data, error } = await supabase.rpc('pos_add_stamp', {
        p_api_key: posApiKey,
        p_phone: testPosPhone.trim(),
        p_amount: billValue,
        p_order_id: 'BILL-' + Math.floor(1000 + Math.random() * 9000),
      });

      if (error) {
        setPosTestResult({
          success: false,
          message: error.message || 'POS bill webhook failed',
        });
      } else if (data?.status === 'below_minimum') {
        setPosTestResult({
          success: false,
          message:
            data.message ||
            `Bill amount (${billValue}) is below the minimum limit (${data.min_bill_amount}) required for an automatic stamp.`,
        });
      } else if (data?.status === 'ok' || data?.status === 'card_full') {
        playStampFeedback();

        let waStatusText = 'Queued in Outbox';
        if (whatsappWebhookUrl.trim() && data.whatsapp_message) {
          const waRes = await relayWhatsAppOutboxMessage(
            whatsappWebhookUrl,
            whatsappApiToken,
            data.phone || testPosPhone.trim(),
            data.whatsapp_message,
            data.outbox_id
          );
          waStatusText = waRes.ok
            ? 'Sent via Background WhatsApp Gateway'
            : `Gateway Warning: ${waRes.error || 'Check Gateway URL'}`;
        }

        setPosTestResult({
          success: true,
          message: `✅ Bill Punched (${billValue})! Stamp Awarded (${data.current_stamps}/${data.stamps_required}) • WhatsApp: ${waStatusText}`,
        });
      } else {
        setPosTestResult({
          success: false,
          message: data?.message || 'Unexpected response status: ' + data?.status,
        });
      }
    } catch (e: any) {
      setPosTestResult({
        success: false,
        message: e?.message || 'Connection test failed',
      });
    } finally {
      setTestPosLoading(false);
    }
  };

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
        stamp_icon: selectedTheme.icon,
      };

      await saveShopTheme(shop.id, selectedTheme.id);

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
    } catch (e) {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(customerLink);
      }
    }
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
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
              🏬 Shop
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pipelineTab, activeTab === 'offers' && styles.pipelineTabActive]}
            onPress={() => setActiveTab('offers')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pipelineTabText, activeTab === 'offers' && styles.pipelineTabTextActive]}>
              📢 Offers & Menu
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pipelineTab, activeTab === 'whatsapp' && styles.pipelineTabActive]}
            onPress={() => setActiveTab('whatsapp')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pipelineTabText, activeTab === 'whatsapp' && styles.pipelineTabTextActive]}>
              💬 WhatsApp
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pipelineTab, activeTab === 'pos' && styles.pipelineTabActive]}
            onPress={() => setActiveTab('pos')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pipelineTabText, activeTab === 'pos' && styles.pipelineTabTextActive]}>
              🔌 POS & API
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
              🛡️ Cashier & Audio
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
              ⚖️ Account
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
                  {shop.logo_url ? (
                    <Image source={{ uri: shop.logo_url }} style={styles.shopAvatarSquircleImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.shopAvatarText}>{getShopInitials(shop.name)}</Text>
                  )}
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

                  <View style={styles.overviewRow}>
                    <Text style={styles.overviewLabel}>🎯 Reward Rule</Text>
                    <Text style={styles.overviewValue}>
                      {shop.stamps_required} stamps = {shop.reward_text}
                    </Text>
                  </View>

                  <View style={[styles.overviewRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.overviewLabel}>🎨 Stamp Symbol</Text>
                    <Text style={styles.overviewValue}>
                      {selectedTheme.icon} {selectedTheme.label}
                    </Text>
                  </View>
                </View>
              ) : (
                /* Expanded Edit Form */
                <View style={{ marginTop: 14 }}>
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

                  {/* Custom Stamp Icon & Brand Theme */}
                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>🎨 Stamp Icon & Brand Theme:</Text>
                  <View style={styles.themeSelectorGrid}>
                    {STAMP_THEMES.map((theme) => {
                      const isSelected = selectedTheme.id === theme.id;
                      return (
                        <TouchableOpacity
                          key={theme.id}
                          style={[styles.themeOptionPill, isSelected && styles.themeOptionPillSelected]}
                          onPress={() => setSelectedTheme(theme)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.themeOptionIcon}>{theme.icon}</Text>
                          <Text style={[styles.themeOptionLabel, isSelected && styles.themeOptionLabelSelected]} numberOfLines={1}>
                            {theme.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

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

            {/* Shop Brand & Logo Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🖼️ Shop Logo</Text>

              <View style={[styles.logoUploadRow, { marginTop: 12 }]}>
                <View style={styles.logoPreviewWrapper}>
                  {shop.logo_url ? (
                    <Image source={{ uri: shop.logo_url }} style={styles.logoPreviewImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.logoPlaceholder}>
                      <Text style={styles.logoPlaceholderIcon}>🏪</Text>
                      <Text style={styles.logoPlaceholderText}>No Logo</Text>
                    </View>
                  )}
                </View>

                <View style={styles.logoActionsCol}>
                  <TouchableOpacity
                    style={[styles.primaryButton, uploadingLogo && styles.buttonDisabled, { minHeight: 44, paddingVertical: 10 }]}
                    onPress={handlePickLogo}
                    disabled={uploadingLogo}
                    activeOpacity={0.7}
                  >
                    {uploadingLogo ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>📸 {shop.logo_url ? 'Change Logo' : 'Upload Logo'}</Text>
                    )}
                  </TouchableOpacity>

                  {shop.logo_url ? (
                    <TouchableOpacity
                      style={[styles.outlineButton, { marginTop: 8, borderColor: '#FCA5A5', minHeight: 40, paddingVertical: 8 }]}
                      onPress={handleRemoveLogo}
                      disabled={uploadingLogo}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.outlineButtonText, { color: '#DC2626', fontSize: 13 }]}>🗑️ Remove Logo</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>

            {/* My Branches Section */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>My Shops & Branches</Text>
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
        {/* TAB: OFFERS & FEATURED MENU */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'offers' && (
          <View>
            {/* Flash Offer / Promo Banner Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>🔥 Flash Offer Banner</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Displayed at the top of customer digital cards
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.smallAddBtn}
                  onPress={() => setIsEditingPromoBanner(!isEditingPromoBanner)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.smallAddBtnText}>
                    {isEditingPromoBanner ? '✕ Cancel' : (promoBanner ? '✏️ Edit Banner' : '+ Add Banner')}
                  </Text>
                </TouchableOpacity>
              </View>

              {!isEditingPromoBanner ? (
                <View style={{ marginTop: 10 }}>
                  {promoBanner ? (
                    <View
                      style={{
                        backgroundColor: '#FEF3C7',
                        borderColor: '#FDE68A',
                        borderWidth: 1,
                        borderRadius: 12,
                        padding: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>📢</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E', textTransform: 'uppercase' }}>
                          Active Promo Banner
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#78350F', marginTop: 2 }}>
                          {promoBanner}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 13, color: '#64748B', fontStyle: 'italic', paddingVertical: 6 }}>
                      No active flash offer banner. Tap "+ Add Banner" to display announcements or specials on customer cards.
                    </Text>
                  )}
                </View>
              ) : (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.inputLabel}>Offer / Announcement Text:</Text>
                  <TextInput
                    style={styles.input}
                    value={promoBanner}
                    onChangeText={setPromoBanner}
                    placeholder="e.g. Happy Hour 3-6PM: Double Stamps on all Karak!"
                    placeholderTextColor="#94A3B8"
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={[styles.primaryButton, { flex: 1, marginTop: 0 }, savingPromoMenu && styles.buttonDisabled]}
                      onPress={async () => {
                        await handleSavePromoAndMenu();
                        setIsEditingPromoBanner(false);
                      }}
                      disabled={savingPromoMenu}
                      activeOpacity={0.8}
                    >
                      {savingPromoMenu ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Save Banner</Text>
                      )}
                    </TouchableOpacity>

                    {promoBanner ? (
                      <TouchableOpacity
                        style={[styles.outlineButton, { flex: 0.6, marginTop: 0, marginBottom: 0, borderColor: '#FCA5A5' }]}
                        onPress={async () => {
                          setPromoBanner('');
                          await handleSavePromoAndMenu();
                          setIsEditingPromoBanner(false);
                        }}
                        disabled={savingPromoMenu}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.outlineButtonText, { color: '#DC2626' }]}>Remove</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              )}
            </View>

            {/* Featured Menu Items Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>🍽️ Featured Menu Items</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {featuredItems.length} item{featuredItems.length === 1 ? '' : 's'} shown on digital cards
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.smallAddBtn}
                  onPress={() => setIsAddingMenuItem(!isAddingMenuItem)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.smallAddBtnText}>{isAddingMenuItem ? '✕ Close' : '+ Add Item'}</Text>
                </TouchableOpacity>
              </View>

              {isAddingMenuItem && (
                <View
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderColor: '#E2E8F0',
                    borderWidth: 1,
                    borderRadius: 14,
                    padding: 12,
                    marginTop: 10,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 8 }}>
                    Add New Featured Item:
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                    <TextInput
                      style={[styles.input, { width: 48, textAlign: 'center', marginBottom: 0, paddingHorizontal: 4 }]}
                      value={newItemEmoji}
                      onChangeText={setNewItemEmoji}
                      placeholder="☕"
                    />
                    <TextInput
                      style={[styles.input, { flex: 1.4, marginBottom: 0 }]}
                      value={newItemName}
                      onChangeText={setNewItemName}
                      placeholder="Item name"
                      placeholderTextColor="#94A3B8"
                    />
                    <TextInput
                      style={[styles.input, { flex: 0.9, marginBottom: 0 }]}
                      value={newItemPrice}
                      onChangeText={setNewItemPrice}
                      placeholder="AED 12"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.primaryButton, { marginTop: 0 }]}
                    onPress={async () => {
                      if (!newItemName.trim()) return;
                      const next: FeaturedMenuItem[] = [
                        ...featuredItems,
                        {
                          name: newItemName.trim(),
                          price: newItemPrice.trim() || '',
                          icon: newItemEmoji.trim() || '☕',
                        },
                      ];
                      setFeaturedItems(next);
                      setNewItemName('');
                      setNewItemPrice('');
                      setIsAddingMenuItem(false);
                      await handleSavePromoAndMenu(next);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryButtonText}>+ Add to Menu</Text>
                  </TouchableOpacity>
                </View>
              )}

              {featuredItems.length > 0 ? (
                <View style={{ gap: 8, marginTop: isAddingMenuItem ? 0 : 10 }}>
                  {featuredItems.map((it, idx) => (
                    <View
                      key={idx}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#F8FAFC',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Text style={{ fontSize: 18 }}>{it.icon || '🍽️'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{it.name}</Text>
                          {it.price ? (
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#2563EB', marginTop: 2 }}>
                              {it.price}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={async () => {
                          const next = featuredItems.filter((_, i) => i !== idx);
                          setFeaturedItems(next);
                          await handleSavePromoAndMenu(next);
                        }}
                        style={{ padding: 6 }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#DC2626' }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                !isAddingMenuItem && (
                  <Text style={{ fontSize: 13, color: '#64748B', fontStyle: 'italic', marginTop: 8 }}>
                    No featured items yet. Tap "+ Add Item" to showcase bestsellers on customer cards.
                  </Text>
                )
              )}
            </View>
          </View>
        )}

        {/* -------------------------------------------------------- */}
        {/* TAB: WHATSAPP AUTOMATION PIPELINE */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'whatsapp' && (
          <View>
            {/* Live Gateway Status Header Banner */}
            <View
              style={{
                backgroundColor: (shop.whatsapp_webhook_url || whatsappWebhookUrl) ? '#F0FDF4' : '#EFF6FF',
                borderColor: (shop.whatsapp_webhook_url || whatsappWebhookUrl) ? '#BBF7D0' : '#BFDBFE',
                borderWidth: 1.5,
                borderRadius: 14,
                padding: 14,
                marginBottom: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 26 }}>{(shop.whatsapp_webhook_url || whatsappWebhookUrl) ? '⚡' : '💬'}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '800',
                    color: (shop.whatsapp_webhook_url || whatsappWebhookUrl) ? '#166534' : '#1E40AF',
                  }}
                >
                  {(shop.whatsapp_webhook_url || whatsappWebhookUrl)
                    ? 'Automated WhatsApp Gateway Connected'
                    : 'WhatsApp Ready (Device App & Web Fallback)'}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: (shop.whatsapp_webhook_url || whatsappWebhookUrl) ? '#15803D' : '#3B82F6',
                    marginTop: 2,
                    lineHeight: 16,
                  }}
                >
                  {(shop.whatsapp_webhook_url || whatsappWebhookUrl)
                    ? 'Silent background automation is active. Customer stamp receipts & win-back campaigns dispatch automatically.'
                    : 'Configure your WhatsApp Instance ID below for 100% background dispatch, or use 1-tap WhatsApp Web.'}
                </Text>
              </View>
            </View>

            {/* Section 1: WhatsApp Gateway Credentials (COLLAPSIBLE) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>⚙️ Gateway Configuration</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {(shop.whatsapp_webhook_url || whatsappWebhookUrl)
                      ? 'External gateway linked'
                      : 'Not configured'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.smallAddBtn}
                  onPress={() => setIsConfiguringWhatsApp(!isConfiguringWhatsApp)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.smallAddBtnText}>
                    {isConfiguringWhatsApp
                      ? '✕ Close'
                      : ((shop.whatsapp_webhook_url || whatsappWebhookUrl) ? '✏️ Configure' : '+ Setup')}
                  </Text>
                </TouchableOpacity>
              </View>

              {!isConfiguringWhatsApp ? (
                <View style={{ marginTop: 10 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: '#F1F5F9',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>Instance / Endpoint:</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', maxWidth: 200 }} numberOfLines={1}>
                      {whatsappWebhookUrl || 'Not configured'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>API Token:</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                      {whatsappApiToken ? '••••••••' : 'None'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: '#475569', marginBottom: 10, lineHeight: 18 }}>
                    Supports <Text style={{ fontWeight: '700' }}>Green-API</Text> (Instance ID & Token),{' '}
                    <Text style={{ fontWeight: '700' }}>UltraMsg</Text>,{' '}
                    <Text style={{ fontWeight: '700' }}>CallMeBot</Text>,{' '}
                    <Text style={{ fontWeight: '700' }}>Meta Cloud API</Text>, or custom webhook endpoints.
                  </Text>

                  <Text style={styles.inputLabel}>Instance ID or Full Webhook URL:</Text>
                  <TextInput
                    style={styles.input}
                    value={whatsappWebhookUrl}
                    onChangeText={setWhatsappWebhookUrl}
                    placeholder="e.g. 7103948123 or https://api.green-api.com/..."
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                  />

                  <Text style={styles.inputLabel}>API Token / Key:</Text>
                  <TextInput
                    style={styles.input}
                    value={whatsappApiToken}
                    onChangeText={setWhatsappApiToken}
                    placeholder="e.g. API Token"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry
                    autoCapitalize="none"
                  />

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={[styles.primaryButton, { flex: 1, marginTop: 0 }, savingPosRules && styles.buttonDisabled]}
                      onPress={async () => {
                        await handleSavePosRules();
                        setIsConfiguringWhatsApp(false);
                      }}
                      disabled={savingPosRules}
                      activeOpacity={0.8}
                    >
                      {savingPosRules ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryButtonText}>💾 Save Gateway</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.outlineButton, { flex: 0.6, marginTop: 0, marginBottom: 0 }]}
                      onPress={() => setIsConfiguringWhatsApp(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.outlineButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Section 2: Outbox Queue & Real Delivery Engine */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>📬 Live WhatsApp Outbox</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {outboxItems.filter((m) => m.status === 'queued').length} message(s) waiting in queue
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.smallAddBtn, { backgroundColor: '#F1F5F9' }]}
                  onPress={fetchOutboxMessages}
                  disabled={loadingOutbox}
                  activeOpacity={0.7}
                >
                  {loadingOutbox ? (
                    <ActivityIndicator size="small" color="#475569" />
                  ) : (
                    <Text style={[styles.smallAddBtnText, { color: '#475569' }]}>🔄 Refresh</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Action to dispatch all queued messages */}
              {outboxItems.filter((m) => m.status === 'queued').length > 0 && (
                <View
                  style={{
                    backgroundColor: '#FEF3C7',
                    borderColor: '#FDE68A',
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 12,
                    marginTop: 12,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 4 }}>
                    ⚠️ {outboxItems.filter((m) => m.status === 'queued').length} message(s) waiting in queue
                  </Text>
                  <Text style={{ fontSize: 12, color: '#78350F', marginBottom: 10, lineHeight: 16 }}>
                    Tap below to immediately deliver all pending messages to customer WhatsApp numbers.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      { backgroundColor: '#16A34A', marginTop: 0 },
                      processingOutbox && styles.buttonDisabled,
                    ]}
                    onPress={handleSendAllQueuedOutbox}
                    disabled={processingOutbox}
                    activeOpacity={0.8}
                  >
                    {processingOutbox ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>🚀 Dispatch All Queued Messages Now</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Outbox Items List */}
              <View style={{ marginTop: 12 }}>
                {outboxItems.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {outboxItems.map((item) => {
                      const isQueued = item.status === 'queued';
                      const isSent = item.status === 'sent';
                      return (
                        <View
                          key={item.id}
                          style={{
                            backgroundColor: '#F8FAFC',
                            borderColor: isQueued ? '#FDE68A' : isSent ? '#BBF7D0' : '#E2E8F0',
                            borderWidth: 1,
                            borderRadius: 12,
                            padding: 12,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                              {item.recipient_phone}
                            </Text>
                            <View
                              style={{
                                backgroundColor: isQueued ? '#FEF3C7' : isSent ? '#DCFCE7' : '#F1F5F9',
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '800',
                                  color: isQueued ? '#92400E' : isSent ? '#15803D' : '#64748B',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {item.status}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 12, color: '#475569', marginTop: 4 }} numberOfLines={2}>
                            {item.message_text}
                          </Text>
                          {isQueued && (
                            <TouchableOpacity
                              style={{
                                alignSelf: 'flex-start',
                                marginTop: 8,
                                backgroundColor: '#25D366',
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 6,
                              }}
                              onPress={() => {
                                const cleanPhone = item.recipient_phone.replace(/[^0-9]/g, '');
                                const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(item.message_text)}`;
                                Linking.openURL(waUrl);
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                                💬 Open in WhatsApp
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: '#64748B', fontStyle: 'italic', paddingVertical: 8 }}>
                    No messages currently in outbox.
                  </Text>
                )}
              </View>
            </View>

            {/* Section 3: Test WhatsApp Message Sender */}
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 10 }]}>📲 Send Test WhatsApp</Text>
              <Text style={styles.inputLabel}>Recipient Phone Number:</Text>
              <TextInput
                style={styles.input}
                value={testPosPhone}
                onChangeText={setTestPosPhone}
                placeholder="e.g. +971501234567"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
              />

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  testingWhatsApp && styles.buttonDisabled,
                  { backgroundColor: '#15803D', marginTop: 4 },
                ]}
                onPress={handleTestWhatsAppGateway}
                disabled={testingWhatsApp}
                activeOpacity={0.8}
              >
                {testingWhatsApp ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>📲 Send Test Message Now</Text>
                )}
              </TouchableOpacity>

              {posTestResult && (
                <View
                  style={[
                    styles.testResultBanner,
                    posTestResult.success ? styles.testResultSuccess : styles.testResultError,
                  ]}
                >
                  <Text
                    style={[
                      styles.testResultText,
                      { color: posTestResult.success ? '#065F46' : '#991B1B' },
                    ]}
                  >
                    {posTestResult.success ? '✓ ' : '⚠️ '}
                    {posTestResult.message}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* -------------------------------------------------------- */}
        {/* TAB 2: REGION & COUNTRY */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'region' && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: 12 }]}>🌍 Shop Country & Phone Format</Text>

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
        {/* TAB 3: CASHIER & AUDIO PREFERENCES */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'security' && (
          <View>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 12 }]}>🛡️ Cashier Lock & Manager PIN</Text>

              {/* Secure PIN Status Box */}
              <View style={styles.securePinBox}>
                <View>
                  <Text style={styles.securePinLabel}>Manager PIN</Text>
                  <Text style={styles.securePinMasked}>••••</Text>
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
                <Text style={styles.cashierModeButtonText}>🔒 Enter Cashier Mode</Text>
              </TouchableOpacity>
            </View>

            {/* Counter Sound & Haptic Feedback Card */}
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 8 }]}>🔊 Sound & Vibration</Text>

              <View style={styles.settingToggleRow}>
                <Text style={styles.settingToggleTitle}>Sound Effects</Text>
                <Switch
                  value={soundEnabled}
                  onValueChange={handleToggleSound}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={soundEnabled ? '#2563EB' : '#F8FAFC'}
                />
              </View>

              <View style={[styles.settingToggleRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.settingToggleTitle}>Vibration</Text>
                <Switch
                  value={hapticsEnabled}
                  onValueChange={handleToggleHaptics}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={hapticsEnabled ? '#2563EB' : '#F8FAFC'}
                />
              </View>

              {/* Sound Audition Buttons */}
              <View style={styles.feedbackTestRow}>
                <TouchableOpacity
                  style={styles.feedbackTestBtn}
                  onPress={() => playStampFeedback()}
                  activeOpacity={0.7}
                >
                  <Text style={styles.feedbackTestBtnText}>▶️ Stamp Sound</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.feedbackTestBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
                  onPress={() => playRewardFeedback()}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.feedbackTestBtnText, { color: '#B45309' }]}>🏆 Reward Sound</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.feedbackTestBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                  onPress={() => playNotificationFeedback()}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.feedbackTestBtnText, { color: '#1D4ED8' }]}>🔔 Notification Sound</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* -------------------------------------------------------- */}
        {/* TAB: POS & EXTERNAL API INTEGRATIONS */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'pos' && (
          <View>
            {/* User Manual & Web POS Action Row */}
            <View
              style={[
                styles.card,
                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, gap: 10 },
              ]}
            >
              <TouchableOpacity
                style={[styles.primaryButton, { flex: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 42, marginTop: 0 }]}
                onPress={() => setPosManualModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.primaryButtonText, { fontSize: 13 }]}>📖 POS User Manual</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.outlineButton,
                  { flex: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 42, marginTop: 0, marginBottom: 0 },
                ]}
                onPress={() => {
                  const posUrl = `${customerWebBase.replace(/\/+$/, '')}/pos.html?key=${encodeURIComponent(posApiKey)}`;
                  Linking.openURL(posUrl);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.outlineButtonText, { fontSize: 13 }]}>🖥️ Open Web POS</Text>
              </TouchableOpacity>
            </View>

            {/* Minimum Bill Amount Rule (COLLAPSIBLE) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>💰 Minimum Bill Rule</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {shop.min_bill_amount && shop.min_bill_amount > 0
                      ? `Minimum ${shop.min_bill_amount} AED required per stamp`
                      : 'No minimum (Any bill earns a stamp)'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.smallAddBtn}
                  onPress={() => setIsConfiguringPosRules(!isConfiguringPosRules)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.smallAddBtnText}>{isConfiguringPosRules ? '✕ Close' : '✏️ Configure'}</Text>
                </TouchableOpacity>
              </View>

              {!isConfiguringPosRules ? (
                <View style={{ marginTop: 10 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>
                      Required Bill per Stamp:
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                      {minBillAmountInput && parseFloat(minBillAmountInput) > 0
                        ? `${minBillAmountInput} AED`
                        : '0 (Any amount)'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.inputLabel}>Minimum Bill Amount (AED):</Text>
                  <TextInput
                    style={styles.input}
                    value={minBillAmountInput}
                    onChangeText={(t) => setMinBillAmountInput(t.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={[styles.primaryButton, { flex: 1, marginTop: 0 }, savingPosRules && styles.buttonDisabled]}
                      onPress={async () => {
                        await handleSavePosRules();
                        setIsConfiguringPosRules(false);
                      }}
                      disabled={savingPosRules}
                      activeOpacity={0.8}
                    >
                      {savingPosRules ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Save Rule</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.outlineButton, { flex: 0.6, marginTop: 0, marginBottom: 0 }]}
                      onPress={() => setIsConfiguringPosRules(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.outlineButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Counter Terminal Pairing Code Card */}
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 10 }]}>📱 Counter Terminal Code</Text>

              <View style={styles.posCodeCard}>
                <Text style={styles.posCodeLabel}>6-Digit Terminal PIN</Text>
                <Text style={styles.posCodeText}>
                  {posTerminalCode
                    ? `${posTerminalCode.slice(0, 3)} ${posTerminalCode.slice(3, 6)}`
                    : '------'}
                </Text>

                <View style={styles.posCodeButtonsRow}>
                  <TouchableOpacity
                    style={styles.posCodeBtn}
                    onPress={() => {
                      if (posTerminalCode) {
                        Clipboard.setStringAsync(posTerminalCode);
                        Alert.alert('Copied!', 'Terminal code copied to clipboard.');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.posCodeBtnText}>📋 Copy Code</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.posCodeBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                    onPress={handleRefreshTerminalCode}
                    disabled={posLoading}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.posCodeBtnText, { color: '#1D4ED8' }]}>🔄 Refresh Code</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Secret POS API Key Card */}
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 10 }]}>🔑 Secret POS API Key</Text>

              <View style={styles.posKeyBox}>
                <Text style={styles.posKeyText} numberOfLines={1}>
                  {posApiKey
                    ? showApiKey
                      ? posApiKey
                      : `${posApiKey.slice(0, 10)}••••••••••••••••`
                    : 'Generating key...'}
                </Text>

                <TouchableOpacity
                  onPress={() => setShowApiKey(!showApiKey)}
                  style={{ padding: 4 }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563EB' }}>
                    {showApiKey ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.primaryButton, { flex: 1, minHeight: 44, paddingVertical: 10, marginTop: 0 }]}
                  onPress={() => {
                    if (posApiKey) {
                      Clipboard.setStringAsync(posApiKey);
                      Alert.alert('Copied!', 'Secret API Key copied to clipboard.');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.primaryButtonText}>📋 Copy API Key</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.outlineButton,
                    { flex: 0.9, marginTop: 0, marginBottom: 0, minHeight: 44, paddingVertical: 10 },
                  ]}
                  onPress={handleRegenerateKey}
                  disabled={posLoading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.outlineButtonText}>🔄 Regenerate</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Live POS Bill Terminal Simulator (COLLAPSIBLE) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>⚡ POS Bill Punch Simulator</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Test instant bill stamping directly inside the app
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.smallAddBtn}
                  onPress={() => setIsSimulatingPos(!isSimulatingPos)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.smallAddBtnText}>{isSimulatingPos ? '✕ Close' : '▶️ Open Simulator'}</Text>
                </TouchableOpacity>
              </View>

              {isSimulatingPos && (
                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1.4 }}>
                      <Text style={styles.inputLabel}>Customer Phone:</Text>
                      <TextInput
                        style={styles.input}
                        value={testPosPhone}
                        onChangeText={setTestPosPhone}
                        placeholder="+971501234567"
                        placeholderTextColor="#94A3B8"
                        keyboardType="phone-pad"
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Bill Amount:</Text>
                      <TextInput
                        style={styles.input}
                        value={testPosAmount}
                        onChangeText={(t) => setTestPosAmount(t.replace(/[^0-9.]/g, ''))}
                        placeholder="25.00"
                        placeholderTextColor="#94A3B8"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, testPosLoading && styles.buttonDisabled, { marginTop: 4 }]}
                    onPress={handleTestWebhook}
                    disabled={testPosLoading}
                    activeOpacity={0.7}
                  >
                    {testPosLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>⚡ Punch Bill</Text>
                    )}
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <TouchableOpacity
                      style={[
                        styles.outlineButton,
                        { flex: 1, marginTop: 0, marginBottom: 0, minHeight: 42, paddingVertical: 8 },
                      ]}
                      onPress={() => {
                        const posUrl = `${customerWebBase.replace(/\/+$/, '')}/pos.html?key=${encodeURIComponent(posApiKey)}`;
                        Clipboard.setStringAsync(posUrl);
                        Alert.alert('Copied!', 'Web POS Terminal link copied to clipboard.');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.outlineButtonText, { fontSize: 13 }]}>📋 Copy POS Link</Text>
                    </TouchableOpacity>
                  </View>

                  {posTestResult && (
                    <View
                      style={[
                        styles.testResultBanner,
                        posTestResult.success ? styles.testResultSuccess : styles.testResultError,
                      ]}
                    >
                      <Text
                        style={[
                          styles.testResultText,
                          { color: posTestResult.success ? '#065F46' : '#991B1B' },
                        ]}
                      >
                        {posTestResult.success ? '✓ ' : '⚠️ '}
                        {posTestResult.message}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Webhook & REST API Documentation Card */}
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 10 }]}>🌐 POS Webhook Endpoint</Text>

              <Text style={styles.inputLabel}>1-Click Universal Webhook URL:</Text>
              <View style={[styles.posKeyBox, { marginBottom: 10 }]}>
                <Text style={[styles.posKeyText, { fontSize: 12 }]} numberOfLines={1}>
                  {`${customerWebBase.replace(/\/+$/, '')}/api/pos-webhook?key=${posApiKey}`}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const url = `${customerWebBase.replace(/\/+$/, '')}/api/pos-webhook?key=${posApiKey}`;
                    Clipboard.setStringAsync(url);
                    Alert.alert('Copied!', 'Universal POS Webhook URL copied to clipboard.');
                  }}
                  style={{ padding: 4 }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563EB' }}>Copy</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Direct Supabase RPC URL:</Text>
              <View style={styles.posKeyBox}>
                <Text style={[styles.posKeyText, { fontSize: 12 }]} numberOfLines={1}>
                  {getPosWebhookUrl()}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    Clipboard.setStringAsync(getPosWebhookUrl());
                    Alert.alert('Copied!', 'Endpoint URL copied to clipboard.');
                  }}
                  style={{ padding: 4 }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563EB' }}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* -------------------------------------------------------- */}
        {/* TAB 4: QR & PRINTABLE STAND */}
        {/* -------------------------------------------------------- */}
        {activeTab === 'qr' && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: 12 }]}>📱 Customer QR Code</Text>

            <ShopQRCode shopName={shop.name} customerLink={customerLink} />

            <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyLink} activeOpacity={0.7}>
              <Text style={styles.secondaryButtonText}>
                {copiedNotification ? '✓ Link Copied!' : '📋 Copy Customer Link'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.whatsAppShareButton}
              onPress={() => {
                const text = `Join *${shop.name}* Loyalty Rewards! 🎁\nCollect stamps and unlock: *${shop.reward_text}*.\n\nOpen your digital loyalty card here:\n${customerLink}`;
                const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                Linking.openURL(url).catch(() => {
                  Alert.alert('WhatsApp Error', 'Could not open WhatsApp on this device.');
                });
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.whatsAppShareButtonText}>
                💬 Share on WhatsApp
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.printFlyerButton}
              onPress={() => {
                const flyerUrl = `${customerWebBase.replace(/\/+$/, '')}/flyer.html?shop=${slug}&name=${encodeURIComponent(shop.name)}&reward=${encodeURIComponent(shop.reward_text)}&stamps=${shop.stamps_required}`;
                Linking.openURL(flyerUrl);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.printFlyerButtonText}>
                🖨️ Counter Flyer
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
              <Text style={styles.outlineButtonText}>📄 Privacy Policy</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <Text style={styles.accountLabel}>{strings.auth.loggedInAs}:</Text>
            <Text style={styles.accountEmail}>{userEmail}</Text>

            <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.7}>
              <Text style={styles.logoutButtonText}>{strings.settings.logout}</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { marginTop: 24 }]} />

            <TouchableOpacity style={[styles.logoutButton, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1 }]} onPress={handleDeleteAccount} activeOpacity={0.7}>
              <Text style={[styles.logoutButtonText, { color: '#DC2626' }]}>🗑️ Delete Account</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* -------------------------------------------------------- */}
      {/* MODAL: POS & WHATSAPP USER MANUAL */}
      {/* -------------------------------------------------------- */}
      <Modal
        visible={posManualModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPosManualModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxHeight: '88%' }]}>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>📖 POS & WhatsApp User Manual</Text>
              <Text style={styles.modalSubtitle}>
                Complete step-by-step guide to connect any POS billing system and automate background WhatsApp messages.
              </Text>

              <Text style={styles.policyHeading}>1. How Automatic Bill Punching Works</Text>
              <Text style={styles.policyBody}>
                • Set your Minimum Bill Amount in the POS tab (e.g. 20.00).{'\n'}
                • Whenever a bill is punched with the customer's phone number and the bill amount is equal to or above your minimum limit, StampUp automatically adds +1 stamp (or unlocks a reward) and dispatches a WhatsApp update in the background.{'\n'}
                • You never need to open the WhatsApp app or tap Send manually.
              </Text>

              <Text style={styles.policyHeading}>2. How to Enable 100% Background WhatsApp</Text>
              <Text style={styles.policyBody}>
                Because iOS & Android block apps from silently pressing "Send" inside your personal WhatsApp app, background sending uses a WhatsApp Cloud Gateway. Connect any of these in 2 minutes:{'\n\n'}
                • Option A: Green-API (Recommended — Free tier available){'\n'}
                1. Go to green-api.com and create a free instance.{'\n'}
                2. Scan the QR code with your shop's WhatsApp Business phone.{'\n'}
                3. Copy your SendMessage URL:{'\n'}
                https://api.green-api.com/waInstanceXXXX/sendMessage/TOKEN{'\n'}
                4. Paste it into "WhatsApp Gateway URL" and tap Save Rules.{'\n\n'}
                • Option B: UltraMsg{'\n'}
                1. Go to ultramsg.com and link your shop WhatsApp.{'\n'}
                2. Paste https://api.ultramsg.com/instanceXXXX/messages/chat into "WhatsApp Gateway URL".{'\n'}
                3. Paste your token into "WhatsApp API Token" and tap Save Rules.{'\n\n'}
                • Option C: TextMeBot / CallMeBot{'\n'}
                1. Paste https://api.textmebot.com/send.php into "WhatsApp Gateway URL" and your API key into "WhatsApp API Token".{'\n\n'}
                • Option D: Meta Official Cloud API or Make.com / Zapier{'\n'}
                1. Paste your graph.facebook.com messages URL or Make/Zapier webhook URL and Bearer Token.{'\n'}
                2. Tap "📲 Test WhatsApp" to verify instant background delivery!
              </Text>

              <Text style={styles.policyHeading}>3. Connecting Any POS Software (Webhook API)</Text>
              <Text style={styles.policyBody}>
                Works with Square, Clover, Loyverse, Shopify POS, Toast, Zoho, or custom billing software:{'\n\n'}
                1. Copy your Endpoint URL and Secret POS API Key from the POS tab.{'\n'}
                2. In your POS software (or via Make.com / Zapier POS trigger), configure an HTTP POST request on "Order Completed / Bill Paid" to:{'\n'}
                {getPosWebhookUrl()}{'\n\n'}
                3. Include Headers:{'\n'}
                Content-Type: application/json{'\n'}
                apikey: (Your Supabase Anon Key){'\n\n'}
                4. Send JSON Body:{'\n'}
                {`{\n  "p_api_key": "${posApiKey ? posApiKey.slice(0, 12) + '...' : 'sp_live_xxxx'}",\n  "p_phone": "+971501234567",\n  "p_amount": 25.00,\n  "p_order_id": "BILL-101"\n}`}
              </Text>

              <Text style={styles.policyHeading}>4. Pairing Counter Cashier Tablets</Text>
              <Text style={styles.policyBody}>
                • Use the 6-Digit Terminal PIN on the POS tab to log in secondary counter phones or tablets without sharing your owner email or password.
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 18 }]}
                onPress={() => setPosManualModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Got It</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

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

      {/* -------------------------------------------------------- */}
      {/* MODAL: DELETE ACCOUNT (PASSWORD / PIN PROTECTED) */}
      {/* -------------------------------------------------------- */}
      <Modal
        visible={deleteAccountModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          if (!deletingAccount) {
            setDeleteAccountModalVisible(false);
            setDeleteAuthInput('');
            setDeleteAuthError(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxWidth: 380, borderColor: '#FCA5A5', borderWidth: 1.5 }]}>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>⚠️</Text>
                <Text style={[styles.modalTitle, { color: '#DC2626', textAlign: 'center' }]}>
                  Delete Account
                </Text>
                <Text style={[styles.modalSubtitle, { textAlign: 'center', color: '#64748B', marginTop: 4 }]}>
                  This action is permanent and cannot be undone. All your shops, customer stamp cards, and loyalty data will be permanently wiped.
                </Text>
              </View>

              <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 }}>
                <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '700', marginBottom: 2 }}>
                  🔒 PASSWORD PROTECTED
                </Text>
                <Text style={{ color: '#7F1D1D', fontSize: 12, lineHeight: 16 }}>
                  Enter your StampUp account password or your 4-digit Manager PIN to confirm permanent account deletion.
                </Text>
              </View>

              <Text style={styles.inputLabel}>Account Password or Manager PIN:</Text>
              <TextInput
                style={[styles.input, { borderColor: deleteAuthError ? '#EF4444' : '#E2E8F0', fontSize: 16 }]}
                placeholder="Enter password or PIN"
                placeholderTextColor="#94A3B8"
                value={deleteAuthInput}
                onChangeText={(text) => {
                  setDeleteAuthInput(text);
                  if (deleteAuthError) setDeleteAuthError(null);
                }}
                secureTextEntry={true}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {deleteAuthError ? (
                <View style={[styles.errorBox, { marginTop: 4, marginBottom: 14 }]}>
                  <Text style={styles.errorText}>{deleteAuthError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: '#DC2626', marginTop: 8 },
                  (!deleteAuthInput.trim() || deletingAccount) && { opacity: 0.6 }
                ]}
                onPress={handleConfirmDeleteAccount}
                disabled={!deleteAuthInput.trim() || deletingAccount}
                activeOpacity={0.7}
              >
                {deletingAccount ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Permanently Delete Account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.closeModalButton, { marginTop: 10 }]}
                onPress={() => {
                  setDeleteAccountModalVisible(false);
                  setDeleteAuthInput('');
                  setDeleteAuthError(null);
                }}
                disabled={deletingAccount}
                activeOpacity={0.7}
              >
                <Text style={styles.closeModalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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

  /* Sound & Haptics Preferences */
  settingToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  settingToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  settingToggleSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  feedbackTestRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  feedbackTestBtn: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackTestBtnText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Buttons & Inputs */
  secondaryButton: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '700',
  },
  whatsAppShareButton: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  whatsAppShareButtonText: {
    color: '#047857',
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
  themeSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
    marginTop: 4,
  },
  themeOptionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 6,
  },
  themeOptionPillSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  themeOptionIcon: {
    fontSize: 16,
  },
  themeOptionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  themeOptionLabelSelected: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  inputSubLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
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

  /* Shop Logo Styles */
  shopAvatarSquircleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  logoUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 14,
  },
  logoPreviewWrapper: {
    width: 84,
    height: 84,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoPreviewImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholderIcon: {
    fontSize: 28,
    marginBottom: 2,
  },
  logoPlaceholderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  logoActionsCol: {
    flex: 1,
    justifyContent: 'center',
  },

  /* POS Integration Styles */
  posCodeCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    alignItems: 'center',
  },
  posCodeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  posCodeText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2563EB',
    letterSpacing: 6,
  },
  posCodeExpiry: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '600',
  },
  posCodeButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    width: '100%',
  },
  posCodeBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posCodeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  posKeyBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posKeyText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  posCodeSnippet: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  posCodeSnippetText: {
    color: '#38BDF8',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  testResultBanner: {
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  testResultSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
  },
  testResultError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
  },
  testResultText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
