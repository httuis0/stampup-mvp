// ============================================================
// Shop Logo Storage & Synchronizer
// Uploads vendor logos to Supabase Storage and synchronizes
// the public logo URL across all cashier devices and customer cards.
// ============================================================

import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';

// Pure JS Base64 to Uint8Array decoder (cross-platform iOS, Android, Web)
function decodeBase64ToUint8(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const bufferLength = Math.floor(len * 0.75 - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0));
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const b1 = chars.indexOf(clean[i]);
    const b2 = chars.indexOf(clean[i + 1]);
    const b3 = clean[i + 2] === '=' ? -1 : chars.indexOf(clean[i + 2]);
    const b4 = clean[i + 3] === '=' ? -1 : chars.indexOf(clean[i + 3]);

    if (p < bufferLength) bytes[p++] = (b1 << 2) | (b2 >> 4);
    if (b3 !== -1 && p < bufferLength) bytes[p++] = ((b2 & 15) << 4) | (b3 >> 2);
    if (b4 !== -1 && p < bufferLength) bytes[p++] = ((b3 & 3) << 6) | (b4 & 63);
  }
  return bytes;
}

export interface PickAndUploadLogoResult {
  success: boolean;
  logoUrl?: string;
  error?: string;
}

/**
 * Launch photo library, crop 1:1 square, upload to Supabase 'shop-logos' bucket,
 * and save logo_url to the shops table.
 */
export async function pickAndUploadShopLogo(shopId: string): Promise<PickAndUploadLogoResult> {
  try {
    // 1. Pick Image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1], // Square logo
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false };
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      return { success: false, error: 'Could not read image data.' };
    }

    const fileExt = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `logo_${shopId}_${Date.now()}.${fileExt}`;
    const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
    const fileBytes = decodeBase64ToUint8(asset.base64);

    // 2. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('shop-logos')
      .upload(fileName, fileBytes, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }

    // 3. Get Public URL
    const { data: publicUrlData } = supabase.storage
      .from('shop-logos')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    // 4. Update Shop Record in Database
    const { error: dbError } = await supabase
      .from('shops')
      .update({ logo_url: publicUrl })
      .eq('id', shopId);

    if (dbError) {
      console.error('Database update error:', dbError);
      return { success: false, error: dbError.message };
    }

    return { success: true, logoUrl: publicUrl };
  } catch (err: any) {
    console.error('pickAndUploadShopLogo error:', err);
    return { success: false, error: err?.message || 'Failed to upload logo' };
  }
}

/**
 * Remove shop logo from database
 */
export async function removeShopLogo(shopId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('shops')
      .update({ logo_url: null })
      .eq('id', shopId);

    return !error;
  } catch (e) {
    return false;
  }
}
