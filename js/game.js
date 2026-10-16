/* ゲームの進行、筐体まわりの操作、保存。 */
(function (JKM) {
  'use strict';

  const { Panel, Sound, Hand } = JKM;
  const STORAGE_KEY = 'jankenman-fever:v1';
  const HOPPER_FULL = 300;
  const START_MEDALS = 10;
  const CAB_W = 440;
  const CAB_H = 1010;
  const TRAY_DRAW_MAX = 70;

  // 設定ごとの勝ち・負けの確率（残りがあいこ）と、ルーレットの止まりやすさ。
  const SETTINGS = {
    1: { win: 0.26, lose: 0.5, weights: { 1: 58, 2: 30, 4: 8, 7: 3, 20: 1 } },
    2: { win: 0.28, lose: 0.48, weights: { 1: 57, 2: 30, 4: 8.5, 7: 3.5, 20: 1 } },
    3: { win: 0.3, lose: 0.45, weights: { 1: 55, 2: 30, 4: 9, 7: 4.5, 20: 1.5 } },
    4: { win: 0.31, lose: 0.44, weights: { 1: 53, 2: 30, 4: 10, 7: 5, 20: 2 } },
    5: { win: 0.32, lose: 0.43, weights: { 1: 52, 2: 30, 4: 10.5, 7: 5.5, 20: 2 } },
    6: { win: 0.33, lose: 0.42, weights: { 1: 50, 2: 30, 4: 11, 7: 6, 20: 3 } }
  };

  const LINES = {
    jan: 'じゃーん、けーん…',
    pon: 'ぽんっ！',
    aiko: 'あーいこーで…',
    sho: 'しょっ！',
    fever: 'フィーバー！',
    yappy: 'ヤッピー！',
    zuko: 'ズコー'
  };

  const st = fresh();
  let phase = 'idle'; // idle | coin | call | reveal | win | lose | empty
  let calling = 'jan';
  let round = null;
  let ringPos = 0;
  let run = 0;
  let attractDelay = null;
  let attractTimer = null;
  let balloonTimer = null;
  let msgTimer = null;
  let statusText = '';
  let scale = 1;

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fresh() {
    return {
      medals: START_MEDALS,
      tray: 0,
      yen: 0,
      hopper: HOPPER_FULL,
      owed: 0,
      setting: 3,
      voice: true,
      sfx: true,
      stats: { plays: 0, win: 0, lose: 0, aiko: 0, paid: 0, best: 0 }
    };
  }

  /* ---------- 保存 ---------- */

  function load(data) {
    let saved = data && data.state;
    if (!saved) {
      try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      } catch (e) {
        saved = null;
      }
    }
    if (saved && typeof saved === 'object') {
      const base = fresh();
      Object.assign(st, base, saved, { stats: Object.assign(base.stats, saved.stats || {}) });
    }
    if (!SETTINGS[st.setting]) st.setting = 3;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    } catch (e) {
      /* 保存できない環境でも遊べる */
    }
  }

  /* ---------- 確率 ---------- */

  function payback(n) {
    const s = SETTINGS[n];
    const entries = Object.entries(s.weights);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    const ev = entries.reduce((a, [v, w]) => a + Number(v) * w, 0) / total;
    return (s.win / (s.win + s.lose)) * ev;
  }

  function pickWeighted(weights) {
    const entries = Object.entries(weights);
    let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
    for (const [v, w] of entries) {
      r -= w;
      if (r < 0) return Number(v);
    }
    return Number(entries[0][0]);
  }

  // コインを入れた時点で、あいこの回数・勝ち負け・配当まで決めておく。
  function drawRound() {
    const s = SETTINGS[st.setting];
    const aikoP = 1 - s.win - s.lose;
    let aikoLeft = 0;
    while (aikoLeft < 4 && Math.random() < aikoP) aikoLeft += 1;
    const final = Math.random() < s.win / (s.win + s.lose) ? 'win' : 'lose';
    return { aikoLeft, final, payout: final === 'win' ? pickWeighted(s.weights) : 0 };
  }

  /* ---------- 表示 ---------- */

  function render() {
    $('hudMedals').textContent = st.medals;
    $('hudTray').textContent = st.tray;
    $('hudYen').textContent = st.yen.toLocaleString('ja-JP');
    $('stPlays').textContent = st.stats.plays;
    $('stWin').textContent = st.stats.win;
    $('stLose').textContent = st.stats.lose;
    $('stAiko').textContent = st.stats.aiko;
    $('stPaid').textContent = st.stats.paid;
    $('stBest').textContent = st.stats.best ? `${st.stats.best}枚` : '—';
    $('btnTake').disabled = st.tray === 0;
    $('opHopper').textContent = st.hopper;
    $('opRate').textContent = `${Math.round(payback(st.setting) * 100)}%`;
    $('opVoices').textContent = `${Sound.sampleCount()} / ${Sound.VOICE_KEYS.length}`;
    $('staffLamp').classList.toggle('on', st.owed > 0 && phase === 'empty');
    $('optVoice').checked = st.voice;
    $('optSfx').checked = st.sfx;
    renderTray();
  }

  function renderTray() {
    const inner = $('trayInner');
    const want = Math.min(st.tray, TRAY_DRAW_MAX);
    while (inner.children.length < want) {
      const m = document.createElement('i');
      const n = inner.children.length;
      const rise = Math.min(34, 2 + n * 0.55);
      m.className = 'tray-medal';
      m.style.left = `${6 + Math.random() * 152}px`;
      m.style.bottom = `${2 + Math.random() * rise}px`;
      m.style.setProperty('--tilt', `${(Math.random() * 30 - 15).toFixed(1)}deg`);
      inner.appendChild(m);
    }
    while (inner.children.length > want) inner.lastChild.remove();
  }

  function status(text) {
    statusText = text;
    if (!msgTimer) $('hudMsg').textContent = text;
  }

  function note(text) {
    const m = $('hudMsg');
    m.textContent = text;
    m.classList.add('alert');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => {
      msgTimer = null;
      m.classList.remove('alert');
      m.textContent = statusText;
    }, 2800);
  }

  function speak(key, ms) {
    Sound.say(key);
    const b = $('balloon');
    b.textContent = LINES[key];
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(balloonTimer);
    balloonTimer = setTimeout(() => b.classList.remove('show'), ms || 1400);
  }

  function beacon(on) {
    $('beacon').classList.toggle('on', on);
    $('roomLight').classList.toggle('on', on);
  }

  function setButtonsLive(on) {
    document.querySelectorAll('.hand-btn').forEach((b) => b.classList.toggle('live', on));
  }

  function pressFx(h) {
    const b = document.querySelector(`.hand-btn[data-hand="${h}"]`);
    if (!b) return;
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 150);
  }

  function dropCoin(kind) {
    if (reducedMotion()) return;
    const cab = $('cabinet');
    const slot = $(kind === 'yen' ? 'slotYen' : 'slotMedal').querySelector('.slot');
    const cr = cab.getBoundingClientRect();
    const sr = slot.getBoundingClientRect();
    const x = (sr.left + sr.width / 2 - cr.left) / scale;
    const y = (sr.top - cr.top) / scale;
    const c = document.createElement('i');
    c.className = `coin-fly ${kind}`;
    c.style.left = `${x - 12}px`;
    c.style.top = `${y - 34}px`;
    cab.appendChild(c);
    const anim = c.animate(
      [
        { transform: 'translateY(0) scaleX(1)', opacity: 1 },
        { transform: 'translateY(16px) scaleX(.55)', opacity: 1, offset: 0.55 },
        { transform: 'translateY(34px) scaleX(.2)', opacity: 0 }
      ],
      { duration: 380, easing: 'ease-in' }
    );
    anim.onfinish = () => c.remove();
  }

  /* ---------- 待機中のランプ ---------- */

  function stopAttract() {
    clearTimeout(attractDelay);
    clearInterval(attractTimer);
    attractTimer = null;
    Panel.setRing(null, false);
  }

  function scheduleAttract() {
    stopAttract();
    attractDelay = setTimeout(() => {
      if (phase !== 'idle') return;
      Panel.setHand(null);
      let i = ringPos;
      attractTimer = setInterval(() => {
        i = (i + 1) % 12;
        Panel.setRing(i, 'on');
      }, 280);
    }, 9000);
  }

  /* ---------- ゲームの流れ ---------- */

  function insert(kind) {
    Sound.unlock();
    if (phase !== 'idle') {
      Sound.reject();
      note(phase === 'empty' ? '係員をおよび下さい（カギ穴からホッパー補充）' : 'ゲーム中はコインを入れられません');
      return;
    }
    if (kind === 'medal') {
      if (st.medals <= 0) {
        Sound.reject();
        note('手持ちのメダルがありません。10円で遊ぶか、受け皿のメダルをとってください');
        return;
      }
      st.medals -= 1;
    } else {
      st.yen += 10;
    }
    stopAttract();
    Panel.clear();
    Panel.setHand(null);
    Sound.coin();
    dropCoin(kind);
    st.stats.plays += 1;
    round = drawRound();
    phase = 'coin';
    save();
    render();
    const id = ++run;
    setTimeout(() => {
      if (id === run) call('jan');
    }, 420);
  }

  function call(kind) {
    phase = 'call';
    calling = kind;
    speak(kind, 1700);
    Panel.shuffle(true);
    setButtonsLive(true);
    status(kind === 'jan' ? 'グー・チョキ・パーのボタンをおしてね' : 'あいこ！ もういちどボタンをおしてね');
  }

  async function choose(h) {
    Sound.unlock();
    pressFx(h);
    Sound.press();
    if (phase !== 'call') return;
    const id = run;
    const wasAiko = calling === 'aiko';
    phase = 'reveal';
    setButtonsLive(false);
    speak(wasAiko ? 'sho' : 'pon', 900);

    let result;
    let machine;
    if (round.aikoLeft > 0) {
      round.aikoLeft -= 1;
      result = 'aiko';
      machine = h;
    } else if (round.final === 'win') {
      result = 'win';
      machine = (h + 1) % 3;
    } else {
      result = 'lose';
      machine = (h + 2) % 3;
    }
    Panel.shuffle(false);
    Panel.setHand(machine);
    Panel.setLamp('aiko', false);
    status(`あなた ${Hand.NAMES[h]} ／ ジャンケンマン ${Hand.NAMES[machine]}`);

    await sleep(520);
    if (id !== run) return;
    if (result === 'aiko') {
      st.stats.aiko += 1;
      save();
      render();
      Panel.setLamp('aiko', 'on');
      await sleep(260);
      if (id === run) call('aiko');
    } else if (result === 'lose') {
      await lose(id);
    } else {
      await win(id);
    }
  }

  async function lose(id) {
    phase = 'lose';
    st.stats.lose += 1;
    save();
    render();
    Panel.setLamp('make', 'blink');
    if (!Sound.hasSample('zuko')) Sound.zuko();
    speak('zuko', 1500);
    status('まけ…');
    await sleep(2000);
    if (id === run) endRound();
  }

  async function win(id) {
    phase = 'win';
    st.stats.win += 1;
    save();
    render();
    Panel.setLamp('kachi', 'blink');
    beacon(true);
    if (!Sound.hasSample('fever')) Sound.fanfare();
    speak('fever', 1500);
    status('かち！ ルーレットがまわります');
    await sleep(650);
    if (id !== run) return;
    const target = await spin(round.payout, id);
    if (target === null) return;
    Panel.setRing(target, 'blink');
    Sound.stop();
    await sleep(350);
    if (id !== run) return;
    speak('yappy', 1300);
    status(`${round.payout}枚 でてくるよ！`);
    st.stats.best = Math.max(st.stats.best, round.payout);
    st.owed = round.payout;
    save();
    await payOut(id);
  }

  async function spin(value, id) {
    const spots = Panel.RING.map((v, i) => (v === value ? i : -1)).filter((i) => i >= 0);
    const target = spots[Math.floor(Math.random() * spots.length)];
    const steps = 24 + ((target - ringPos + 12) % 12) + (Math.random() < 0.5 ? 12 : 0);
    for (let s = 1; s <= steps; s++) {
      if (id !== run) return null;
      ringPos = (ringPos + 1) % 12;
      Panel.setRing(ringPos, 'on');
      Sound.tick(s % 2 === 0);
      await sleep(24 + Math.pow(s / steps, 3) * 230);
    }
    return target;
  }

  async function payOut(id) {
    phase = 'win';
    while (st.owed > 0) {
      if (id !== run) return;
      if (st.hopper <= 0) {
        hopperEmpty();
        return;
      }
      st.hopper -= 1;
      st.owed -= 1;
      st.tray += 1;
      st.stats.paid += 1;
      Sound.medal();
      save();
      render();
      await sleep(190);
    }
    await sleep(700);
    if (id === run) endRound();
  }

  function hopperEmpty() {
    phase = 'empty';
    beacon(false);
    Sound.staff();
    status(`払い出しのメダルが切れました（あと${st.owed}枚）。カギ穴の店員メニューでホッパーを補充してください`);
    save();
    render();
  }

  function endRound() {
    phase = 'idle';
    calling = 'jan';
    round = null;
    beacon(false);
    Panel.clear();
    setButtonsLive(false);
    status('コインを入れてね');
    render();
    scheduleAttract();
  }

  function take() {
    Sound.unlock();
    if (st.tray === 0) {
      note('受け皿は空です');
      return;
    }
    note(`受け皿から${st.tray}枚とりました`);
    st.medals += st.tray;
    st.tray = 0;
    Sound.take();
    save();
    render();
  }

  /* ---------- 店員メニュー ---------- */

  function refill() {
    st.hopper = HOPPER_FULL;
    save();
    render();
    note('ホッパーを補充しました');
    if (phase === 'empty' && st.owed > 0) {
      const id = ++run;
      beacon(true);
      status(`のこり${st.owed}枚 でてくるよ！`);
      payOut(id);
    }
  }

  function resetAll() {
    run += 1;
    stopAttract();
    const keep = { voice: st.voice, sfx: st.sfx };
    Object.assign(st, fresh(), keep);
    phase = 'idle';
    round = null;
    Panel.clear();
    Panel.setHand(null);
    beacon(false);
    setButtonsLive(false);
    save();
    render();
    status('コインを入れてね');
    note('データをリセットしました');
  }

  function buildSettingChips() {
    const row = $('settingRow');
    row.innerHTML = '';
    Object.keys(SETTINGS).forEach((n) => {
      const id = `setting${n}`;
      const wrap = document.createElement('label');
      wrap.className = 'set-chip';
      wrap.setAttribute('for', id);
      wrap.innerHTML = `<input type="radio" name="setting" id="${id}" value="${n}"><span>${n}</span>`;
      const input = wrap.querySelector('input');
      input.checked = Number(n) === st.setting;
      input.addEventListener('change', () => {
        st.setting = Number(n);
        save();
        render();
      });
      row.appendChild(wrap);
    });
  }

  function openOp() {
    Sound.unlock();
    const reset = $('opReset');
    reset.dataset.armed = '';
    reset.textContent = 'データをリセット';
    buildSettingChips();
    render();
    $('opMenu').showModal();
    const current = document.querySelector('#settingRow input:checked');
    if (current) current.focus();
  }

  /* ---------- 画面サイズ ---------- */

  function fit() {
    const narrow = window.matchMedia('(max-width: 820px)').matches;
    const hud = $('hud');
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth);
    let s;
    if (narrow) {
      s = Math.min((vw - 44) / CAB_W, 1.05);
    } else {
      s = Math.min((window.innerHeight - 32) / CAB_H, (vw - 44 - 36 - hud.offsetWidth) / CAB_W, 1.15);
    }
    scale = Math.max(0.3, s);
    $('cabinetWrap').style.setProperty('--s', scale.toFixed(4));
  }

  /* ---------- 起動 ---------- */

  function bind() {
    document.querySelectorAll('.hand-btn').forEach((b) => {
      const h = Number(b.dataset.hand);
      b.querySelector('.icon').innerHTML = Hand.icon(h);
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        choose(h);
      });
      b.addEventListener('click', (e) => {
        if (e.detail === 0) choose(h); // キーボードで押したとき
      });
    });
    $('slotYen').addEventListener('click', () => insert('yen'));
    $('slotMedal').addEventListener('click', () => insert('medal'));
    $('btnYen').addEventListener('click', () => insert('yen'));
    $('btnMedal').addEventListener('click', () => insert('medal'));
    $('tray').addEventListener('click', take);
    $('btnTake').addEventListener('click', take);
    $('keyhole').addEventListener('click', openOp);
    $('opRefill').addEventListener('click', refill);
    $('opReset').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed) {
        resetAll();
        $('opMenu').close();
      } else {
        b.dataset.armed = '1';
        b.textContent = 'もう一度押すとリセット';
      }
    });
    $('opMenu').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.close();
    });
    $('optVoice').addEventListener('change', (e) => {
      st.voice = e.target.checked;
      Sound.opts.voice = st.voice;
      if (!st.voice) Sound.hush();
      save();
    });
    $('optSfx').addEventListener('change', (e) => {
      st.sfx = e.target.checked;
      Sound.opts.sfx = st.sfx;
      save();
    });

    document.addEventListener('keydown', (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ($('opMenu').open) return;
      const onControl = e.target.closest && e.target.closest('button, input, label');
      const k = e.key.toLowerCase();
      if (k === '1' || k === '2' || k === '3') {
        choose(Number(k) - 1);
      } else if (k === ' ' && !onControl) {
        e.preventDefault();
        insert(st.medals > 0 ? 'medal' : 'yen');
      } else if (k === 'y') {
        insert('yen');
      } else if (k === 'm') {
        insert('medal');
      } else if (k === 't') {
        take();
      }
    });

    window.addEventListener('resize', fit);
  }

  function start(data) {
    load(data);
    Sound.opts.voice = st.voice;
    Sound.opts.sfx = st.sfx;
    Panel.build($('panel'));
    bind();
    fit();
    if (st.owed > 0) {
      phase = 'empty';
      status(`払い出しのメダルが切れています（あと${st.owed}枚）。カギ穴の店員メニューでホッパーを補充してください`);
    } else {
      status('コインを入れてね');
      Panel.setHand(0);
      scheduleAttract();
    }
    render();
    setTimeout(() => {
      $('voiceNote').hidden = Sound.hasVoice() || Sound.sampleCount() === Sound.VOICE_KEYS.length;
      render();
    }, 1500);
  }

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ state: JSON.parse(JSON.stringify(st)) }));
  if (hot && hot.ready) hot.ready(start);
  else start((hot && hot.data) || {});
})(window.JKM = window.JKM || {});
