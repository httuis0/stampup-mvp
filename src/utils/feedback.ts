// ============================================================
// Cashier Feedback Utility (Audio & Haptics)
// Cross-platform sound effects via Web Audio API + Sound Bridge
// for iOS, Android, and Web + tactile haptic feedback.
// ============================================================

import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { playBridgeSound } from './soundBridge';

// In-memory cache for instant synchronous checks
let _soundEnabled = true;
let _hapticsEnabled = true;

// Initialize from storage on app load
AsyncStorage.getItem('@stampup_sound_enabled').then((val) => {
  if (val !== null) _soundEnabled = val === 'true';
});
AsyncStorage.getItem('@stampup_haptics_enabled').then((val) => {
  if (val !== null) _hapticsEnabled = val === 'true';
});

export const getSoundEnabled = async (): Promise<boolean> => {
  const val = await AsyncStorage.getItem('@stampup_sound_enabled');
  if (val !== null) _soundEnabled = val === 'true';
  return _soundEnabled;
};

export const getHapticsEnabled = async (): Promise<boolean> => {
  const val = await AsyncStorage.getItem('@stampup_haptics_enabled');
  if (val !== null) _hapticsEnabled = val === 'true';
  return _hapticsEnabled;
};

export const setSoundEnabled = async (enabled: boolean): Promise<void> => {
  _soundEnabled = enabled;
  await AsyncStorage.setItem('@stampup_sound_enabled', enabled ? 'true' : 'false');
};

export const setHapticsEnabled = async (enabled: boolean): Promise<void> => {
  _hapticsEnabled = enabled;
  await AsyncStorage.setItem('@stampup_haptics_enabled', enabled ? 'true' : 'false');
};

// Safe Web Audio Context accessor for Web browsers
let audioCtx: any = null;

function getAudioContext() {
  if (!_soundEnabled) return null;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    }
  }
  return null;
}

/**
 * 1. Stamp Added: Pleasant POS register "Ding" / Coin chime
 * Frequencies: 880Hz (A5) -> 1320Hz (E6)
 */
export async function playStampFeedback() {
  if (_hapticsEnabled) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS !== 'web') Vibration.vibrate(40);
    } catch (e) {}
  }

  if (!_soundEnabled) return;

  // Native mobile audio bridge
  playBridgeSound('stamp');

  // Web fallback
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {}
}

/**
 * 2. Reward Earned: Celebratory 4-Tone Fanfare Chord
 * Frequencies: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
 */
export async function playRewardFeedback() {
  if (_hapticsEnabled) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS !== 'web') Vibration.vibrate([0, 60, 50, 80]);
    } catch (e) {}
  }

  if (!_soundEnabled) return;

  // Native mobile audio bridge
  playBridgeSound('reward');

  // Web fallback
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  } catch (e) {}
}

/**
 * 3. Cooldown / Warning: Low Double-Thud
 */
export async function playWarningFeedback() {
  if (_hapticsEnabled) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (Platform.OS !== 'web') Vibration.vibrate([0, 50, 40, 50]);
    } catch (e) {}
  }

  if (!_soundEnabled) return;

  // Native mobile audio bridge
  playBridgeSound('warning');

  // Web fallback
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.setValueAtTime(260, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {}
}

/**
 * 4. Undo: Low Rewind Swoop
 */
export async function playUndoFeedback() {
  if (_hapticsEnabled) {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (Platform.OS !== 'web') Vibration.vibrate(35);
    } catch (e) {}
  }

  if (!_soundEnabled) return;

  // Native mobile audio bridge
  playBridgeSound('undo');

  // Web fallback
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}
}

/**
 * 5. Notification: Crisp High-Pitch Bell Chime
 * Frequencies: G5 (784Hz) -> C6 (1046Hz) -> E6 (1318Hz)
 */
export async function playNotificationFeedback() {
  if (_hapticsEnabled) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS !== 'web') Vibration.vibrate([0, 45, 40, 65]);
    } catch (e) {}
  }

  if (!_soundEnabled) return;

  // Native mobile audio bridge (iOS & Android)
  playBridgeSound('notification');

  // Web fallback
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [783.99, 1046.50, 1318.51];
    notes.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.32);
    });
  } catch (e) {}
}
