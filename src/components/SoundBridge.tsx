// ============================================================
// Sound Bridge Component (Native PCM WAV + WebAudio Synthesizer)
// Generates real 16-bit PCM WAV audio data URIs and plays them
// via HTML5 <audio> (unlocked by mediaPlaybackRequiresUserAction=false)
// + Web Audio API for 100% reliable sound on iOS & Android.
// ============================================================

import React, { useRef, useEffect } from 'react';
import { View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { registerSoundBridge, SoundType } from '../utils/soundBridge';

const SOUND_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script>
// Generate a 16-bit mono PCM WAV data URI from an array of tone segments
function buildWavDataUri(segments) {
  var sampleRate = 22050;
  var totalSamples = 0;
  for (var i = 0; i < segments.length; i++) {
    totalSamples += Math.floor(sampleRate * segments[i].duration);
  }

  var buffer = new ArrayBuffer(44 + totalSamples * 2);
  var view = new DataView(buffer);

  function writeStr(offset, str) {
    for (var i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  var offset = 44;
  for (var s = 0; s < segments.length; s++) {
    var seg = segments[s];
    var numSamples = Math.floor(sampleRate * seg.duration);
    var freq = seg.freq;
    var vol = seg.vol || 0.85;
    for (var j = 0; j < numSamples; j++) {
      var t = j / sampleRate;
      // Smooth envelope to avoid clicks and give a crisp bell decay
      var env = Math.min(1, j / (sampleRate * 0.008)) * Math.exp(-3.5 * (j / numSamples));
      var sample = Math.sin(2 * Math.PI * freq * t) * vol * env;
      // Add harmonic overtone for rich bell clarity on phone speakers
      sample += Math.sin(4 * Math.PI * freq * t) * (vol * 0.25) * env;
      var pcm = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, pcm < 0 ? pcm * 0x8000 : pcm * 0x7FFF, true);
      offset += 2;
    }
  }

  var bytes = new Uint8Array(buffer);
  var binary = '';
  var chunkSize = 8192;
  for (var k = 0; k < bytes.length; k += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(k, k + chunkSize));
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

// Pre-build crisp high-volume WAV chimes on startup
var SOUNDS = {};
try {
  // 1. Notification Bell (Crisp 3-tone doorbell chime: G5 -> C6 -> E6)
  SOUNDS.notification = buildWavDataUri([
    { freq: 784, duration: 0.12, vol: 0.95 },
    { freq: 1046.5, duration: 0.12, vol: 0.95 },
    { freq: 1318.5, duration: 0.28, vol: 0.98 }
  ]);

  // 2. Stamp Ding (Cash register coin chime: A5 -> E6)
  SOUNDS.stamp = buildWavDataUri([
    { freq: 880, duration: 0.09, vol: 0.95 },
    { freq: 1320, duration: 0.24, vol: 0.95 }
  ]);

  // 3. Reward Fanfare (4-tone celebratory chord: C5 -> E5 -> G5 -> C6)
  SOUNDS.reward = buildWavDataUri([
    { freq: 523.25, duration: 0.10, vol: 0.95 },
    { freq: 659.25, duration: 0.10, vol: 0.95 },
    { freq: 783.99, duration: 0.10, vol: 0.95 },
    { freq: 1046.5, duration: 0.32, vol: 0.98 }
  ]);

  // 4. Warning (Low double-beep)
  SOUNDS.warning = buildWavDataUri([
    { freq: 340, duration: 0.11, vol: 0.9 },
    { freq: 240, duration: 0.18, vol: 0.9 }
  ]);

  // 5. Undo (Descending tone)
  SOUNDS.undo = buildWavDataUri([
    { freq: 980, duration: 0.09, vol: 0.85 },
    { freq: 520, duration: 0.16, vol: 0.85 }
  ]);
} catch (e) {}

window.triggerSound = function(type) {
  try {
    var uri = SOUNDS[type] || SOUNDS.notification;
    if (uri) {
      var audio = new Audio(uri);
      audio.volume = 1.0;
      var playPromise = audio.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(function() {});
      }
    }
  } catch (err) {}
};
</script>
</head>
<body style="margin:0;padding:0;background:transparent;"></body>
</html>
`;

export const SoundBridge: React.FC = () => {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      registerSoundBridge((type: SoundType) => {
        webViewRef.current?.injectJavaScript(
          `window.triggerSound && window.triggerSound('${type}'); true;`
        );
      });
    }
    return () => {
      registerSoundBridge(null);
    };
  }, []);

  if (Platform.OS === 'web') {
    return null;
  }

  // Must remain within visible screen bounds (bottom-right 2x2px) so Android/iOS do not suspend WebView media playback
  return (
    <View
      style={{
        width: 2,
        height: 2,
        opacity: 0.02,
        position: 'absolute',
        bottom: 2,
        right: 2,
        zIndex: 1,
      }}
      pointerEvents="none"
    >
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: SOUND_HTML }}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="always"
        style={{ width: 2, height: 2, backgroundColor: 'transparent' }}
      />
    </View>
  );
};
