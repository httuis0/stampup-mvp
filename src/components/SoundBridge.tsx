// ============================================================
// Sound Bridge Component (Native Audio Synthesizer)
// Zero-dependency native sound generator for iOS & Android
// using embedded WebView audio synthesis.
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
var audioCtx = null;

function getContext() {
  if (!audioCtx) {
    var AudioClass = window.AudioContext || window.webkitAudioContext;
    if (AudioClass) {
      audioCtx = new AudioClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Warm up audio context on load
document.addEventListener('DOMContentLoaded', function() {
  try { getContext(); } catch(e){}
});
window.addEventListener('click', function() {
  try { getContext(); } catch(e){}
});

window.triggerSound = function(type) {
  try {
    var ctx = getContext();
    if (!ctx) return;

    if (type === 'notification') {
      // Crisp 3-note modern notification chime (G5 -> C6 -> E6)
      var notes = [783.99, 1046.50, 1318.51];
      notes.forEach(function(freq, idx) {
        var startTime = ctx.currentTime + (idx * 0.08);
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.32);
      });
    } else if (type === 'stamp') {
      // Pleasant POS register stamp ding (A5 -> E6)
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'reward') {
      // Celebratory 4-note victory fanfare chord
      var notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach(function(freq, idx) {
        var startTime = ctx.currentTime + (idx * 0.08);
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.38);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.38);
      });
    } else if (type === 'warning') {
      // Low double-thud warning
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.setValueAtTime(240, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'undo') {
      // Rewind swoop
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch(err) {
    console.error('Audio synthesis error:', err);
  }
};
</script>
</head>
<body style="background:transparent;"></body>
</html>
`;

export const SoundBridge: React.FC = () => {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      registerSoundBridge((type: SoundType) => {
        webViewRef.current?.injectJavaScript(`window.triggerSound && window.triggerSound('${type}'); true;`);
      });
    }
    return () => {
      registerSoundBridge(null);
    };
  }, []);

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View
      style={{
        width: 1,
        height: 1,
        opacity: 0.01,
        position: 'absolute',
        top: -100,
        left: -100,
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
        style={{ width: 1, height: 1 }}
      />
    </View>
  );
};
