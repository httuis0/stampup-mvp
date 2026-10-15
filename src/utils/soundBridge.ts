// ============================================================
// Sound Bridge Utility
// Routes audio synthesis calls to the native WebView audio bridge
// on iOS/Android, and native Web Audio API on web.
// ============================================================

export type SoundType = 'notification' | 'stamp' | 'reward' | 'warning' | 'undo';

type PlaySoundFunction = (type: SoundType) => void;

let _playSoundBridge: PlaySoundFunction | null = null;

export function registerSoundBridge(fn: PlaySoundFunction | null) {
  _playSoundBridge = fn;
}

export function playBridgeSound(type: SoundType) {
  if (_playSoundBridge) {
    try {
      _playSoundBridge(type);
    } catch (e) {
      console.warn('Sound bridge error:', e);
    }
  }
}
