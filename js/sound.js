/* 効果音（Web Audio で合成）と声（端末の日本語音声合成）。 */
(function (JKM) {
  'use strict';

  const opts = { sfx: true, voice: true };
  let ctx = null;
  let out = null;
  let noiseBuf = null;
  let jaVoice = null;

  function audio() {
    if (!opts.sfx) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0.6;
      const comp = ctx.createDynamicsCompressor();
      out.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, o) {
    const c = audio();
    if (!c) return;
    const { type = 'square', at = 0, dur = 0.1, vol = 0.12, to = null, attack = 0.003 } = o || {};
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(o) {
    const c = audio();
    if (!c) return;
    const { at = 0, dur = 0.08, vol = 0.1, freq = 4000, q = 1 } = o || {};
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const sfx = {
    coin() {
      [2637, 3951, 5274].forEach((f) => tone(f, { type: 'sine', dur: 0.26, vol: 0.07 }));
      noise({ dur: 0.04, vol: 0.14, freq: 6000, q: 2 });
      [2489, 3729].forEach((f) => tone(f, { type: 'sine', at: 0.075, dur: 0.18, vol: 0.045 }));
      tone(150, { type: 'triangle', at: 0.13, dur: 0.08, vol: 0.14 });
    },
    medal() {
      tone(3136, { type: 'sine', dur: 0.16, vol: 0.07 });
      tone(4699, { type: 'sine', dur: 0.1, vol: 0.035 });
      noise({ dur: 0.05, vol: 0.1, freq: 5200, q: 3 });
      noise({ at: 0.02, dur: 0.09, vol: 0.04, freq: 900, q: 0.8 });
    },
    tick(hi) {
      tone(hi ? 2093 : 1568, { dur: 0.03, vol: 0.08 });
    },
    stop() {
      tone(1568, { dur: 0.08, vol: 0.11 });
      tone(2093, { at: 0.09, dur: 0.18, vol: 0.11 });
    },
    fanfare() {
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.12, vol: 0.09 }));
      [1047, 1319, 1568].forEach((f) => tone(f, { at: 0.3, dur: 0.45, vol: 0.05 }));
    },
    zuko() {
      noise({ dur: 0.06, vol: 0.16, freq: 600, q: 0.7 });
      tone(520, { type: 'sawtooth', at: 0.05, dur: 0.75, vol: 0.11, to: 60 });
      tone(260, { type: 'square', at: 0.05, dur: 0.7, vol: 0.045, to: 40 });
    },
    press() {
      tone(880, { dur: 0.035, vol: 0.06 });
    },
    reject() {
      tone(110, { dur: 0.18, vol: 0.11 });
      tone(104, { dur: 0.18, vol: 0.07 });
    },
    take() {
      for (let i = 0; i < 6; i++) {
        tone(2700 + Math.random() * 1400, { type: 'sine', at: i * 0.035, dur: 0.12, vol: 0.035 });
      }
      noise({ dur: 0.22, vol: 0.05, freq: 5200, q: 1.5 });
    },
    staff() {
      tone(988, { dur: 0.12, vol: 0.09 });
      tone(784, { at: 0.15, dur: 0.2, vol: 0.09 });
    }
  };

  // 声。実機は子どもの声なので、高めのピッチで読ませる。
  const VOICE = {
    jan: { text: 'じゃーん、けーん', pitch: 1.9, rate: 0.95 },
    pon: { text: 'ぽんっ', pitch: 2, rate: 1.2 },
    aiko: { text: 'あーいこーで', pitch: 1.9, rate: 1 },
    sho: { text: 'しょっ', pitch: 2, rate: 1.2 },
    fever: { text: 'フィーバー', pitch: 1.7, rate: 1.05 },
    yappy: { text: 'ヤッピー', pitch: 2, rate: 1.15 },
    zuko: { text: 'ズコー', pitch: 0.5, rate: 0.75 }
  };

  // 日本語の音声が無い端末向けの、ピコピコ音の代役。
  const BEEP = {
    jan() {
      tone(784, { dur: 0.32, vol: 0.09 });
      tone(659, { at: 0.36, dur: 0.32, vol: 0.09 });
    },
    pon() {
      tone(1047, { dur: 0.12, vol: 0.11 });
    },
    aiko() {
      tone(659, { dur: 0.2, vol: 0.09 });
      tone(784, { at: 0.22, dur: 0.2, vol: 0.09 });
      tone(880, { at: 0.44, dur: 0.18, vol: 0.09 });
    },
    sho() {
      tone(1047, { dur: 0.12, vol: 0.11 });
    },
    fever() {
      tone(523, { dur: 0.5, vol: 0.09, to: 2093 });
    },
    yappy() {
      tone(1319, { dur: 0.08, vol: 0.09 });
      tone(1760, { at: 0.09, dur: 0.14, vol: 0.09 });
    },
    zuko() {}
  };

  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const ja = window.speechSynthesis.getVoices().filter((v) => /^ja/i.test(v.lang));
    jaVoice = ja.find((v) => /kyoko|o-ren|google/i.test(v.name)) || ja[0] || null;
  }

  if ('speechSynthesis' in window) {
    pickVoice();
    if (window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    }
  }

  // sounds/voices.js に書かれた音声ファイル。あれば音声合成より優先して鳴らす。
  const samples = {};
  let playing = null;
  const files = window.JKM_VOICE_FILES || {};
  Object.keys(VOICE).forEach((key) => {
    const name = typeof files[key] === 'string' ? files[key].trim() : '';
    if (!name) return;
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('loadedmetadata', () => {
      samples[key] = a;
    }, { once: true });
    a.addEventListener('error', () => {
      delete samples[key];
      console.warn(`声の音源を読み込めませんでした: sounds/${name}`);
    }, { once: true });
    a.src = `sounds/${encodeURIComponent(name)}`;
    a.load();
  });

  function playSample(key) {
    const a = samples[key];
    if (!a) return false;
    if (playing && playing !== a) playing.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
    playing = a;
    return true;
  }

  function say(key) {
    if (!opts.voice) return;
    const v = VOICE[key];
    if (!v) return;
    if (playSample(key)) return;
    if (jaVoice) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(v.text);
        u.lang = 'ja-JP';
        u.voice = jaVoice;
        u.pitch = v.pitch;
        u.rate = v.rate;
        window.speechSynthesis.speak(u);
        return;
      } catch (e) {
        jaVoice = null;
      }
    }
    BEEP[key]();
  }

  function hush() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (playing) playing.pause();
  }

  // 最初のクリックで呼ぶ（ブラウザは操作前の音を止めるため）。
  function unlock() {
    audio();
    pickVoice();
  }

  JKM.Sound = Object.assign(
    {
      opts,
      say,
      hush,
      unlock,
      hasVoice: () => !!jaVoice,
      hasSample: (key) => !!samples[key],
      sampleCount: () => Object.keys(samples).length,
      VOICE_KEYS: Object.keys(VOICE)
    },
    sfx
  );
})(window.JKM = window.JKM || {});
