/* LED の手の形。200×200 のマス目に、手首を下にして描いた輪郭線。 */
(function (JKM) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const NAMES = ['グー', 'チョキ', 'パー'];

  // 1本目が外形、2本目以降は内側の線（指の境目・親指など）。
  const PATHS = [
    [ // グー
      'M66 186 C60 164 47 142 47 116 C47 98 53 84 61 75 C64 62 82 59 87 70 C91 57 109 55 114 67 C119 57 136 59 139 71 C147 65 160 72 159 87 C161 105 157 127 149 145 C143 159 139 173 139 186',
      'M87 72 C87 84 88 94 89 103',
      'M114 69 C114 80 114 92 114 103',
      'M139 73 C139 84 138 95 136 105',
      'M49 120 C70 111 97 109 118 115 C129 119 128 130 117 133'
    ],
    [ // チョキ
      'M66 186 C60 164 49 142 49 118 C49 104 53 95 59 88 L35 36 C29 22 47 12 57 24 L88 80 L101 20 C104 6 126 6 127 20 L121 92 C128 83 143 83 146 95 C153 89 164 96 162 109 C164 126 157 140 149 152 C143 161 139 173 139 186',
      'M51 124 C73 115 101 115 121 121 C131 125 129 136 119 138',
      'M146 97 C146 106 144 113 142 119'
    ],
    [ // パー
      'M70 188 C66 168 60 152 54 140 L22 112 C10 101 22 83 37 92 L63 112 L50 46 C47 31 69 28 72 43 L83 97 L84 28 C84 13 105 13 105 28 L105 95 L119 36 C123 22 142 27 138 42 L125 103 L149 63 C156 51 173 58 166 73 L145 125 C143 151 137 171 133 188',
      'M90 126 L99 148',
      'M119 126 L107 148'
    ]
  ];

  // 輪郭線に沿って、ほぼ等間隔に LED の位置を打つ。
  function sample(paths, spacing) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.visibility = 'hidden';
    document.body.appendChild(svg);
    const pts = [];
    for (const d of paths) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
      const len = p.getTotalLength();
      const n = Math.max(1, Math.round(len / spacing));
      for (let i = 0; i <= n; i++) {
        const q = p.getPointAtLength((len * i) / n);
        const tooClose = pts.some((o) => Math.hypot(o[0] - q.x, o[1] - q.y) < spacing * 0.62);
        if (!tooClose) pts.push([q.x, q.y]);
      }
    }
    svg.remove();
    return pts;
  }

  // ボタン横や盤面のマスコットに使う、白抜きの手のアイコン。
  function icon(h, stroke) {
    const ink = stroke || '#3b2b22';
    const [outline, ...lines] = PATHS[h];
    const inner = lines
      .map((d) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="9" stroke-linecap="round"/>`)
      .join('');
    return (
      `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">` +
      `<path d="${outline}" fill="#fff" stroke="${ink}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>` +
      inner +
      `</svg>`
    );
  }

  JKM.Hand = { NAMES, PATHS, sample, icon };
})(window.JKM = window.JKM || {});
