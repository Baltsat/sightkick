(() => {
  'use strict';

  const DIRECTIONS = [
    {
      id: 'aurora',
      name: 'Aurora Current',
      accent: '#56d8f2',
      accent2: '#9972ff',
      highlight: '#fff4d8',
      duration: 2.2,
    },
    {
      id: 'resonance',
      name: 'Drumhead Resonance',
      accent: '#57e3f7',
      accent2: '#ffad2f',
      highlight: '#fff0c8',
      duration: 1.75,
    },
    {
      id: 'chrome',
      name: 'Liquid Chrome',
      accent: '#ee80ff',
      accent2: '#69e7ff',
      highlight: '#fff8eb',
      duration: 2.45,
    },
    {
      id: 'print',
      name: 'Kinetic Print',
      accent: '#ef4d39',
      accent2: '#2d66db',
      highlight: '#111722',
      duration: 1.35,
    },
    {
      id: 'stage',
      name: 'Stage Bloom',
      accent: '#ff714d',
      accent2: '#6759ff',
      highlight: '#ffd699',
      duration: 2.65,
    },
    {
      id: 'orbit',
      name: 'Spectral Orbit',
      accent: '#56d8f2',
      accent2: '#f73586',
      highlight: '#ffca6a',
      duration: 1.95,
    },
  ];
  const app = document.querySelector('#app');
  const canvas = document.querySelector('#motionCanvas');
  const ctx = canvas.getContext('2d');
  const frame = document.querySelector('#motionFrame');
  const frameCopy = document.querySelector('#frameCopy');
  const missCopy = document.querySelector('#missCopy');
  const stageCount = document.querySelector('#stageCount');
  const compactChip = document.querySelector('#compactChip');
  const compactCount = compactChip.querySelector('strong');
  const timelineMarker = document.querySelector('#timelineMarker');
  const timelineName = document.querySelector('#timelineName');
  const directionButtons = [...document.querySelectorAll('.direction-option')];
  const replayButton = document.querySelector('#replayButton');
  const tourButton = document.querySelector('#tourButton');
  const missButton = document.querySelector('#missButton');
  const motionButton = document.querySelector('#motionButton');
  const previewAll = document.querySelector('#previewAll');
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    direction: 0,
    startedAt: performance.now(),
    missStartedAt: 0,
    miss: false,
    reduced: mediaQuery.matches,
    tour: false,
    tourTimer: 0,
    timeline: null,
    captureProgress: null,
    capturePhase: 0,
    cssWidth: 0,
    cssHeight: 0,
    dpr: 1,
  };
  const clamp = (value, min = 0, max = 1) =>
    Math.max(min, Math.min(max, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const easeOutCubic = (value) => 1 - (1 - value) ** 3;
  const easeOutExpo = (value) => (value >= 1 ? 1 : 1 - 2 ** (-10 * value));
  const seeded = (index, salt = 0) => {
    const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;

    return value - Math.floor(value);
  };

  function rgba(hex, alpha) {
    const normalized = hex.replace('#', '');
    const full =
      normalized.length === 3
        ? normalized
            .split('')
            .map((part) => part + part)
            .join('')
        : normalized;
    const value = Number.parseInt(full, 16);

    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${
      value & 255
    }, ${alpha})`;
  }

  function currentDirection() {
    return DIRECTIONS[state.direction];
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));

    if (
      width === state.cssWidth &&
      height === state.cssHeight &&
      dpr === state.dpr
    ) {
      return;
    }

    state.cssWidth = width;
    state.cssHeight = height;
    state.dpr = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function timelineProgress(now) {
    if (state.captureProgress !== null) {
      return state.captureProgress;
    }

    if (state.reduced) {
      return 1;
    }

    const duration = currentDirection().duration * 1000;

    return clamp((now - state.startedAt) / duration);
  }

  function ambientPhase(now) {
    if (state.captureProgress !== null) {
      return state.capturePhase;
    }

    if (state.reduced) {
      return 4.3;
    }

    return now / 1000;
  }

  function beatEnergy(now, progress) {
    if (state.reduced) {
      return 0.36;
    }

    const elapsed = Math.max(0, now - state.startedAt);
    const interval = 138;
    const local = (elapsed % interval) / interval;
    const strike = Math.exp(-local * 7.4);

    return clamp(strike * (0.35 + progress * 0.8));
  }

  function fillBackground(top, bottom) {
    const gradient = ctx.createLinearGradient(0, 0, 0, state.cssHeight);

    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.cssWidth, state.cssHeight);
  }

  function drawGlow(x, y, radius, color, alpha = 1) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, rgba(color, alpha));
    gradient.addColorStop(0.34, rgba(color, alpha * 0.43));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawWave({
    y,
    amplitude,
    frequency,
    phase,
    color,
    alpha = 1,
    width = 2,
    shadow = 0,
    modulation = 0,
  }) {
    const w = state.cssWidth;

    ctx.save();
    ctx.beginPath();

    for (let x = -8; x <= w + 8; x += 5) {
      const envelope = Math.sin(clamp(x / w) * Math.PI) ** 0.65;
      const wave = Math.sin(x * frequency + phase);
      const detail = Math.sin(x * frequency * 2.73 - phase * 0.72) * modulation;
      const pointY = y + (wave * amplitude + detail) * envelope;

      if (x === -8) {
        ctx.moveTo(x, pointY);
      } else {
        ctx.lineTo(x, pointY);
      }
    }

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shadow) {
      ctx.shadowBlur = shadow;
      ctx.shadowColor = color;
    }

    ctx.stroke();
    ctx.restore();
  }

  function drawStars(amount, phase, energy, palette) {
    const w = state.cssWidth;
    const h = state.cssHeight;

    ctx.save();

    for (let index = 0; index < amount; index += 1) {
      const x = seeded(index, 2) * w;
      const y = seeded(index, 5) * h;
      const shimmer = 0.38 + Math.sin(phase * 1.7 + index * 2.3) * 0.24;
      const radius = 0.35 + seeded(index, 9) * 1.45 * energy;

      ctx.fillStyle = rgba(
        palette[index % palette.length],
        clamp(shimmer * energy, 0.06, 0.75),
      );
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawAurora(progress, phase, beat) {
    const w = state.cssWidth;
    const h = state.cssHeight;
    const energy = 0.18 + easeOutCubic(progress) * 0.82;

    fillBackground('#05101e', '#07192a');
    drawGlow(w * 0.34, h * 0.56, w * 0.44, '#2489ff', 0.25 * energy);
    drawGlow(w * 0.71, h * 0.46, w * 0.38, '#bd5dff', 0.22 * energy);
    drawStars(84, phase, energy, ['#56d8f2', '#ffffff', '#a982ff']);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let layer = 0; layer < 7; layer += 1) {
      const amount = layer / 6;
      const y = h * 0.52 + (layer - 3) * (6 + progress * 4);

      drawWave({
        y,
        amplitude: (18 + layer * 2 + beat * 18) * energy,
        frequency: 0.008 + amount * 0.0015,
        phase: phase * (0.74 + amount * 0.16) + layer * 0.44,
        color: layer < 3 ? '#45b7ff' : '#bb6cff',
        alpha: 0.18 + energy * 0.14,
        width: 1.2 + energy * 1.1,
        shadow: 13 + progress * 8,
        modulation: 4 + progress * 6,
      });
    }

    drawWave({
      y: h * 0.52,
      amplitude: (25 + beat * 22) * energy,
      frequency: 0.0083,
      phase: phase * 0.82,
      color: '#e5f8ff',
      alpha: 0.8,
      width: 1.7,
      shadow: 18,
      modulation: 7,
    });
    ctx.restore();

    for (let index = 0; index < 28; index += 1) {
      const x = (index / 27) * w;
      const height =
        (10 + seeded(index, 13) * 92) * energy * (0.45 + beat * 0.5);
      const gradient = ctx.createLinearGradient(
        x,
        h / 2 - height,
        x,
        h / 2 + height,
      );

      gradient.addColorStop(0, rgba(index % 2 ? '#56d8f2' : '#9972ff', 0));
      gradient.addColorStop(
        0.5,
        rgba(index % 2 ? '#56d8f2' : '#9972ff', 0.22 * energy),
      );
      gradient.addColorStop(1, rgba(index % 2 ? '#56d8f2' : '#9972ff', 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x, h / 2 - height, 1, height * 2);
    }
  }

  function drawResonance(progress, phase, beat) {
    const w = state.cssWidth;
    const h = state.cssHeight;
    const cx = w / 2;
    const cy = h * 0.52;
    const energy = 0.18 + easeOutExpo(progress) * 0.82;

    fillBackground('#061113', '#071d22');
    drawGlow(cx, cy, Math.min(w, h) * 0.7, '#20bad7', 0.16 * energy);
    drawGlow(cx, cy, Math.min(w, h) * 0.34, '#ffad2f', 0.13 * energy);

    ctx.save();
    ctx.translate(cx, cy);

    for (let ring = 0; ring < 12; ring += 1) {
      const radius = 24 + ring * 18 + ((progress * 42 + phase * 8) % 18);
      const alpha = clamp((1 - ring / 14) * (0.18 + energy * 0.42));

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(ring % 3 === 0 ? '#ffad2f' : '#57e3f7', alpha);
      ctx.lineWidth = ring % 3 === 0 ? 1.8 : 0.8;
      ctx.shadowBlur = ring < 4 ? 11 : 0;
      ctx.shadowColor = ring % 3 === 0 ? '#ffad2f' : '#57e3f7';
      ctx.stroke();
    }

    const outer = Math.min(w, h) * 0.46;

    for (let tick = 0; tick < 72; tick += 1) {
      const angle = (tick / 72) * Math.PI * 2 - Math.PI / 2;
      const bass = tick % 4 === 0;
      const inner = outer - (bass ? 12 + beat * 8 : 5);
      const outerTick = outer + (bass ? 5 : 0);

      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outerTick, Math.sin(angle) * outerTick);
      ctx.strokeStyle = rgba(bass ? '#ffad2f' : '#57e3f7', bass ? 0.56 : 0.18);
      ctx.lineWidth = bass ? 1.6 : 0.7;
      ctx.stroke();
    }

    ctx.restore();

    const beam = ctx.createLinearGradient(cx, 0, cx, cy);

    beam.addColorStop(0, rgba('#fff1b8', 0));
    beam.addColorStop(0.74, rgba('#fff1b8', 0.14 + beat * 0.32));
    beam.addColorStop(1, rgba('#ffffff', 0.85));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(cx - 4, 0);
    ctx.lineTo(cx + 4, 0);
    ctx.lineTo(cx + 36 + beat * 18, cy);
    ctx.lineTo(cx - 36 - beat * 18, cy);
    ctx.closePath();
    ctx.fill();
    drawGlow(cx, cy, 52 + beat * 36, '#ffffff', 0.22 + beat * 0.26);
  }

  function drawChrome(progress, phase, beat) {
    const w = state.cssWidth;
    const h = state.cssHeight;
    const energy = 0.2 + easeOutCubic(progress) * 0.8;

    fillBackground('#080a10', '#121018');
    drawGlow(w * 0.28, h * 0.54, w * 0.38, '#365cff', 0.13 * energy);
    drawGlow(w * 0.73, h * 0.5, w * 0.36, '#ef5bff', 0.14 * energy);
    drawStars(42, phase * 0.4, energy, ['#ffffff', '#69e7ff', '#ee80ff']);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let ribbon = 0; ribbon < 5; ribbon += 1) {
      const gradient = ctx.createLinearGradient(0, 0, w, h);

      gradient.addColorStop(0, rgba('#244eff', 0.08));
      gradient.addColorStop(0.2, rgba('#6be9ff', 0.72));
      gradient.addColorStop(0.38, rgba('#fffdf1', 0.92));
      gradient.addColorStop(0.56, rgba('#ed73ff', 0.78));
      gradient.addColorStop(0.76, rgba('#5ee9ff', 0.78));
      gradient.addColorStop(1, rgba('#ffffff', 0.12));
      drawWave({
        y: h * 0.5 + (ribbon - 2) * 12,
        amplitude: (30 + ribbon * 3 + beat * 20) * energy,
        frequency: 0.0062 + ribbon * 0.00035,
        phase: phase * (0.45 + ribbon * 0.04) + ribbon * 1.2,
        color: gradient,
        alpha: 0.28 + energy * 0.16,
        width: 17 - ribbon * 2,
        shadow: 20,
        modulation: 7,
      });
    }

    ctx.restore();

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(phase * 0.05);

    for (let glint = 0; glint < 8; glint += 1) {
      const angle = (glint / 8) * Math.PI * 2;
      const radius = 94 + seeded(glint, 20) * 34;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.55;

      ctx.fillStyle = rgba(glint % 2 ? '#fff8d7' : '#8aeaff', 0.34 * energy);
      ctx.fillRect(x - 0.6, y - 9, 1.2, 18);
      ctx.fillRect(x - 9, y - 0.6, 18, 1.2);
    }

    ctx.restore();
  }

  function drawPrint(progress, phase, beat) {
    const w = state.cssWidth;
    const h = state.cssHeight;
    const energy = 0.26 + easeOutExpo(progress) * 0.74;

    fillBackground('#f3eddf', '#e8dfcd');

    ctx.save();

    for (let index = 0; index < 180; index += 1) {
      const x = seeded(index, 35) * w;
      const y = seeded(index, 40) * h;
      const alpha = 0.025 + seeded(index, 42) * 0.07;

      ctx.fillStyle = `rgba(17, 23, 34, ${alpha})`;
      ctx.fillRect(
        x,
        y,
        0.6 + seeded(index, 44) * 1.2,
        0.6 + seeded(index, 46) * 1.2,
      );
    }

    const ringRadius = 72 + progress * 72;

    ctx.translate(w * 0.5, h * 0.53);
    ctx.rotate(-0.08 + Math.sin(phase * 0.25) * 0.015);

    for (let ring = 0; ring < 7; ring += 1) {
      ctx.beginPath();

      const radius = ringRadius + ring * 7 + Math.sin(ring * 9.1) * 2;

      ctx.arc(
        0,
        0,
        radius,
        ring * 0.04,
        Math.PI * (1.72 + seeded(ring, 5) * 0.2),
      );
      ctx.strokeStyle = `rgba(17, 23, 34, ${0.15 + (6 - ring) * 0.028})`;
      ctx.lineWidth = ring % 3 === 0 ? 3.2 : 1.1;
      ctx.stroke();
    }

    ctx.restore();

    drawWave({
      y: h * 0.52,
      amplitude: (15 + beat * 30) * energy,
      frequency: 0.021,
      phase: phase * 2.3,
      color: '#111722',
      alpha: 0.77,
      width: 1.35,
      modulation: 12 * energy,
    });
    drawWave({
      y: h * 0.52 + 6,
      amplitude: (22 + beat * 24) * energy,
      frequency: 0.016,
      phase: -phase * 1.7,
      color: '#ef4d39',
      alpha: 0.74,
      width: 2.5,
      modulation: 9 * energy,
    });

    ctx.fillStyle = rgba('#ef4d39', 0.74);
    ctx.fillRect(0, h * 0.73, w * progress, 4 + beat * 3);
    ctx.fillStyle = rgba('#2d66db', 0.62);
    ctx.fillRect(w * (1 - progress), h * 0.29, w * progress, 2);
  }

  function drawStage(progress, phase, beat) {
    const w = state.cssWidth;
    const h = state.cssHeight;
    const energy = 0.14 + easeOutCubic(progress) * 0.86;

    fillBackground('#0b0910', '#17101b');

    const stageGlow = ctx.createRadialGradient(
      w / 2,
      h * 0.86,
      0,
      w / 2,
      h * 0.86,
      w * 0.65,
    );

    stageGlow.addColorStop(0, rgba('#ff7a37', 0.38 * energy));
    stageGlow.addColorStop(0.35, rgba('#f73586', 0.17 * energy));
    stageGlow.addColorStop(1, rgba('#0b0910', 0));
    ctx.fillStyle = stageGlow;
    ctx.fillRect(0, 0, w, h);

    const beams = [
      { x: 0.08, angle: 0.18, color: '#ffb14b' },
      { x: 0.28, angle: 0.08, color: '#ff684f' },
      { x: 0.72, angle: -0.08, color: '#6759ff' },
      { x: 0.92, angle: -0.18, color: '#8f74ff' },
    ];

    beams.forEach((beam, index) => {
      const topX = w * beam.x;
      const sway = Math.sin(phase * 0.42 + index * 1.7) * 32 * energy;
      const bottomX = w * 0.5 + beam.angle * w + sway;
      const gradient = ctx.createLinearGradient(topX, 0, bottomX, h);

      gradient.addColorStop(0, rgba(beam.color, 0.42 * energy));
      gradient.addColorStop(0.55, rgba(beam.color, 0.11 * energy));
      gradient.addColorStop(1, rgba(beam.color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(topX - 4, -10);
      ctx.lineTo(topX + 4, -10);
      ctx.lineTo(bottomX + 76, h);
      ctx.lineTo(bottomX - 76, h);
      ctx.closePath();
      ctx.fill();
    });

    for (let index = 0; index < 96; index += 1) {
      const baseX = seeded(index, 60) * w;
      const rise =
        (phase * (18 + seeded(index, 61) * 28) + seeded(index, 62) * h * 1.4) %
        (h * 1.4);
      const x = baseX + Math.sin(phase + index) * 9;
      const y = h * 1.14 - rise;
      const nearCenter = 1 - Math.min(1, Math.abs(x - w / 2) / (w / 2));
      const alpha = energy * (0.08 + nearCenter * 0.45) * (0.5 + beat * 0.5);
      const radius = 0.5 + seeded(index, 64) * 2.1;

      ctx.fillStyle = rgba(
        index % 3 === 0 ? '#ffd279' : index % 3 === 1 ? '#ff6a52' : '#8d80ff',
        alpha,
      );
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    drawGlow(
      w / 2,
      h * 0.58,
      w * 0.24 + beat * 38,
      '#ffbd70',
      0.16 * energy + beat * 0.08,
    );
  }

  function drawOrbit(progress, phase, beat) {
    const w = state.cssWidth;
    const h = state.cssHeight;
    const cx = w / 2;
    const cy = h * 0.52;
    const energy = 0.18 + easeOutCubic(progress) * 0.82;

    fillBackground('#04101a', '#071924');
    drawGlow(cx, cy, Math.min(w, h) * 0.66, '#168ba8', 0.16 * energy);
    drawStars(52, phase * 0.3, energy, ['#56d8f2', '#f73586', '#ffca6a']);

    ctx.save();
    ctx.translate(cx, cy);

    const maxRadius = Math.min(w, h) * 0.43;

    for (let ring = 0; ring < 8; ring += 1) {
      const radius = 27 + ring * (maxRadius / 8);
      const rotation = phase * (ring % 2 ? -0.12 : 0.09) + ring * 0.7;
      const segments = 5 + ring * 2;

      for (let segment = 0; segment < segments; segment += 1) {
        const start = rotation + (segment / segments) * Math.PI * 2;
        const length =
          ((Math.PI * 2) / segments) * (0.36 + seeded(segment, ring) * 0.4);

        ctx.beginPath();
        ctx.arc(
          0,
          0,
          radius + beat * (ring < 3 ? 5 : 1),
          start,
          start + length,
        );

        const colors = ['#56d8f2', '#f73586', '#ffca6a'];

        ctx.strokeStyle = rgba(
          colors[(ring + segment) % colors.length],
          (0.16 + ring * 0.025) * energy,
        );
        ctx.lineWidth = ring % 3 === 0 ? 2 : 0.8;
        ctx.shadowBlur = ring < 3 ? 7 : 0;
        ctx.shadowColor = colors[(ring + segment) % colors.length];
        ctx.stroke();
      }
    }

    for (let band = 0; band < 42; band += 1) {
      const angle = (band / 42) * Math.PI * 2 - Math.PI / 2;
      const magnitude =
        7 +
        (Math.sin(band * 1.91 + phase * 2.2) * 0.5 + 0.5) * 24 * energy +
        beat * 14;
      const radius = maxRadius + 9;

      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      ctx.lineTo(
        Math.cos(angle) * (radius + magnitude),
        Math.sin(angle) * (radius + magnitude),
      );
      ctx.strokeStyle = rgba(
        band % 3 === 0 ? '#ffca6a' : band % 2 ? '#56d8f2' : '#f73586',
        0.3 + energy * 0.26,
      );
      ctx.lineWidth = band % 4 === 0 ? 2.2 : 1;
      ctx.stroke();
    }

    for (let node = 0; node < 9; node += 1) {
      const ringRadius = 46 + node * 13;
      const angle = phase * (node % 2 ? -0.42 : 0.34) + node * 1.9;
      const x = Math.cos(angle) * ringRadius;
      const y = Math.sin(angle) * ringRadius;

      ctx.fillStyle =
        node % 3 === 0 ? '#ffca6a' : node % 2 ? '#f73586' : '#56d8f2';
      ctx.beginPath();
      ctx.arc(x, y, 1.8 + (node % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    drawGlow(cx, cy, 42 + beat * 22, '#ffffff', 0.15 + beat * 0.16);
  }

  function drawMissOverlay(now) {
    if (!state.miss) {
      return;
    }

    const w = state.cssWidth;
    const h = state.cssHeight;
    const elapsed = clamp((now - state.missStartedAt) / 900);

    ctx.save();
    ctx.fillStyle = `rgba(5, 8, 12, ${0.18 + elapsed * 0.48})`;
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = rgba('#ff684f', 0.52 * (1 - elapsed * 0.36));
    ctx.lineWidth = 1.2;

    for (let crack = 0; crack < 14; crack += 1) {
      const angle = (crack / 14) * Math.PI * 2 + seeded(crack, 90) * 0.22;
      const inner = 34 + elapsed * 22;
      const outer = 90 + elapsed * (90 + seeded(crack, 91) * 90);

      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(
        Math.cos(angle + 0.07) * mix(inner, outer, 0.5),
        Math.sin(angle + 0.07) * mix(inner, outer, 0.5),
      );
      ctx.lineTo(
        Math.cos(angle - 0.03) * outer,
        Math.sin(angle - 0.03) * outer,
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  function render(now) {
    resizeCanvas();

    const progress = timelineProgress(now);
    const phase = ambientPhase(now);
    const beat = beatEnergy(now, progress);

    ctx.clearRect(0, 0, state.cssWidth, state.cssHeight);

    switch (currentDirection().id) {
      case 'resonance':
        drawResonance(progress, phase, beat);

        break;

      case 'chrome':
        drawChrome(progress, phase, beat);

        break;

      case 'print':
        drawPrint(progress, phase, beat);

        break;

      case 'stage':
        drawStage(progress, phase, beat);

        break;

      case 'orbit':
        drawOrbit(progress, phase, beat);

        break;

      default:
        drawAurora(progress, phase, beat);
    }

    drawMissOverlay(now);
    requestAnimationFrame(render);
  }

  function killTimeline() {
    if (state.timeline) {
      state.timeline.kill();
      state.timeline = null;
    }
  }

  function setStaticPeak() {
    killTimeline();
    stageCount.textContent = '100';
    compactCount.textContent = '100';

    if (window.gsap) {
      window.gsap.set(frameCopy, { autoAlpha: 1, scale: 1, x: 0, y: 0 });
      window.gsap.set(
        ['.stage-kicker', stageCount, '.stage-proof', '.stage-timing'],
        {
          autoAlpha: 1,
          clearProps: 'transform',
        },
      );
      window.gsap.set(missCopy, { autoAlpha: 0, scale: 1 });
      window.gsap.set(compactChip, { autoAlpha: 1, x: 0, y: 0, scale: 1 });
      window.gsap.set(timelineMarker, { left: 'calc(100% - 5px)' });
    }
  }

  function replay() {
    state.captureProgress = null;
    state.miss = false;
    state.startedAt = performance.now();
    app.dataset.miss = 'false';
    missButton.setAttribute('aria-pressed', 'false');

    if (state.reduced || !window.gsap) {
      setStaticPeak();

      return;
    }

    killTimeline();

    const counter = { value: 96 };
    const gsap = window.gsap;
    const duration = currentDirection().duration;
    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

    state.timeline = timeline;

    timeline
      .set(frameCopy, { autoAlpha: 1, scale: 1, x: 0, y: 0 })
      .set(missCopy, { autoAlpha: 0, scale: 1 })
      .set(compactChip, { autoAlpha: 0, y: -12, scale: 0.92 })
      .set(timelineMarker, { left: '3px' })
      .set(stageCount, {
        scale: 0.72,
        rotationX: -22,
        transformOrigin: '50% 60%',
      })
      .fromTo(
        '.stage-kicker',
        { autoAlpha: 0, y: 9, letterSpacing: '0.42em' },
        { autoAlpha: 1, y: 0, letterSpacing: '0.24em', duration: 0.42 },
        0.12,
      )
      .to(
        counter,
        {
          value: 100,
          duration: 0.58,
          ease: 'power2.inOut',
          onUpdate: () => {
            const value = Math.round(counter.value);

            stageCount.textContent = String(value);
            compactCount.textContent = String(value);
          },
        },
        0.08,
      )
      .to(
        stageCount,
        { scale: 1.08, rotationX: 0, duration: 0.48, ease: 'back.out(1.8)' },
        0.08,
      )
      .to(stageCount, { scale: 1, duration: 0.27, ease: 'power2.inOut' }, 0.56)
      .fromTo(
        '.stage-proof',
        { autoAlpha: 0, y: 13, scaleX: 0.88 },
        { autoAlpha: 1, y: 0, scaleX: 1, duration: 0.46 },
        0.34,
      )
      .fromTo(
        '.stage-timing',
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.42 },
        0.48,
      )
      .to(
        compactChip,
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.45 },
        Math.max(0.7, duration - 0.7),
      )
      .to(
        timelineMarker,
        { left: 'calc(100% - 5px)', duration, ease: 'none' },
        0,
      )
      .to(
        frameCopy,
        { scale: 0.985, duration: 0.4, ease: 'sine.inOut' },
        duration - 0.38,
      );
  }

  function triggerMiss() {
    state.captureProgress = null;

    if (state.miss) {
      replay();

      return;
    }

    state.miss = true;
    state.missStartedAt = performance.now();
    app.dataset.miss = 'true';
    missButton.setAttribute('aria-pressed', 'true');
    killTimeline();

    if (!window.gsap || state.reduced) {
      frameCopy.style.visibility = 'hidden';
      missCopy.style.visibility = 'visible';
      missCopy.style.opacity = '1';
      compactCount.textContent = '0';

      return;
    }

    const gsap = window.gsap;
    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

    state.timeline = timeline;
    timeline
      .to(
        frameCopy,
        { autoAlpha: 0, scale: 0.84, x: -8, duration: 0.34, ease: 'power3.in' },
        0,
      )
      .to(
        compactChip,
        { x: 6, duration: 0.07, repeat: 3, yoyo: true, ease: 'none' },
        0,
      )
      .to(compactChip, { autoAlpha: 0.32, scale: 0.92, duration: 0.27 }, 0.23)
      .call(
        () => {
          compactCount.textContent = '0';
        },
        [],
        0.28,
      )
      .fromTo(
        missCopy,
        { autoAlpha: 0, scale: 1.08 },
        { autoAlpha: 1, scale: 1, duration: 0.52 },
        0.25,
      )
      .to(timelineMarker, { left: '3px', duration: 0.42 }, 0.1);
  }

  function setReduced(value) {
    state.reduced = Boolean(value);
    app.dataset.reduced = String(state.reduced);
    motionButton.setAttribute('aria-pressed', String(state.reduced));

    if (state.reduced) {
      state.miss = false;
      app.dataset.miss = 'false';
      setStaticPeak();
    } else {
      replay();
    }
  }

  function stopTour() {
    state.tour = false;
    window.clearInterval(state.tourTimer);
    state.tourTimer = 0;
    tourButton.setAttribute('aria-pressed', 'false');
    previewAll.classList.remove('is-active');
  }

  function startTour() {
    if (state.tour) {
      stopTour();

      return;
    }

    state.tour = true;
    tourButton.setAttribute('aria-pressed', 'true');
    previewAll.classList.add('is-active');
    state.tourTimer = window.setInterval(() => {
      selectDirection((state.direction + 1) % DIRECTIONS.length, {
        keepTour: true,
      });
    }, 5000);
  }

  function selectDirection(index, options = {}) {
    state.direction = (index + DIRECTIONS.length) % DIRECTIONS.length;
    state.captureProgress = null;

    const direction = currentDirection();

    app.dataset.direction = direction.id;
    app.style.setProperty('--frame-accent', direction.accent);
    app.style.setProperty('--frame-accent-2', direction.accent2);
    app.style.setProperty('--frame-highlight', direction.highlight);
    timelineName.textContent = direction.name;
    document.querySelector(
      '.timeline-heading b',
    ).textContent = `${direction.duration.toFixed(2).replace(/0$/, '')} s`;
    directionButtons.forEach((button, buttonIndex) => {
      const selected = buttonIndex === state.direction;

      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    if (!options.keepTour && state.tour) {
      stopTour();
    }

    replay();
  }

  directionButtons.forEach((button, index) => {
    button.addEventListener('click', () => selectDirection(index));
  });
  replayButton.addEventListener('click', replay);
  missButton.addEventListener('click', triggerMiss);
  motionButton.addEventListener('click', () => setReduced(!state.reduced));
  tourButton.addEventListener('click', startTour);
  previewAll.addEventListener('click', startTour);
  frame.addEventListener('click', replay);
  frame.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      replay();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLButtonElement) {
      return;
    }

    if (/^[1-6]$/.test(event.key)) {
      selectDirection(Number(event.key) - 1);
    } else if (event.code === 'Space') {
      event.preventDefault();
      replay();
    } else if (event.key.toLowerCase() === 'm') {
      triggerMiss();
    } else if (event.key.toLowerCase() === 'r') {
      setReduced(!state.reduced);
    } else if (event.key.toLowerCase() === 'a') {
      startTour();
    }
  });

  mediaQuery.addEventListener?.('change', (event) => setReduced(event.matches));
  window.addEventListener('resize', resizeCanvas);

  window.__streakGallery = {
    directions: DIRECTIONS.map(({ id, name }) => ({ id, name })),
    replay,
    miss: triggerMiss,
    select: (idOrIndex) => {
      const index =
        typeof idOrIndex === 'number'
          ? idOrIndex
          : DIRECTIONS.findIndex((direction) => direction.id === idOrIndex);

      selectDirection(index < 0 ? 0 : index);
    },
    setReduced,
    capture: (idOrIndex, progress = 0.72, phase = 4.3) => {
      const index =
        typeof idOrIndex === 'number'
          ? idOrIndex
          : DIRECTIONS.findIndex((direction) => direction.id === idOrIndex);

      selectDirection(index < 0 ? 0 : index);
      state.captureProgress = clamp(progress);
      state.capturePhase = phase;
      state.miss = false;
      app.dataset.miss = 'false';
      setStaticPeak();
    },
    releaseCapture: () => {
      state.captureProgress = null;
      replay();
    },
  };

  app.dataset.reduced = String(state.reduced);
  motionButton.setAttribute('aria-pressed', String(state.reduced));
  resizeCanvas();
  requestAnimationFrame(render);
  window.setTimeout(replay, 60);
})();
