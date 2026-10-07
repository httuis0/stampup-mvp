// ============================================================
// Screen 4: Customers Screen
// Displays totals (customers, stamps, rewards), customer search,
// customer details, and customer deletion for privacy requests.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
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

export const CustomersScreen: React.FC<CustomersScreenProps> = ({ shop }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected customer for detail / deletion modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<HistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  // Calculate totals
  const totalCustomers = customers.length;
  const totalStampsCurrent = customers.reduce((sum, c) => sum + (c.current_stamps || 0), 0);
  const totalRewardsGiven = customers.reduce((sum, c) => sum + (c.rewards_given || 0), 0);

  // Filter customers by search query (phone number digits or customer name)
  const filteredCustomers = customers.filter((c) => {
    if (!searchQuery.trim()) return true;
    const cleanSearch = searchQuery.replace(/[^0-9]/g, '');
    const cleanPhone = c.phone.replace(/[^0-9]/g, '');
    const matchPhoneDigits = cleanSearch.length > 0 && cleanPhone.includes(cleanSearch);
    const matchRawPhone = c.phone.toLowerCase().includes(searchQuery.toLowerCase());
    const matchName = c.name ? c.name.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    return matchPhoneDigits || matchRawPhone || matchName;
  });

  // Fetch date-wise customer activity across last 90 days (3 months)
  const fetchDateActivity = useCallback(async () => {
    setDateActivityLoading(true);
    try {
      // 1. Try Supabase RPC first
      const { data, error } = await supabase.rpc('get_shop_activity_log', {
        p_shop_id: shop.id,
        p_days: 90,
      });

      if (!error && data && Array.isArray(data.events)) {
        setActivityEvents(data.events);
      } else {
        // Fallback: Query stamps and rewards directly for the last 90 days
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
      const { data, error } = await supabase.rpc('delete_customer', {
        p_shop_id: shop.id,
        p_phone: selectedCustomer.phone,
      });

      if (error) {
        Alert.alert('Error', error.message || strings.common.error);
      } else {
        // Refresh customer list
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
    const isFull = item.current_stamps >= shop.stamps_required;

    return (
      <TouchableOpacity
        style={styles.customerCard}
        onPress={() => setSelectedCustomer(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            {item.name ? (
              <Text style={styles.customerNameTitle} numberOfLines={1}>
                👤 {item.name}
              </Text>
            ) : null}
            <Text style={styles.phoneText}>{formatPhoneDisplay(item.phone)}</Text>
          </View>
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
              {item.current_stamps} / {shop.stamps_required} stamps
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.visitText}>
            Last visit: {formatDate(item.last_stamp_at)}
          </Text>
          {item.rewards_given > 0 && (
            <Text style={styles.rewardsBadge}>
              🎁 {item.rewards_given} reward{item.rewards_given > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Export Customer List to CSV (Data Portability & Backup)
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
  const groupedDateActivities = React.useMemo(() => {
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>👥 {strings.customers.title}</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
          <Text style={styles.exportBtnText}>📥 Export CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Top Stat Summary Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalCustomers}</Text>
          <Text style={styles.statLabel}>{strings.customers.totalCustomers}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalStampsCurrent}</Text>
          <Text style={styles.statLabel}>{strings.customers.totalStamps}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalRewardsGiven}</Text>
          <Text style={styles.statLabel}>{strings.customers.totalRewards}</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={strings.customers.searchPlaceholder}
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sub-search row: Customer count & small Date Activity button on the right side */}
      <View style={styles.subSearchRow}>
        <Text style={styles.customerCountText}>
          {filteredCustomers.length} {filteredCustomers.length === 1 ? 'customer' : 'customers'}
        </Text>
        <TouchableOpacity
          style={styles.dateActivityBtn}
          onPress={() => setDateModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.dateActivityBtnText}>📅 Date Activity (90 Days)</Text>
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
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No matching customers' : 'No customers yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? 'Try searching with different phone digits or name.'
              : 'Add your first customer stamp from the "Add Stamp" tab!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
          }
        />
      )}

      {/* -------------------------------------------------------- */}
      {/* CUSTOMER DETAIL MODAL */}
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
              >
                <Text style={styles.modalCloseIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedCustomer && (
              <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.detailPhoneContainer}>
                  {selectedCustomer.name ? (
                    <Text style={styles.detailCustomerName}>👤 {selectedCustomer.name}</Text>
                  ) : null}
                  <Text style={styles.detailPhone}>
                    {formatPhoneDisplay(selectedCustomer.phone)}
                  </Text>
                  <Text style={styles.detailStatusBadge}>
                    Active Loyalty Card
                  </Text>
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

                <View style={styles.detailInfoSection}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Last Visit:</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(selectedCustomer.last_stamp_at)}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>First Joined:</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(selectedCustomer.created_at)}
                    </Text>
                  </View>
                </View>

                {/* Date-Wise Stamp & Reward Activity History */}
                <View style={styles.historySection}>
                  <Text style={styles.historySectionTitle}>
                    📅 Date-wise Activity History ({customerHistory.length})
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
                          <Text style={styles.historyItemIcon}>
                            {item.type === 'stamp' ? '⚡' : '🎁'}
                          </Text>
                          <View>
                            <Text style={styles.historyItemType}>
                              {item.type === 'stamp' ? '+1 Stamp Added' : `Reward Claimed (${shop.reward_text})`}
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
                              item.type === 'stamp' ? styles.historyBadgeTextStamp : styles.historyBadgeTextReward,
                            ]}
                          >
                            {item.type === 'stamp' ? 'STAMP' : 'REWARD'}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                {/* Protected Deletion Option */}
                <View style={styles.dangerZoneBox}>
                  <Text style={styles.dangerZoneTitle}>🔒 Privacy / GDPR Actions</Text>
                  <Text style={styles.dangerZoneNotice}>
                    Customer data is permanently retained date-wise across all visits. Only authorized managers can delete customer records upon GDPR privacy request.
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
                <Text style={styles.dateActivityModalTitle}>📅 Date-Wise Activity Log</Text>
                <Text style={styles.dateActivityModalSub}>
                  Past 3 Months (90 Days) • All customer stamps & rewards
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
                placeholderTextColor="#9CA3AF"
                value={activitySearchQuery}
                onChangeText={setActivitySearchQuery}
              />
              {activitySearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setActivitySearchQuery('')}>
                  <Text style={{ fontSize: 13, color: '#9CA3AF' }}>✕</Text>
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
                            <Text style={styles.activityTypeIcon}>
                              {ev.type === 'stamp' ? '⚡' : '🎁'}
                            </Text>
                            <View>
                              <View style={styles.activityCustomerNameRow}>
                                {ev.customer_name ? (
                                  <Text style={styles.activityCustomerName} numberOfLines={1}>
                                    👤 {ev.customer_name} •{' '}
                                  </Text>
                                ) : null}
                                <Text style={styles.activityPhoneText}>
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
    backgroundColor: '#F3F4F6',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  exportBtn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  exportBtnText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2563EB',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  clearSearchButton: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  phoneText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  stampBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stampBadgeNormal: {
    backgroundColor: '#EFF6FF',
  },
  stampBadgeFull: {
    backgroundColor: '#D1FAE5',
  },
  stampBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  stampBadgeTextNormal: {
    color: '#1D4ED8',
  },
  stampBadgeTextFull: {
    color: '#065F46',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  visitText: {
    fontSize: 13,
    color: '#6B7280',
  },
  rewardsBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D97706',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 15,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalCloseIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseIconText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '800',
  },
  detailScroll: {
    maxHeight: 480,
  },
  detailPhoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailPhone: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  detailStatusBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  detailStatsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  detailStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailStatNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2563EB',
  },
  detailStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  detailInfoSection: {
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  historySection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historySectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
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
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  historyItemIcon: {
    fontSize: 16,
  },
  historyItemType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  historyItemDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  historyBadge: {
    paddingHorizontal: 6,
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
  dangerZoneBox: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
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
    marginBottom: 8,
  },
  deleteButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FDA4AF',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#E11D48',
    fontSize: 13,
    fontWeight: '700',
  },
  closeButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
  },
  confirmTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 10,
  },
  confirmText: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
    marginBottom: 24,
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
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '700',
  },
  confirmDeleteButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmDeleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cardHeaderLeft: {
    flex: 1,
  },
  customerNameTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  subSearchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  customerCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  dateActivityBtn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dateActivityBtnText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  detailCustomerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  dateActivityModalCard: {
    width: '92%',
    maxWidth: 540,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
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
    color: '#1E3A8A',
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
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  activitySearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
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
    color: '#1E293B',
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
    maxHeight: 400,
  },
  dayGroupCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
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
    color: '#1E293B',
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
    borderRadius: 12,
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
    borderRadius: 12,
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
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  activityRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  activityTypeIcon: {
    fontSize: 18,
  },
  activityCustomerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  activityCustomerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  activityPhoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
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
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  activityDoneBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
});
