// ============================================================
// GoogleMapPicker Component
// Interactive Real Map location picker for Shop Setup & Branches.
// Supports Address Geocoding Search, GPS Auto-detection,
// Interactive Map Pinning, and Google Maps direct linking.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';

// Dynamically import WebView for native platforms
let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('react-native-webview not loaded:', e);
  }
}

export interface LocationData {
  address: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
}

interface GoogleMapPickerProps {
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  initialAddress?: string | null;
  onLocationSelect: (data: LocationData) => void;
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// Default to Dubai Mall coordinates if no initial location
const DEFAULT_LAT = 25.1972;
const DEFAULT_LNG = 55.2744;

export const GoogleMapPicker: React.FC<GoogleMapPickerProps> = ({
  initialLatitude,
  initialLongitude,
  initialAddress,
  onLocationSelect,
}) => {
  const [latitude, setLatitude] = useState<number>(initialLatitude || DEFAULT_LAT);
  const [longitude, setLongitude] = useState<number>(initialLongitude || DEFAULT_LNG);
  const [address, setAddress] = useState<string>(initialAddress || '');

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [showResults, setShowResults] = useState<boolean>(false);

  // GPS loading
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [mapLoading, setMapLoading] = useState<boolean>(true);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notify parent on change
  const notifyChange = (lat: number, lng: number, addr: string) => {
    const url = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    onLocationSelect({
      address: addr,
      latitude: lat,
      longitude: lng,
      googleMapsUrl: url,
    });
  };

  // Reverse geocode coordinates to street address
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'StampUp-LoyaltyApp/1.0',
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.display_name) {
          const cleanAddr = data.display_name;
          setAddress(cleanAddr);
          notifyChange(lat, lng, cleanAddr);
          return;
        }
      }
    } catch (e) {
      console.warn('Reverse geocode error:', e);
    }
    // Fallback: coordinates as address
    const fallbackAddr = address || `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
    notifyChange(lat, lng, fallbackAddr);
  };

  // Search places via Nominatim geocoder
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!text.trim() || text.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            text
          )}&limit=5&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'StampUp-LoyaltyApp/1.0',
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data || []);
          setShowResults(true);
        }
      } catch (e) {
        console.warn('Search geocode error:', e);
      } finally {
        setSearchLoading(false);
      }
    }, 450);
  };

  // Select place from search
  const handleSelectPlace = (place: SearchResult) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    setLatitude(lat);
    setLongitude(lng);
    setAddress(place.display_name);
    setSearchQuery('');
    setShowResults(false);
    notifyChange(lat, lng, place.display_name);
  };

  // Detect GPS Location
  const handleDetectLocation = async () => {
    setGpsLoading(true);
    try {
      if (Platform.OS === 'web') {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              setLatitude(lat);
              setLongitude(lng);
              reverseGeocode(lat, lng);
              setGpsLoading(false);
            },
            (error) => {
              console.warn('Geolocation error:', error);
              alert('Could not retrieve GPS location. Please check browser permissions.');
              setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
          return;
        }
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          alert('Location permission was denied. You can search or tap on the map to place the pin.');
          setGpsLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        await reverseGeocode(lat, lng);
      }
    } catch (err: any) {
      console.warn('GPS detection exception:', err);
      alert('Unable to retrieve current location.');
    } finally {
      setGpsLoading(false);
    }
  };

  // HTML content for interactive Leaflet + Google Maps tiles
  const getMapHTML = () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e2e8f0; }
        .pin-label {
          background: #1E3A8A;
          color: white;
          font-family: -apple-system, sans-serif;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
          white-space: nowrap;
          border: 1px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var lat = ${latitude};
        var lng = ${longitude};

        var map = L.map('map', {
          zoomControl: true,
          attributionControl: false
        }).setView([lat, lng], 16);

        // Google Maps style Streets Tile Layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        // Custom red pin marker
        var marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.bindPopup("<div class='pin-label'>📍 Shop Location</div>").openPopup();

        function sendCoords(newLat, newLng) {
          var payload = JSON.stringify({ lat: newLat, lng: newLng });
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(payload);
          } else if (window.parent) {
            window.parent.postMessage(payload, '*');
          }
        }

        // Handle dragging marker
        marker.on('dragend', function(e) {
          var pos = e.target.getLatLng();
          sendCoords(pos.lat, pos.lng);
        });

        // Handle clicking map to reposition marker
        map.on('click', function(e) {
          marker.setLatLng(e.latlng);
          sendCoords(e.latlng.lat, e.latlng.lng);
        });

        // Listen for parent messages to update view
        window.addEventListener('message', function(event) {
          try {
            var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (data.action === 'setView') {
              map.setView([data.lat, data.lng], 16);
              marker.setLatLng([data.lat, data.lng]);
            }
          } catch(e) {}
        });
      </script>
    </body>
    </html>
  `;

  // Handle messages sent from the interactive map WebView / iframe
  const handleMapMessage = (event: any) => {
    try {
      const data =
        typeof event.nativeEvent?.data === 'string'
          ? JSON.parse(event.nativeEvent.data)
          : typeof event.data === 'string'
          ? JSON.parse(event.data)
          : event.data;

      if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
        setLatitude(data.lat);
        setLongitude(data.lng);
        reverseGeocode(data.lat, data.lng);
      }
    } catch (e) {
      console.warn('Map message parse error:', e);
    }
  };

  // Open in Google Maps app
  const openInGoogleMaps = () => {
    const url = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search address, mall, area, or landmark..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={handleSearchChange}
          />
          {searchLoading && <ActivityIndicator size="small" color="#2563EB" style={{ marginRight: 8 }} />}
          {searchQuery.length > 0 && !searchLoading && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.gpsButton}
          onPress={handleDetectLocation}
          disabled={gpsLoading}
          activeOpacity={0.7}
        >
          {gpsLoading ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <Text style={styles.gpsButtonText}>📍 GPS</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Auto-suggest Search Results Dropdown */}
      {showResults && searchResults.length > 0 && (
        <View style={styles.resultsContainer}>
          <ScrollView style={styles.resultsScroll} keyboardShouldPersistTaps="handled">
            {searchResults.map((item) => (
              <TouchableOpacity
                key={item.place_id}
                style={styles.resultItem}
                onPress={() => handleSelectPlace(item)}
              >
                <Text style={styles.resultItemIcon}>📍</Text>
                <Text style={styles.resultItemText} numberOfLines={2}>
                  {item.display_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Interactive Map View */}
      <View style={styles.mapFrame}>
        {Platform.OS === 'web' ? (
          <iframe
            srcDoc={getMapHTML()}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              borderRadius: 14,
            }}
            title="Shop Google Map"
          />
        ) : WebView ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: getMapHTML() }}
            style={styles.webView}
            onMessage={handleMapMessage}
            onLoadEnd={() => setMapLoading(false)}
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        ) : (
          <View style={styles.fallbackMapBox}>
            <Text style={{ fontSize: 32 }}>🗺️</Text>
            <Text style={styles.fallbackTitle}>Interactive Map</Text>
            <Text style={styles.fallbackCoords}>
              Coordinates: {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </Text>
          </View>
        )}

        {/* Map Overlay Controls */}
        <View style={styles.mapControlsBar}>
          <View style={styles.coordsBadge}>
            <Text style={styles.coordsText}>
              📌 {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </Text>
          </View>
          <TouchableOpacity style={styles.openExternalBtn} onPress={openInGoogleMaps}>
            <Text style={styles.openExternalBtnText}>Open Google Maps ↗</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.mapTipText}>
        💡 Tip: Tap anywhere on the map or drag the red pin to set your exact store entrance.
      </Text>

      {/* Editable Address Line */}
      <View style={styles.addressSection}>
        <Text style={styles.addressLabel}>Street Address / Area / Mall:</Text>
        <TextInput
          style={styles.addressInput}
          placeholder="e.g. Ground Floor, Near Main Entrance, Dubai Mall"
          placeholderTextColor="#9CA3AF"
          value={address}
          onChangeText={(text) => {
            setAddress(text);
            notifyChange(latitude, longitude, text);
          }}
          multiline
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
    padding: 0,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  gpsButton: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  gpsButtonText: {
    color: '#2563EB',
    fontWeight: '800',
    fontSize: 13,
  },
  resultsContainer: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
    maxHeight: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 99,
  },
  resultsScroll: {
    maxHeight: 180,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  resultItemIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  resultItemText: {
    fontSize: 12,
    color: '#1E293B',
    flex: 1,
    fontWeight: '500',
  },
  mapFrame: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fallbackMapBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fallbackTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginTop: 6,
  },
  fallbackCoords: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  mapControlsBar: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coordsBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  coordsText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  openExternalBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  openExternalBtnText: {
    color: '#1E3A8A',
    fontSize: 11,
    fontWeight: '800',
  },
  mapTipText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 8,
    lineHeight: 15,
  },
  addressSection: {
    marginTop: 4,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  addressInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 48,
  },
});
