/* 盤面（バックライト付きの印刷パネル + ルーレットランプ + LED の手）を SVG で組み立てる。 */
(function (JKM) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const SIZE = 400;
  const CX = 200;
  const CY = 238;
  const R_IN = 100;
  const R_OUT = 142;
  // 12時の位置から時計回り。実機フィーバーの盤面の並び。
  const RING = [4, 7, 2, 7, 4, 2, 20, 1, 2, 4, 7, 2];
  const INK = '#3b2414';

  const lamps = {};
  const ringLamps = [];
  const handGroups = [];
  let shuffleTimer = null;

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function r2(n) {
    return Math.round(n * 100) / 100;
  }

  // deg は 12 時から時計回りの角度。
  function polar(r, deg) {
    const a = (deg * Math.PI) / 180;
    return [r2(CX + r * Math.sin(a)), r2(CY - r * Math.cos(a))];
  }

  function sector(r1, r2_, a1, a2) {
    const large = a2 - a1 > 180 ? 1 : 0;
    const [x1, y1] = polar(r2_, a1);
    const [x2, y2] = polar(r2_, a2);
    const [x3, y3] = polar(r1, a2);
    const [x4, y4] = polar(r1, a1);
    return `M${x1} ${y1}A${r2_} ${r2_} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 ${large} 0 ${x4} ${y4}Z`;
  }

  // 中心から deg 方向に伸ばした線がパネルの縁に当たる点。
  function rayToEdge(deg) {
    const a = (deg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const ts = [];
    if (dx > 0) ts.push((SIZE - CX) / dx);
    if (dx < 0) ts.push(-CX / dx);
    if (dy > 0) ts.push((SIZE - CY) / dy);
    if (dy < 0) ts.push(-CY / dy);
    const t = Math.min(...ts);
    return [r2(CX + dx * t), r2(CY + dy * t)];
  }

  function angleOf(x, y) {
    const deg = (Math.atan2(x - CX, CY - y) * 180) / Math.PI;
    return (deg + 360) % 360;
  }

  // リングの外側からパネルの縁までを、角度 a1〜a2 で切り取った領域。
  function region(a1, a2, rInner) {
    const corners = [[0, 0], [SIZE, 0], [SIZE, SIZE], [0, SIZE]]
      .map(([x, y]) => ({ x, y, a: angleOf(x, y) }))
      .filter((c) => c.a > a1 && c.a < a2)
      .sort((p, q) => p.a - q.a);
    const [sx, sy] = polar(rInner, a1);
    const [ex, ey] = polar(rInner, a2);
    let d = `M${sx} ${sy}L${rayToEdge(a1).join(' ')}`;
    for (const c of corners) d += `L${c.x} ${c.y}`;
    d += `L${rayToEdge(a2).join(' ')}L${ex} ${ey}A${rInner} ${rInner} 0 0 0 ${sx} ${sy}Z`;
    return d;
  }

  function label(parent, str, x, y, attrs) {
    const t = el(
      'text',
      Object.assign({ x: r2(x), y: r2(y), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, attrs),
      parent
    );
    t.textContent = str;
    return t;
  }

  function lamp(parent, name, d, fill, litFill, decorate) {
    const g = el('g', { class: 'lamp', 'data-lamp': name }, parent);
    el('path', { d, fill }, g);
    el('path', { d, class: 'lamp-lit', fill: litFill }, g);
    if (decorate) decorate(g);
    el('path', { d, class: 'lamp-shade', fill: '#2b1606' }, g);
    el('path', { d, class: 'lamp-glow', fill: 'url(#pg-glow)' }, g);
    return g;
  }

  function mascot(parent, x, y, r, fill, hand) {
    el('circle', { cx: x, cy: y, r, fill, stroke: '#fff', 'stroke-width': 2.4 }, parent);
    el('circle', { cx: x, cy: y, r: r + 1.6, fill: 'none', stroke: INK, 'stroke-width': 1 }, parent);
    const s = el('svg', { x: x - r * 0.78, y: y - r * 0.8, width: r * 1.56, height: r * 1.56, viewBox: '0 0 200 200' }, parent);
    s.innerHTML = JKM.Hand.icon(hand, '#4a3326').replace(/^<svg[^>]*>|<\/svg>$/g, '');
  }

  function bolt(parent, deg, len) {
    const k = len / 54;
    const steps = [[6, 0], [20, 3.4], [17, -2.2], [36, 2.6], [33, -2.4], [54, 1]];
    const pts = steps.map(([r, off]) => polar(R_OUT + r * k, deg + off).join(',')).join(' ');
    el('polyline', { points: pts, fill: 'none', stroke: '#5a3014', 'stroke-width': 4.4, 'stroke-linejoin': 'miter' }, parent);
    el('polyline', { points: pts, fill: 'none', stroke: '#fffdf4', 'stroke-width': 2.2, 'stroke-linejoin': 'miter' }, parent);
  }

  function build(svg) {
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    const defs = el('defs', {}, svg);
    defs.innerHTML = `
      <radialGradient id="pg-bg" cx="50%" cy="38%" r="78%">
        <stop offset="0" stop-color="#ffe86a"/><stop offset="1" stop-color="#f3c218"/>
      </radialGradient>
      <radialGradient id="pg-glow" cx="50%" cy="50%" r="60%">
        <stop offset="0" stop-color="#fffdf0" stop-opacity=".7"/>
        <stop offset=".55" stop-color="#fff3c8" stop-opacity=".25"/>
        <stop offset="1" stop-color="#fff3c8" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="pg-led-bg" cx="50%" cy="44%" r="56%">
        <stop offset="0" stop-color="#2a0806"/><stop offset=".78" stop-color="#0e0202"/><stop offset="1" stop-color="#030000"/>
      </radialGradient>
      <radialGradient id="pg-led-on" cx="40%" cy="36%" r="64%">
        <stop offset="0" stop-color="#fff3e2"/><stop offset=".34" stop-color="#ff7454"/><stop offset="1" stop-color="#c8180b"/>
      </radialGradient>
      <radialGradient id="pg-led-off" cx="40%" cy="36%" r="64%">
        <stop offset="0" stop-color="#3f0f0b"/><stop offset="1" stop-color="#1c0403"/>
      </radialGradient>
      <filter id="pg-halo" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.7"/>
      </filter>
      <filter id="pg-drop" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.4" stdDeviation=".5" flood-color="#2a1205" flood-opacity=".55"/>
      </filter>
      <clipPath id="pg-clip"><rect width="${SIZE}" height="${SIZE}"/></clipPath>`;

    const root = el('g', { 'clip-path': 'url(#pg-clip)' }, svg);

    // 地色：上は黄色、下半分はピンク。
    el('rect', { width: SIZE, height: SIZE, fill: 'url(#pg-bg)' }, root);
    el('rect', { x: 0, y: CY + 14, width: SIZE, height: SIZE - CY - 14, fill: '#f7b4c9' }, root);

    // まけ / あいこ（下半分の左右）
    lamps.make = lamp(root, 'make', region(194, 256, R_OUT + 5), '#f7b4c9', '#ffd9e6', (g) => {
      const st = { fill: '#2a5ec6', stroke: '#fff', 'stroke-width': 5, 'paint-order': 'stroke', 'font-size': 33, class: 'pg-kana', filter: 'url(#pg-drop)' };
      label(g, 'ま', 34, 306, st);
      label(g, 'け', 46, 354, st);
    });
    lamps.aiko = lamp(root, 'aiko', region(104, 166, R_OUT + 5), '#f7b4c9', '#ffd9e6', (g) => {
      const st = { fill: '#1f9f51', stroke: '#fff', 'stroke-width': 5, 'paint-order': 'stroke', 'font-size': 31, class: 'pg-kana', filter: 'url(#pg-drop)' };
      label(g, 'あ', 366, 297, st);
      label(g, 'い', 361, 334, st);
      label(g, 'こ', 351, 369, st);
    });

    // 虹のアーチと「かち」
    el('path', { d: sector(R_OUT + 5, R_OUT + 24, -104, 104), fill: '#f08b23' }, root);
    el('path', { d: sector(R_OUT + 24, R_OUT + 46, -22, 22), fill: '#f9b532' }, root);
    const kachiText = (left) => (g) => {
      const st = { fill: '#fffaf0', stroke: INK, 'stroke-width': 4.5, 'paint-order': 'stroke', 'font-size': 30, class: 'pg-kana', filter: 'url(#pg-drop)' };
      const s = left ? -1 : 1;
      label(g, 'か', ...polar(R_OUT + 44, s * 38), st);
      label(g, 'ち', ...polar(R_OUT + 44, s * 59), st);
    };
    lamps.kachiL = lamp(root, 'kachiL', sector(R_OUT + 24, R_OUT + 64, -80, -22), '#df4528', '#ff7a3c', kachiText(true));
    lamps.kachiR = lamp(root, 'kachiR', sector(R_OUT + 24, R_OUT + 64, 22, 80), '#df4528', '#ff7a3c', kachiText(false));
    el('path', { d: sector(R_OUT + 24, R_OUT + 64, -80, -22), fill: 'none', stroke: INK, 'stroke-width': 1.2 }, root);
    el('path', { d: sector(R_OUT + 24, R_OUT + 64, 22, 80), fill: 'none', stroke: INK, 'stroke-width': 1.2 }, root);

    [[-100, 30], [-84, 32], [-27, 50], [-17, 46], [17, 46], [27, 50], [84, 32], [100, 30]].forEach(([a, len]) => bolt(root, a, len));

    // マスコット（グー・チョキ・パー）
    mascot(root, ...polar(R_OUT + 35, 0), 16, '#3c86d8', 1);
    mascot(root, CX - 177, CY - 2, 15.5, '#41ad5d', 0);
    mascot(root, CX + 177, CY - 2, 15.5, '#f29cc2', 2);

    // タイトル
    const title = label(root, 'ジャンケンマン', 12, 30, {
      'text-anchor': 'start', class: 'pg-title', 'font-size': 25, fill: '#e1301c',
      stroke: '#6e1206', 'stroke-width': 1.1, textLength: 166, lengthAdjust: 'spacingAndGlyphs',
      transform: 'rotate(3 12 30)'
    });
    title.setAttribute('filter', 'url(#pg-drop)');
    label(root, 'TM', 186, 22, { 'font-size': 6.5, fill: '#6e1206', class: 'pg-tm' });
    label(root, 'フィーバー', 388, 30, {
      'text-anchor': 'end', class: 'pg-fever', 'font-size': 26, fill: '#ffd6e8',
      stroke: '#df4790', 'stroke-width': 3, 'paint-order': 'stroke', textLength: 128,
      lengthAdjust: 'spacingAndGlyphs', transform: 'rotate(-3 388 30)'
    });

    // ルーレット
    el('circle', { cx: CX, cy: CY, r: R_OUT + 4.5, fill: 'none', stroke: '#fbfaf4', 'stroke-width': 7 }, root);
    el('circle', { cx: CX, cy: CY, r: R_OUT + 8.2, fill: 'none', stroke: INK, 'stroke-width': 1.2 }, root);
    RING.forEach((n, i) => {
      const a = i * 30;
      const orange = i % 2 === 0;
      const g = lamp(root, `ring${i}`, sector(R_IN, R_OUT, a - 15, a + 15), orange ? '#f08b23' : '#f6f2e6', orange ? '#ffe066' : '#fff59a', (lg) => {
        const [x, y] = polar((R_IN + R_OUT) / 2, a);
        label(lg, String(n), x, y, {
          class: 'pg-num', 'font-size': n === 20 ? 23 : 27, fill: orange ? '#fffaf0' : '#ee8420',
          stroke: '#5a3014', 'stroke-width': 3, 'paint-order': 'stroke', transform: `rotate(${a + 180} ${x} ${y})`
        });
      });
      ringLamps.push(g);
    });
    RING.forEach((_, i) => {
      const a = i * 30 - 15;
      const [x1, y1] = polar(R_IN, a);
      const [x2, y2] = polar(R_OUT, a);
      el('line', { x1, y1, x2, y2, stroke: '#7a4a22', 'stroke-width': 1.1 }, root);
    });
    el('circle', { cx: CX, cy: CY, r: R_OUT + 0.6, fill: 'none', stroke: INK, 'stroke-width': 0.9 }, root);

    // LED の窓
    el('circle', { cx: CX, cy: CY, r: R_IN, fill: 'url(#pg-led-bg)', stroke: '#d8dbde', 'stroke-width': 3.2 }, root);
    el('circle', { cx: CX, cy: CY, r: R_IN - 2, fill: 'none', stroke: '#5d6166', 'stroke-width': 1 }, root);

    const k = 0.9;
    const toPanel = ([x, y]) => [r2(CX + (x - 100) * k), r2(CY + (y - 100) * k)];
    const shapes = JKM.Hand.PATHS.map((paths) => JKM.Hand.sample(paths, 10).map(toPanel));
    const ghost = [];
    shapes.flat().forEach((p) => {
      if (!ghost.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 4.2)) ghost.push(p);
    });
    const ghostG = el('g', { class: 'led-ghost' }, root);
    ghost.forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 2.6, fill: 'url(#pg-led-off)' }, ghostG));
    shapes.forEach((pts, h) => {
      const g = el('g', { class: 'led-hand', 'data-hand': h, style: 'display:none' }, root);
      const halo = el('g', { filter: 'url(#pg-halo)', opacity: 0.9 }, g);
      pts.forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 4, fill: '#ff2a12' }, halo));
      pts.forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 2.75, fill: 'url(#pg-led-on)' }, g));
      handGroups.push(g);
    });

    // ドームのガラスの映り込み
    el('ellipse', { cx: CX - 32, cy: CY - 52, rx: 46, ry: 17, fill: '#fff', opacity: 0.07, transform: `rotate(-28 ${CX - 32} ${CY - 52})` }, root);
  }

  function setHand(h) {
    handGroups.forEach((g, i) => {
      g.style.display = i === h ? '' : 'none';
    });
  }

  function shuffle(on) {
    clearInterval(shuffleTimer);
    shuffleTimer = null;
    if (!on) return;
    let h = 0;
    setHand(h);
    shuffleTimer = setInterval(() => {
      h = (h + 1) % 3;
      setHand(h);
    }, 85);
  }

  function setMode(g, mode) {
    g.classList.toggle('on', mode === 'on');
    g.classList.toggle('blink', mode === 'blink');
  }

  function setLamp(name, mode) {
    if (name === 'kachi') {
      setMode(lamps.kachiL, mode);
      setMode(lamps.kachiR, mode);
    } else if (lamps[name]) {
      setMode(lamps[name], mode);
    }
  }

  function setRing(index, mode) {
    ringLamps.forEach((g, i) => setMode(g, i === index ? mode : false));
  }

  function clear() {
    shuffle(false);
    ['kachi', 'make', 'aiko'].forEach((n) => setLamp(n, false));
    setRing(null, false);
  }

  JKM.Panel = { RING, build, setHand, shuffle, setLamp, setRing, clear };
})(window.JKM = window.JKM || {});
