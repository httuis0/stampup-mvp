// ============================================================
// Screen: Customers & Activity Screen
// Displays KPI totals, customer search, filter tabs,
// customer profile with squircle avatar and progress bar,
// 90-day date-wise activity history, and privacy/GDPR deletion.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Modal,
  Alert,
  RefreshControl,
  Platform,
  Share,
  ScrollView,
  Linking,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { strings } from '../constants/strings';
import { formatPhoneDisplay } from '../utils/phone';
import type { Shop, Customer } from '../types';

interface CustomersScreenProps {
  shop: Shop;
}

interface HistoryEvent {
  id: string;
  type: 'stamp' | 'reward';
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  type: 'stamp' | 'reward';
  customer_id?: string;
  customer_phone: string;
  customer_name?: string | null;
  created_at: string;
}

// Helper to generate 2-letter initials from customer name or phone
const getInitials = (name?: string | null, phone?: string): string => {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (digits.length >= 2) {
    return digits.slice(-2);
  }
  return 'CU';
};

const customerWebBase =
  process.env.EXPO_PUBLIC_CUSTOMER_WEB_URL || 'https://stampup-cards.vercel.app';

const sendWhatsApp = (phone: string, text: string) => {
  const cleanDigits = phone.replace(/[^0-9]/g, '');
  const encoded = encodeURIComponent(text);
  const url = `https://wa.me/${cleanDigits}?text=${encoded}`;
  Linking.openURL(url).catch(() => {
    Alert.alert('WhatsApp Error', 'Could not open WhatsApp on this device.');
  });
};

export const CustomersScreen: React.FC<CustomersScreenProps> = ({ shop }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ready'>('all');

  // Selected customer for detail / deletion modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<HistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [, setErrorMessage] = useState<string | null>(null);

  // Date-Wise Customer Activity (90 Days) Modal
  const [dateModalVisible, setDateModalVisible] = useState<boolean>(false);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [dateActivityLoading, setDateActivityLoading] = useState<boolean>(false);
  const [activitySearchQuery, setActivitySearchQuery] = useState<string>('');

  // Fetch individual customer history when selected
  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerHistory([]);
      return;
    }

    let isMounted = true;
    setHistoryLoading(true);

    const fetchHistory = async () => {
      try {
        const { data, error } = await supabase.rpc('get_customer_history', {
          p_shop_id: shop.id,
          p_customer_id: selectedCustomer.id,
        });

        if (!error && data && Array.isArray(data.events)) {
          if (isMounted) setCustomerHistory(data.events);
        } else {
          // Fallback direct query
          const { data: stampData } = await supabase
            .from('stamps')
            .select('id, created_at')
            .eq('shop_id', shop.id)
            .eq('customer_id', selectedCustomer.id);

          const { data: rewardData } = await supabase
            .from('rewards')
            .select('id, created_at')
            .eq('shop_id', shop.id)
            .eq('customer_id', selectedCustomer.id);

          const combined: HistoryEvent[] = [
            ...(stampData || []).map((s) => ({ id: s.id, type: 'stamp' as const, created_at: s.created_at })),
            ...(rewardData || []).map((r) => ({ id: r.id, type: 'reward' as const, created_at: r.created_at })),
          ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          if (isMounted) setCustomerHistory(combined);
        }
      } catch (e) {
        if (isMounted) setCustomerHistory([]);
      } finally {
        if (isMounted) setHistoryLoading(false);
      }
    };

    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [selectedCustomer, shop.id]);

  // Load customer list from Supabase
  const fetchCustomers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('shop_id', shop.id)
        .order('last_stamp_at', { ascending: false, nullsFirst: false });

      if (error) {
        console.error('Error fetching customers:', error);
        setErrorMessage(error.message);
      } else {
        setCustomers((data as Customer[]) || []);
        setErrorMessage(null);
      }
    } catch (err: any) {
      console.error('Fetch customers exception:', err);
      setErrorMessage(err?.message || strings.common.error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shop.id]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCustomers();
  };

  // Calculate totals & ready count
  const totalCustomers = customers.length;
  const totalStampsCurrent = customers.reduce((sum, c) => sum + (c.current_stamps || 0), 0);
  const totalRewardsGiven = customers.reduce((sum, c) => sum + (c.rewards_given || 0), 0);
  const readyCount = customers.filter((c) => (c.current_stamps || 0) >= shop.stamps_required).length;

  // Filter customers by search query and filter status
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (filterStatus === 'ready' && (c.current_stamps || 0) < shop.stamps_required) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const cleanSearch = searchQuery.replace(/[^0-9]/g, '');
      const cleanPhone = c.phone.replace(/[^0-9]/g, '');
      const matchPhoneDigits = cleanSearch.length > 0 && cleanPhone.includes(cleanSearch);
      const matchRawPhone = c.phone.toLowerCase().includes(searchQuery.toLowerCase());
      const matchName = c.name ? c.name.toLowerCase().includes(searchQuery.toLowerCase()) : false;
      return matchPhoneDigits || matchRawPhone || matchName;
    });
  }, [customers, filterStatus, searchQuery, shop.stamps_required]);

  // Fetch date-wise customer activity across last 90 days (3 months)
  const fetchDateActivity = useCallback(async () => {
    setDateActivityLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_shop_activity_log', {
        p_shop_id: shop.id,
        p_days: 90,
      });

      if (!error && data && Array.isArray(data.events)) {
        setActivityEvents(data.events);
      } else {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const iso90 = ninetyDaysAgo.toISOString();

        const [stampsRes, rewardsRes, custRes] = await Promise.all([
          supabase
            .from('stamps')
            .select('id, customer_id, created_at')
            .eq('shop_id', shop.id)
            .gte('created_at', iso90)
            .order('created_at', { ascending: false }),
          supabase
            .from('rewards')
            .select('id, customer_id, created_at')
            .eq('shop_id', shop.id)
            .gte('created_at', iso90)
            .order('created_at', { ascending: false }),
          supabase
            .from('customers')
            .select('id, phone, name')
            .eq('shop_id', shop.id),
        ]);

        const custMap = new Map<string, { phone: string; name?: string | null }>();
        (custRes.data || []).forEach((c: any) => {
          custMap.set(c.id, { phone: c.phone, name: c.name });
        });

        const combined: ActivityEvent[] = [];
        (stampsRes.data || []).forEach((s: any) => {
          const cust = custMap.get(s.customer_id);
          combined.push({
            id: s.id,
            type: 'stamp',
            customer_id: s.customer_id,
            customer_phone: cust?.phone || 'Customer',
            customer_name: cust?.name || null,
            created_at: s.created_at,
          });
        });

        (rewardsRes.data || []).forEach((r: any) => {
          const cust = custMap.get(r.customer_id);
          combined.push({
            id: r.id,
            type: 'reward',
            customer_id: r.customer_id,
            customer_phone: cust?.phone || 'Customer',
            customer_name: cust?.name || null,
            created_at: r.created_at,
          });
        });

        combined.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setActivityEvents(combined);
      }
    } catch (e) {
      console.error('Error fetching date activity:', e);
    } finally {
      setDateActivityLoading(false);
    }
  }, [shop.id]);

  useEffect(() => {
    if (dateModalVisible) {
      fetchDateActivity();
    }
  }, [dateModalVisible, fetchDateActivity]);

  // Handle Customer Deletion (GDPR / Privacy Request)
  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;

    setDeleting(true);

    try {
      const { error } = await supabase.rpc('delete_customer', {
        p_shop_id: shop.id,
        p_phone: selectedCustomer.phone,
      });

      if (error) {
        Alert.alert('Error', error.message || strings.common.error);
      } else {
        await fetchCustomers();
        setDeleteConfirmVisible(false);
        setSelectedCustomer(null);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || strings.common.error);
    } finally {
      setDeleting(false);
    }
  };

  // Format date helper
  const formatDate = (isoString: string | null): string => {
    if (!isoString) return strings.customers.neverVisited;
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Render individual customer row
  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const isFull = (item.current_stamps || 0) >= shop.stamps_required;
    const progressPercent = Math.min(
      100,
      Math.round(((item.current_stamps || 0) / Math.max(1, shop.stamps_required)) * 100)
    );
    const initials = getInitials(item.name, item.phone);

    return (
      <TouchableOpacity
        style={[styles.customerCard, isFull && styles.customerCardFull]}
        onPress={() => setSelectedCustomer(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardMainRow}>
          {/* Squircle Initials Avatar */}
          <View style={[styles.avatarSquircle, isFull && styles.avatarSquircleFull]}>
            <Text style={[styles.avatarText, isFull && styles.avatarTextFull]}>
              {initials}
            </Text>
          </View>

          {/* Customer Info */}
          <View style={styles.customerInfoBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.customerNameTitle} numberOfLines={1}>
                {item.name ? item.name : 'Loyalty Member'}
              </Text>
            </View>
            <Text style={styles.phoneText}>{formatPhoneDisplay(item.phone)}</Text>
          </View>

          {/* Stamp Badge */}
          <View
            style={[
              styles.stampBadge,
              isFull ? styles.stampBadgeFull : styles.stampBadgeNormal,
            ]}
          >
            <Text
              style={[
                styles.stampBadgeText,
                isFull ? styles.stampBadgeTextFull : styles.stampBadgeTextNormal,
              ]}
            >
              {isFull
                ? '🎉 READY!'
                : `${item.current_stamps} / ${shop.stamps_required} ★`}
            </Text>
          </View>
        </View>

        {/* Progress Bar Track */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                isFull ? styles.progressFillFull : styles.progressFillNormal,
                { width: `${progressPercent}%` },
              ]}
            />
          </View>
        </View>

        {/* Card Footer */}
        <View style={styles.cardFooter}>
          <Text style={styles.visitText}>
            🕒 Last: {formatDate(item.last_stamp_at)}
          </Text>
          <View style={styles.cardFooterRight}>
            {item.rewards_given > 0 && (
              <View style={styles.rewardsChip}>
                <Text style={styles.rewardsChipText}>
                  🎁 {item.rewards_given} redeemed
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.rowWhatsAppBtn}
              onPress={(e) => {
                e.stopPropagation();
                const namePart = item.name ? `Hi ${item.name}! ` : 'Hi! ';
                const remaining = Math.max(0, shop.stamps_required - (item.current_stamps || 0));
                const msg = `${namePart}⚡ You have ${item.current_stamps} of ${shop.stamps_required} stamps at ${shop.name}! ${remaining === 0 ? 'Your card is full and ready for a reward!' : `Only ${remaining} more stamps to earn a free ${shop.reward_text}!`} Check your card: ${customerWebBase}/c/${shop.slug}?phone=${encodeURIComponent(item.phone)}`;
                sendWhatsApp(item.phone, msg);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.rowWhatsAppBtnText}>💬 WhatsApp</Text>
            </TouchableOpacity>
            <Text style={styles.chevronIcon}>›</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Export Customer List to CSV
  const handleExportCSV = async () => {
    if (customers.length === 0) {
      Alert.alert('Export', 'No customer data to export yet.');
      return;
    }
    const header = 'Name,Phone,Current Stamps,Rewards Given,Last Visit,Joined Date\n';
    const rows = customers
      .map(
        (c) =>
          `"${c.name || ''}","${c.phone}",${c.current_stamps},${c.rewards_given},"${c.last_stamp_at || ''}","${c.created_at || ''}"`
      )
      .join('\n');
    const csvContent = header + rows;

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(csvContent);
      Alert.alert('CSV Export', 'Customer data copied to clipboard as CSV format!');
    } else {
      try {
        await Share.share({
          title: `${shop.name} Customers Export`,
          message: csvContent,
        });
      } catch (e) {}
    }
  };

  // Group 90-day activity events by day
  const groupedDateActivities = useMemo(() => {
    const groups: {
      [dateKey: string]: {
        dateLabel: string;
        stamps: number;
        rewards: number;
        items: ActivityEvent[];
      };
    } = {};

    const filtered = activityEvents.filter((ev) => {
      if (!activitySearchQuery.trim()) return true;
      const q = activitySearchQuery.toLowerCase();
      const phoneDigits = ev.customer_phone.replace(/[^0-9]/g, '');
      const searchDigits = q.replace(/[^0-9]/g, '');
      const matchDigits = searchDigits.length > 0 && phoneDigits.includes(searchDigits);
      const matchPhone = ev.customer_phone.toLowerCase().includes(q);
      const matchName = ev.customer_name ? ev.customer_name.toLowerCase().includes(q) : false;
      return matchDigits || matchPhone || matchName;
    });

    filtered.forEach((ev) => {
      const d = new Date(ev.created_at);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      if (!groups[dateKey]) {
        const todayKey = new Date().toISOString().slice(0, 10);
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const yestKey = yest.toISOString().slice(0, 10);

        let dateLabel = d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        if (dateKey === todayKey) {
          dateLabel = `Today • ${dateLabel}`;
        } else if (dateKey === yestKey) {
          dateLabel = `Yesterday • ${dateLabel}`;
        }

        groups[dateKey] = {
          dateLabel,
          stamps: 0,
          rewards: 0,
          items: [],
        };
      }

      if (ev.type === 'stamp') groups[dateKey].stamps += 1;
      if (ev.type === 'reward') groups[dateKey].rewards += 1;
      groups[dateKey].items.push(ev);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => ({
        dateKey: key,
        ...groups[key],
      }));
  }, [activityEvents, activitySearchQuery]);

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.screenTitle}>Customers</Text>
          <Text style={styles.screenSubtitle}>Directory & activity</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV} activeOpacity={0.7}>
          <Text style={styles.exportBtnText}>📥 Export CSV</Text>
        </TouchableOpacity>
      </View>

      {/* FinTech KPI Metric Cards */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardBlue]}>
          <View style={styles.statHeaderRow}>
            <Text style={styles.statIconBadge}>👥</Text>
            <View style={styles.statBadgePillBlue}>
              <Text style={styles.statBadgePillTextBlue}>Total</Text>
            </View>
          </View>
          <Text style={styles.statNumber}>{totalCustomers}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>

        <View style={[styles.statCard, styles.statCardIndigo]}>
          <View style={styles.statHeaderRow}>
            <Text style={styles.statIconBadge}>⚡</Text>
            <View style={styles.statBadgePillIndigo}>
              <Text style={styles.statBadgePillTextIndigo}>Active</Text>
            </View>
          </View>
          <Text style={styles.statNumber}>{totalStampsCurrent}</Text>
          <Text style={styles.statLabel}>Stamps</Text>
        </View>

        <View style={[styles.statCard, styles.statCardAmber]}>
          <View style={styles.statHeaderRow}>
            <Text style={styles.statIconBadge}>🎁</Text>
            <View style={styles.statBadgePillAmber}>
              <Text style={styles.statBadgePillTextAmber}>Claimed</Text>
            </View>
          </View>
          <Text style={styles.statNumber}>{totalRewardsGiven}</Text>
          <Text style={styles.statLabel}>Rewards</Text>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone digits..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs & Date Activity Trigger */}
      <View style={styles.filterBar}>
        <View style={styles.filterPillsRow}>
          <TouchableOpacity
            style={[styles.filterPill, filterStatus === 'all' && styles.filterPillActive]}
            onPress={() => setFilterStatus('all')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.filterPillText, filterStatus === 'all' && styles.filterPillTextActive]}
            >
              All ({customers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              filterStatus === 'ready' && styles.filterPillReadyActive,
              readyCount > 0 && filterStatus !== 'ready' && styles.filterPillReadyBadge,
            ]}
            onPress={() => setFilterStatus('ready')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterPillText,
                filterStatus === 'ready'
                  ? styles.filterPillTextReadyActive
                  : readyCount > 0
                  ? styles.filterPillTextReadyNotice
                  : null,
              ]}
            >
              🎉 Ready ({readyCount})
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.dateActivityBtn}
          onPress={() => setDateModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.dateActivityBtnText}>📅 90-Day Log</Text>
        </TouchableOpacity>
      </View>

      {/* Customer List or Empty/Loading State */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>{strings.common.loading}</Text>
        </View>
      ) : filteredCustomers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIcon}>📋</Text>
          </View>
          <Text style={styles.emptyTitle}>
            {filterStatus === 'ready'
              ? 'No full cards yet'
              : searchQuery
              ? 'No matching members found'
              : 'No loyalty members yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {filterStatus === 'ready'
              ? `Customers who reach ${shop.stamps_required} stamps will appear here ready to claim rewards!`
              : searchQuery
              ? 'Try searching with different phone digits or customer name.'
              : 'Add your first stamp from the "Add Stamp" tab to start growing your loyalty list!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
          }
        />
      )}

      {/* -------------------------------------------------------- */}
      {/* CUSTOMER DETAIL / PROFILE MODAL */}
      {/* -------------------------------------------------------- */}
      <Modal
        visible={!!selectedCustomer && !deleteConfirmVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedCustomer(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeaderRow}>
              <Text style={styles.detailTitle}>Customer Profile</Text>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setSelectedCustomer(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.modalCloseIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedCustomer && (
              <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
                {/* Hero Header Box */}
                <View style={styles.detailHeroBox}>
                  <View style={styles.detailAvatarSquircle}>
                    <Text style={styles.detailAvatarText}>
                      {getInitials(selectedCustomer.name, selectedCustomer.phone)}
                    </Text>
                  </View>
                  <View style={styles.detailHeroTextCol}>
                    <Text style={styles.detailCustomerName}>
                      {selectedCustomer.name ? selectedCustomer.name : 'Loyalty Member'}
                    </Text>
                    <Text style={styles.detailPhone}>
                      {formatPhoneDisplay(selectedCustomer.phone)}
                    </Text>
                  </View>
                  <View style={styles.detailStatusBadge}>
                    <Text style={styles.detailStatusBadgeText}>Active Member</Text>
                  </View>
                </View>

                {/* Stat summary grid */}
                <View style={styles.detailStatsGrid}>
                  <View style={styles.detailStatBox}>
                    <Text style={styles.detailStatNumber}>
                      {selectedCustomer.current_stamps} / {shop.stamps_required}
                    </Text>
                    <Text style={styles.detailStatLabel}>Active Stamps</Text>
                  </View>
                  <View style={styles.detailStatBox}>
                    <Text style={styles.detailStatNumber}>
                      {selectedCustomer.rewards_given}
                    </Text>
                    <Text style={styles.detailStatLabel}>Rewards Claimed</Text>
                  </View>
                </View>

                {/* Progress bar inside profile */}
                <View style={styles.detailProgressBox}>
                  <View style={styles.detailProgressHeader}>
                    <Text style={styles.detailProgressTitle}>Card Completion</Text>
                    <Text style={styles.detailProgressPercent}>
                      {Math.min(
                        100,
                        Math.round(
                          ((selectedCustomer.current_stamps || 0) /
                            Math.max(1, shop.stamps_required)) *
                            100
                        )
                      )}
                      %
                    </Text>
                  </View>
                  <View style={styles.detailProgressTrack}>
                    <View
                      style={[
                        styles.detailProgressFill,
                        {
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((selectedCustomer.current_stamps || 0) /
                                Math.max(1, shop.stamps_required)) *
                                100
                            )
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                {/* Info Metadata */}
                <View style={styles.detailInfoSection}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Reward Tier:</Text>
                    <Text style={styles.detailValue}>{shop.reward_text}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Last Visit:</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(selectedCustomer.last_stamp_at)}
                    </Text>
                  </View>

                  <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.detailLabel}>Member Since:</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(selectedCustomer.created_at)}
                    </Text>
                  </View>
                </View>

                {/* Date-Wise Stamp & Reward Activity History */}
                <View style={styles.historySection}>
                  <Text style={styles.historySectionTitle}>
                    📅 Activity Timeline ({customerHistory.length})
                  </Text>

                  {historyLoading ? (
                    <ActivityIndicator size="small" color="#2563EB" style={{ marginVertical: 12 }} />
                  ) : customerHistory.length === 0 ? (
                    <Text style={styles.emptyHistoryText}>
                      No past stamp/reward history records found.
                    </Text>
                  ) : (
                    customerHistory.map((item) => (
                      <View key={item.id} style={styles.historyItemRow}>
                        <View style={styles.historyItemLeft}>
                          <View
                            style={[
                              styles.historyIconCircle,
                              item.type === 'stamp'
                                ? styles.historyIconCircleStamp
                                : styles.historyIconCircleReward,
                            ]}
                          >
                            <Text style={styles.historyItemIcon}>
                              {item.type === 'stamp' ? '⚡' : '🎁'}
                            </Text>
                          </View>
                          <View>
                            <Text style={styles.historyItemType}>
                              {item.type === 'stamp'
                                ? '+1 Stamp Added'
                                : `Reward Claimed (${shop.reward_text})`}
                            </Text>
                            <Text style={styles.historyItemDate}>
                              {formatDate(item.created_at)}
                            </Text>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.historyBadge,
                            item.type === 'stamp' ? styles.historyBadgeStamp : styles.historyBadgeReward,
                          ]}
                        >
                          <Text
                            style={[
                              styles.historyBadgeText,
                              item.type === 'stamp'
                                ? styles.historyBadgeTextStamp
                                : styles.historyBadgeTextReward,
                            ]}
                          >
                            {item.type === 'stamp' ? 'STAMP' : 'REWARD'}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                {/* ---------------------------------------------------- */}
                {/* WHATSAPP CUSTOMER MARKETING & ENGAGEMENT */}
                {/* ---------------------------------------------------- */}
                <View style={styles.whatsAppSection}>
                  <View style={styles.whatsAppHeaderRow}>
                    <Text style={styles.whatsAppSectionTitle}>💬 WhatsApp Direct Marketing</Text>
                    <View style={styles.whatsAppBadge}>
                      <Text style={styles.whatsAppBadgeText}>1-Click Direct</Text>
                    </View>
                  </View>
                  <Text style={styles.whatsAppSubtext}>
                    Send pre-crafted marketing promotions directly to this customer's WhatsApp:
                  </Text>

                  {/* Quick Action 1: Reward Ready Alert (if stamps >= required) */}
                  {selectedCustomer.current_stamps >= shop.stamps_required && (
                    <TouchableOpacity
                      style={styles.whatsAppActionButtonReward}
                      onPress={() => {
                        const namePart = selectedCustomer.name ? `Hey ${selectedCustomer.name}! ` : 'Hey! ';
                        const msg = `${namePart}🎉 Your loyalty card at ${shop.name} is FULL! Come visit us anytime to claim your FREE ${shop.reward_text}! Open your card here: ${customerWebBase}/c/${shop.slug}?phone=${encodeURIComponent(selectedCustomer.phone)}`;
                        sendWhatsApp(selectedCustomer.phone, msg);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.whatsAppActionIcon}>🎁</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.whatsAppActionTitleReward}>Send Reward Ready Alert</Text>
                        <Text style={styles.whatsAppActionDesc}>Notify customer to claim their free {shop.reward_text}</Text>
                      </View>
                      <Text style={styles.whatsAppChevron}>↗</Text>
                    </TouchableOpacity>
                  )}

                  {/* Quick Action 2: Stamp Status & Live Card Link */}
                  <TouchableOpacity
                    style={styles.whatsAppActionButton}
                    onPress={() => {
                      const namePart = selectedCustomer.name ? `Hi ${selectedCustomer.name}! ` : 'Hi! ';
                      const remaining = Math.max(0, shop.stamps_required - selectedCustomer.current_stamps);
                      const msg = `${namePart}⚡ You currently have ${selectedCustomer.current_stamps} of ${shop.stamps_required} stamps at ${shop.name}! ${remaining > 0 ? `Only ${remaining} more stamps to earn a free ${shop.reward_text}!` : 'Your card is ready for a reward!'} View your live card here: ${customerWebBase}/c/${shop.slug}?phone=${encodeURIComponent(selectedCustomer.phone)}`;
                      sendWhatsApp(selectedCustomer.phone, msg);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.whatsAppActionIcon}>⚡</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.whatsAppActionTitle}>Send Stamp Status Update</Text>
                      <Text style={styles.whatsAppActionDesc}>Share live loyalty card link & remaining stamps</Text>
                    </View>
                    <Text style={styles.whatsAppChevron}>↗</Text>
                  </TouchableOpacity>

                  {/* Quick Action 3: "We Miss You" VIP Re-engagement */}
                  <TouchableOpacity
                    style={styles.whatsAppActionButton}
                    onPress={() => {
                      const namePart = selectedCustomer.name ? `Hi ${selectedCustomer.name}! ` : 'Hi! ';
                      const msg = `${namePart}👋 We miss seeing you at ${shop.name}! Come by this week for your favorite treat and get your next loyalty stamp toward your free ${shop.reward_text}! Check your card: ${customerWebBase}/c/${shop.slug}?phone=${encodeURIComponent(selectedCustomer.phone)}`;
                      sendWhatsApp(selectedCustomer.phone, msg);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.whatsAppActionIcon}>👋</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.whatsAppActionTitle}>Send "We Miss You" Promo</Text>
                      <Text style={styles.whatsAppActionDesc}>Re-engage customer with a warm VIP reminder</Text>
                    </View>
                    <Text style={styles.whatsAppChevron}>↗</Text>
                  </TouchableOpacity>
                </View>

                {/* Privacy / GDPR Section */}
                <View style={styles.dangerZoneBox}>
                  <Text style={styles.dangerZoneTitle}>🔒 Privacy / GDPR Actions</Text>
                  <Text style={styles.dangerZoneNotice}>
                    Customer data is retained date-wise across all visits. Only authorized managers can delete customer records upon GDPR privacy request.
                  </Text>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => setDeleteConfirmVisible(true)}
                  >
                    <Text style={styles.deleteButtonText}>🗑️ Delete Customer Data</Text>
                  </TouchableOpacity>
                </View>

                {/* Close Button */}
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setSelectedCustomer(null)}
                >
                  <Text style={styles.closeButtonText}>Done</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------- */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* -------------------------------------------------------- */}
      <Modal
        visible={deleteConfirmVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>⚠️ Delete Customer?</Text>
            <Text style={styles.confirmText}>
              Are you sure you want to permanently delete{' '}
              <Text style={styles.boldText}>
                {selectedCustomer ? formatPhoneDisplay(selectedCustomer.phone) : ''}
              </Text>{' '}
              and all of their stamp history? This cannot be undone.
            </Text>

            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setDeleteConfirmVisible(false)}
                disabled={deleting}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmDeleteButton}
                onPress={handleDeleteCustomer}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>Yes, Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------- */}
      {/* 90-DAY DATE-WISE CUSTOMER ACTIVITY MODAL */}
      {/* -------------------------------------------------------- */}
      <Modal
        visible={dateModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dateActivityModalCard}>
            <View style={styles.dateActivityModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateActivityModalTitle}>📅 90-Day Activity Log</Text>
                <Text style={styles.dateActivityModalSub}>
                  Past 3 Months • All date-wise customer stamps & rewards
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setDateModalVisible(false)}
              >
                <Text style={styles.modalCloseIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Filter in Activity Modal */}
            <View style={styles.activitySearchBox}>
              <Text style={{ fontSize: 14 }}>🔍</Text>
              <TextInput
                style={styles.activitySearchInput}
                placeholder="Filter by customer name or phone..."
                placeholderTextColor="#94A3B8"
                value={activitySearchQuery}
                onChangeText={setActivitySearchQuery}
              />
              {activitySearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setActivitySearchQuery('')}>
                  <Text style={{ fontSize: 13, color: '#94A3B8' }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {dateActivityLoading ? (
              <View style={styles.activityLoadingBox}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.activityLoadingText}>Loading 90-day activity records...</Text>
              </View>
            ) : groupedDateActivities.length === 0 ? (
              <View style={styles.emptyActivityBox}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>📋</Text>
                <Text style={styles.emptyActivityTitle}>
                  {activitySearchQuery ? 'No matching activity' : 'No activity records in the last 90 days'}
                </Text>
                <Text style={styles.emptyActivitySub}>
                  {activitySearchQuery
                    ? 'Try searching with another name or phone number.'
                    : 'Customer visits and stamps are automatically logged and retained here date-wise for 3 months.'}
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.activityScroll} showsVerticalScrollIndicator={false}>
                {groupedDateActivities.map((day) => (
                  <View key={day.dateKey} style={styles.dayGroupCard}>
                    <View style={styles.dayGroupHeader}>
                      <Text style={styles.dayGroupDateText}>{day.dateLabel}</Text>
                      <View style={styles.dayGroupBadges}>
                        <View style={styles.dayStampPill}>
                          <Text style={styles.dayStampPillText}>
                            ⚡ {day.stamps} Stamp{day.stamps !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        {day.rewards > 0 && (
                          <View style={styles.dayRewardPill}>
                            <Text style={styles.dayRewardPillText}>
                              🎁 {day.rewards} Reward{day.rewards !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.dayGroupList}>
                      {day.items.map((ev) => (
                        <View key={ev.id} style={styles.activityRow}>
                          <View style={styles.activityRowLeft}>
                            <View
                              style={[
                                styles.activityIconSquircle,
                                ev.type === 'stamp'
                                  ? styles.activityIconSquircleStamp
                                  : styles.activityIconSquircleReward,
                              ]}
                            >
                              <Text style={styles.activityTypeIcon}>
                                {ev.type === 'stamp' ? '⚡' : '🎁'}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={styles.activityCustomerNameRow}>
                                <Text style={styles.activityCustomerName} numberOfLines={1}>
                                  {ev.customer_name ? `${ev.customer_name} • ` : ''}
                                  {formatPhoneDisplay(ev.customer_phone)}
                                </Text>
                              </View>
                              <Text style={styles.activityTimeText}>
                                {formatDate(ev.created_at)}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.activityTagBadge,
                              ev.type === 'stamp' ? styles.tagBadgeStamp : styles.tagBadgeReward,
                            ]}
                          >
                            <Text
                              style={[
                                styles.activityTagText,
                                ev.type === 'stamp' ? styles.tagTextStamp : styles.tagTextReward,
                              ]}
                            >
                              {ev.type === 'stamp' ? '+1 STAMP' : 'REWARD'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.activityDoneBtn}
              onPress={() => setDateModalVisible(false)}
            >
              <Text style={styles.activityDoneBtnText}>Done</Text>
            </TouchableOpacity>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
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
  exportBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  exportBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Metric Cards */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statCardBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  statCardIndigo: {
    backgroundColor: '#EEF2FF',
    borderColor: '#E0E7FF',
  },
  statCardAmber: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  statHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  statIconBadge: {
    fontSize: 14,
  },
  statBadgePillBlue: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statBadgePillTextBlue: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1E40AF',
    textTransform: 'uppercase',
  },
  statBadgePillIndigo: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statBadgePillTextIndigo: {
    fontSize: 9,
    fontWeight: '800',
    color: '#3730A3',
    textTransform: 'uppercase',
  },
  statBadgePillAmber: {
    backgroundColor: '#FDE68A',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statBadgePillTextAmber: {
    fontSize: 9,
    fontWeight: '800',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },

  /* Search & Filter */
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 7,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    padding: 0,
  },
  clearSearchButton: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
  },
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterPillReadyBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  filterPillReadyActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  filterPillTextReadyNotice: {
    color: '#059669',
  },
  filterPillTextReadyActive: {
    color: '#FFFFFF',
  },
  dateActivityBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  dateActivityBtnText: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Customer Card */
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  customerCardFull: {
    borderColor: '#A7F3D0',
    backgroundColor: '#FAFCFB',
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarSquircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarSquircleFull: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2563EB',
  },
  avatarTextFull: {
    color: '#059669',
  },
  customerInfoBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerNameTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  phoneText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  stampBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  stampBadgeNormal: {
    backgroundColor: '#F1F5F9',
  },
  stampBadgeFull: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
  },
  stampBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  stampBadgeTextNormal: {
    color: '#334155',
  },
  stampBadgeTextFull: {
    color: '#059669',
  },

  /* Progress Bar Track */
  progressContainer: {
    marginBottom: 10,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressFillNormal: {
    backgroundColor: '#2563EB',
  },
  progressFillFull: {
    backgroundColor: '#10B981',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  visitText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  cardFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rewardsChip: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  rewardsChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  chevronIcon: {
    fontSize: 18,
    color: '#CBD5E1',
    fontWeight: '600',
  },

  /* Loading & Empty */
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748B',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },

  /* Modal Common */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 16,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  modalCloseIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseIconText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '800',
  },
  detailScroll: {
    maxHeight: 520,
  },

  /* Detail Hero Box */
  detailHeroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailAvatarSquircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailAvatarText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  detailHeroTextCol: {
    flex: 1,
  },
  detailCustomerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailPhone: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  detailStatusBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  detailStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },

  /* Detail Stat Summary Grid */
  detailStatsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  detailStatBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailStatNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },

  /* Detail Progress Box */
  detailProgressBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailProgressTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  detailProgressPercent: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  detailProgressTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  detailProgressFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 4,
  },

  /* Detail Info List */
  detailInfoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },

  /* History Timeline Section */
  historySection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historySectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 8,
  },
  historyItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  historyIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconCircleStamp: {
    backgroundColor: '#EFF6FF',
  },
  historyIconCircleReward: {
    backgroundColor: '#FEF3C7',
  },
  historyItemIcon: {
    fontSize: 14,
  },
  historyItemType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  historyItemDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  historyBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyBadgeStamp: {
    backgroundColor: '#EFF6FF',
  },
  historyBadgeReward: {
    backgroundColor: '#FEF3C7',
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  historyBadgeTextStamp: {
    color: '#2563EB',
  },
  historyBadgeTextReward: {
    color: '#D97706',
  },

  /* Danger Zone */
  dangerZoneBox: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  dangerZoneTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9F1239',
    marginBottom: 4,
  },
  dangerZoneNotice: {
    fontSize: 11,
    color: '#BE123C',
    lineHeight: 16,
    marginBottom: 10,
  },
  deleteButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FDA4AF',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#E11D48',
    fontSize: 13,
    fontWeight: '700',
  },

  closeButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Delete Confirm Card */
  confirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 10,
  },
  confirmText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 21,
    marginBottom: 20,
  },
  boldText: {
    fontWeight: '700',
    color: '#111827',
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmDeleteButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmDeleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* 90-Day Date Activity Modal */
  dateActivityModalCard: {
    width: '94%',
    maxWidth: 540,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  dateActivityModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  dateActivityModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  dateActivityModalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  activitySearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  activitySearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  activityLoadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  activityLoadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  emptyActivityBox: {
    paddingVertical: 40,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyActivityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptyActivitySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  activityScroll: {
    flexGrow: 0,
    marginBottom: 14,
    maxHeight: 420,
  },
  dayGroupCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderColor: '#E2E8F0',
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dayGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dayGroupDateText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  dayGroupBadges: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dayStampPill: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  dayStampPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  dayRewardPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  dayRewardPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  dayGroupList: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  activityRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  activityIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIconSquircleStamp: {
    backgroundColor: '#EFF6FF',
  },
  activityIconSquircleReward: {
    backgroundColor: '#FEF3C7',
  },
  activityTypeIcon: {
    fontSize: 14,
  },
  activityCustomerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityCustomerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  activityTimeText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  activityTagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagBadgeStamp: {
    backgroundColor: '#EFF6FF',
  },
  tagBadgeReward: {
    backgroundColor: '#FEF3C7',
  },
  activityTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tagTextStamp: {
    color: '#2563EB',
  },
  tagTextReward: {
    color: '#D97706',
  },
  activityDoneBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  activityDoneBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  /* WhatsApp Marketing Styles */
  rowWhatsAppBtn: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 4,
  },
  rowWhatsAppBtnText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '800',
  },
  whatsAppSection: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  whatsAppHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  whatsAppSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  whatsAppBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  whatsAppBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
    textTransform: 'uppercase',
  },
  whatsAppSubtext: {
    fontSize: 12,
    color: '#166534',
    marginBottom: 12,
    lineHeight: 16,
  },
  whatsAppActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#86EFAC',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  whatsAppActionButtonReward: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  whatsAppActionIcon: {
    fontSize: 18,
  },
  whatsAppActionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  whatsAppActionTitleReward: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  whatsAppActionDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  whatsAppChevron: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
  },
});
