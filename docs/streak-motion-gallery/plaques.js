(() => {
  'use strict';

  const app = document.querySelector('#vfxApp');
  const vfx = document.querySelector('#streakVfx');
  const canvas = document.querySelector('#vfxCanvas');
  const copy = document.querySelector('#vfxCopy');
  const countNode = document.querySelector('#vfxCount');
  const labelNode = document.querySelector('#vfxLabel');
  const metaNode = document.querySelector('#vfxMeta');
  const proofNode = document.querySelector('#vfxProof');
  const statusNode = document.querySelector('#vfxStatus');
  const storyName = document.querySelector('#storyName');
  const storyTier = document.querySelector('#storyTier');
  const storyBefore = document.querySelector('#storyBefore');
  const storyPeak = document.querySelector('#storyPeak');
  const storyPeakTime = document.querySelector('#storyPeakTime');
  const storyAfter = document.querySelector('#storyAfter');
  const storyDuration = document.querySelector('#storyDuration');
  const attentionLabel = document.querySelector('#attentionLabel');
  const layerStack = document.querySelector('#layerStack');
  const flare = vfx.querySelector('.dom-flare');
  const ring = vfx.querySelector('.dom-ring');
  const slash = vfx.querySelector('.dom-slash');
  const options = [...document.querySelectorAll('.vfx-option')];
  const replayButton = document.querySelector('#replayButton');
  const hitButton = document.querySelector('#hitButton');
  const missButton = document.querySelector('#missButton');
  const motionButton = document.querySelector('#motionButton');
  const gsap = window.gsap;
  const effectPalettes = {
    ember: ['#ff6c3c', '#ffbd47', '#e93059'],
    smoke: ['#3abfe8', '#77e6ff', '#795ee6'],
    arc: ['#24bde9', '#bcf7ff', '#356eea'],
    rune: ['#dc901f', '#ffd76b', '#31bcd2'],
    solar: ['#df8d12', '#ffe69a', '#f2543b'],
    prism: ['#ec3389', '#5eeaff', '#7055e8'],
  };
  const variants = {
    warmup: {
      name: 'Warm-Up',
      tierLabel: 'Tier 1 · Foundation',
      threshold: 8,
      duration: 0.28,
      peakScale: 1.025,
      peakEnergy: 0.24,
      layers: [{ effect: 'solar', gain: 0.14 }],
      dom: { flare: 0.2 },
      chips: ['TYPE', 'GLOW'],
    },
    groove: {
      name: 'Groove Machine',
      tierLabel: 'Tier 2 · Flow',
      threshold: 32,
      duration: 0.45,
      peakScale: 1.055,
      peakEnergy: 0.42,
      layers: [
        { effect: 'smoke', gain: 0.42 },
        { effect: 'solar', gain: 0.12 },
      ],
      dom: { flare: 0.28 },
      chips: ['TYPE', 'GLOW', 'TRAIL'],
    },
    wizard: {
      name: 'Fill Wizard',
      tierLabel: 'Tier 3 · Charged',
      threshold: 75,
      duration: 0.62,
      peakScale: 1.09,
      peakEnergy: 0.62,
      layers: [
        { effect: 'arc', gain: 0.68 },
        { effect: 'smoke', gain: 0.22 },
        { effect: 'solar', gain: 0.08 },
      ],
      dom: {},
      chips: ['TYPE', 'GLOW', 'TRAIL', 'ARC'],
    },
    drumroll: {
      name: 'DRUMROLL!',
      tierLabel: 'Tier 4 · On Fire',
      threshold: 100,
      duration: 0.78,
      peakScale: 1.13,
      peakEnergy: 0.78,
      layers: [
        { effect: 'ember', gain: 0.72 },
        { effect: 'solar', gain: 0.26 },
        { effect: 'smoke', gain: 0.1 },
        { effect: 'arc', gain: 0.06 },
      ],
      dom: { flare: 0.68 },
      chips: ['TYPE', 'GLOW', 'FLAME', 'SPARKS', 'FLARE'],
    },
    deity: {
      name: 'Rhythm Deity',
      tierLabel: 'Tier 5 · Mythic',
      threshold: 200,
      duration: 0.95,
      peakScale: 1.16,
      peakEnergy: 0.9,
      layers: [
        { effect: 'rune', gain: 0.72 },
        { effect: 'arc', gain: 0.32 },
        { effect: 'smoke', gain: 0.18 },
        { effect: 'solar', gain: 0.12 },
        { effect: 'ember', gain: 0.08 },
      ],
      dom: { ring: 0.76 },
      chips: ['TYPE', 'GLOW', 'RUNE', 'ARC', 'SMOKE', 'DUST'],
    },
    legendary: {
      name: 'Buzz Roll Berserker',
      tierLabel: 'Tier 6 · Legendary',
      threshold: 500,
      duration: 1.18,
      peakScale: 1.2,
      peakEnergy: 1,
      layers: [
        { effect: 'prism', gain: 0.85 },
        { effect: 'ember', gain: 0.4 },
        { effect: 'rune', gain: 0.5 },
        { effect: 'arc', gain: 0.25 },
        { effect: 'solar', gain: 0.2 },
        { effect: 'smoke', gain: 0.15 },
      ],
      dom: { flare: 0.72, ring: 0.82, slash: 0.9 },
      chips: ['TYPE', 'GLOW', 'PRISM', 'FLAME', 'RUNE', 'ARC', 'SHARDS'],
    },
  };
  const state = {
    variant: 'warmup',
    count: 8,
    best: 46,
    label: 'WARM-UP',
    meta: 'STREAK',
    miss: false,
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    energy: 0,
    phase: 0,
    timeline: null,
  };
  let context;
  let width = 0;
  let height = 0;
  let ratio = 1;

  function announce(message) {
    statusNode.textContent = '';
    window.requestAnimationFrame(() => {
      statusNode.textContent = message;
    });
  }

  function updateCopy() {
    countNode.textContent = String(state.count);
    labelNode.textContent = state.label;
    metaNode.textContent = state.meta;
    vfx.setAttribute(
      'aria-label',
      state.miss
        ? `Streak ended. Best ${state.best}. Activate to replay.`
        : `${
            state.count
          } hit streak, ${state.label.toLowerCase()}. Activate to replay.`,
    );
  }

  function syncControls() {
    const config = variants[state.variant];
    const tierIndex = Object.keys(variants).indexOf(state.variant);

    app.dataset.vfx = state.variant;
    app.dataset.intensity = String(tierIndex + 1);
    app.dataset.miss = String(state.miss);
    app.dataset.reduced = String(state.reduced);
    missButton.setAttribute('aria-pressed', String(state.miss));
    motionButton.setAttribute('aria-pressed', String(state.reduced));
    storyName.textContent = config.name;
    storyTier.textContent = config.tierLabel;
    storyBefore.textContent = String(config.threshold - 1);
    storyPeak.textContent = String(config.threshold);
    storyPeakTime.textContent = `${Math.round(config.duration * 380)} ms`;
    storyAfter.textContent = String(config.threshold);
    storyDuration.textContent = `${Math.round(config.duration * 1000)} ms`;
    attentionLabel.textContent = `${tierIndex + 1} / ${options.length}`;
    layerStack.replaceChildren(
      ...config.chips.map((chip) => {
        const item = document.createElement('span');

        item.textContent = chip;

        return item;
      }),
    );

    options.forEach((option) => {
      const active = option.dataset.vfx === state.variant;

      option.classList.toggle('is-active', active);
      option.setAttribute('aria-pressed', String(active));
    });
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();

    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const value = Number.parseInt(clean, 16);

    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function random(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;

    return value - Math.floor(value);
  }

  function glow(x, y, radius, color, alpha, stretch = 1) {
    context.save();
    context.translate(x, y);
    context.scale(stretch, 1);

    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);

    gradient.addColorStop(0, rgba(color, alpha));
    gradient.addColorStop(0.42, rgba(color, alpha * 0.42));
    gradient.addColorStop(1, rgba(color, 0));
    context.fillStyle = gradient;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  }

  function curve(points, color, alpha, lineWidth, blur = 0) {
    context.save();
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);

    if (points.length === 4) {
      context.bezierCurveTo(
        points[1][0],
        points[1][1],
        points[2][0],
        points[2][1],
        points[3][0],
        points[3][1],
      );
    } else {
      points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
    }

    context.strokeStyle = rgba(color, alpha);
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = rgba(color, alpha * 0.86);
    context.shadowBlur = blur;
    context.stroke();
    context.restore();
  }

  function drawParticles(
    centerX,
    centerY,
    spreadX,
    spreadY,
    color,
    count,
    energy,
    phase,
  ) {
    for (let index = 0; index < count; index += 1) {
      const seed = index + phase * 0.13;
      const direction = random(seed * 3.1) > 0.5 ? 1 : -1;
      const travel = 0.35 + phase * 0.72;
      const x =
        centerX +
        direction * random(seed * 7.2) * spreadX * travel +
        (random(seed * 9.4) - 0.5) * 14;
      const y =
        centerY +
        (random(seed * 5.8) - 0.6) * spreadY * travel -
        phase * random(seed * 4.2) * 12;
      const size = 0.55 + random(seed * 2.6) * 1.55;

      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fillStyle = rgba(color, energy * (0.18 + random(seed) * 0.52));
      context.fill();
    }
  }

  function drawEmber(energy, phase, colors) {
    const [coral, gold, magenta] = colors;
    const cx = width * 0.43;
    const cy = height * 0.56;

    glow(cx, cy, 64 + energy * 29, coral, energy * 0.34, 2.55);
    glow(cx - 48, cy + 8, 44 + energy * 20, gold, energy * 0.36, 1.65);
    glow(cx + 77, cy - 5, 51 + energy * 20, magenta, energy * 0.2, 1.9);

    for (let index = 0; index < 11; index += 1) {
      const seed = index + 151;
      const baseX = cx - 125 + random(seed * 2.1) * 250;
      const baseY = cy + 31 + random(seed * 7.3) * 7;
      const halfWidth = 5 + random(seed * 4.4) * 11;
      const heightValue = 25 + random(seed * 6.8) * 58 * energy;
      const drift = (random(seed * 9.1) - 0.5) * 39;
      const gradient = context.createLinearGradient(
        0,
        baseY,
        0,
        baseY - heightValue,
      );

      gradient.addColorStop(0, rgba(gold, energy * 0.2));
      gradient.addColorStop(0.45, rgba(coral, energy * 0.15));
      gradient.addColorStop(1, rgba(magenta, 0));
      context.save();
      context.beginPath();
      context.moveTo(baseX - halfWidth, baseY);
      context.bezierCurveTo(
        baseX - halfWidth * 1.2,
        baseY - heightValue * 0.35,
        baseX + drift - halfWidth * 0.35,
        baseY - heightValue * 0.72,
        baseX + drift,
        baseY - heightValue,
      );
      context.bezierCurveTo(
        baseX + drift + halfWidth * 0.55,
        baseY - heightValue * 0.66,
        baseX + halfWidth * 1.25,
        baseY - heightValue * 0.28,
        baseX + halfWidth,
        baseY,
      );
      context.closePath();
      context.fillStyle = gradient;
      context.shadowColor = rgba(coral, energy * 0.32);
      context.shadowBlur = 12;
      context.fill();
      context.restore();
    }

    for (let index = 0; index < 7; index += 1) {
      const seed = index + 101;
      const y = cy - 29 + random(seed * 1.8) * 57;
      const curl = (random(seed * 4.6) - 0.5) * 55;

      curve(
        [
          [cx - 182, y + curl * 0.15],
          [cx - 68, y - 23 - curl],
          [cx + 55, y + 17 + curl],
          [cx + 178, y - curl * 0.2],
        ],
        index % 3 === 0 ? gold : index % 3 === 1 ? coral : magenta,
        energy * (0.038 + random(seed * 2.4) * 0.055),
        6 + random(seed * 7.2) * 10,
        14,
      );
    }

    for (let index = 0; index < 13; index += 1) {
      const seed = index + 4;
      const startX = cx - 112 + random(seed * 2.3) * 218;
      const startY = cy + 22 + random(seed * 1.7) * 12;
      const lean = (random(seed * 3.9) - 0.5) * 62;
      const lift = 26 + random(seed * 4.7) * 55 * energy;

      curve(
        [
          [startX, startY],
          [startX + lean * 0.22, startY - lift * 0.24],
          [startX - lean * 0.16, startY - lift * 0.72],
          [startX + lean, startY - lift],
        ],
        index % 3 === 0 ? gold : index % 3 === 1 ? coral : magenta,
        energy * (0.12 + random(seed) * 0.3),
        2 + random(seed * 7.2) * 6,
        5 + energy * 7,
      );
    }

    for (let index = 0; index < 8; index += 1) {
      const seed = index + 27;
      const x = cx - 120 + random(seed) * 240;
      const y = cy + 15 - random(seed * 2.2) * 48;

      curve(
        [
          [x, y],
          [x + 8, y - 12],
          [x - 11, y - 23],
          [x + (random(seed * 5.2) - 0.5) * 18, y - 34 - phase * 8],
        ],
        gold,
        energy * 0.42,
        0.9,
        7,
      );
    }

    drawParticles(cx, cy, 172, 72, gold, 34, energy, phase);
    drawParticles(cx, cy, 205, 58, coral, 22, energy * 0.76, phase);
  }

  function drawSmoke(energy, phase, colors) {
    const [cyan, ice, violet] = colors;
    const cx = width * 0.5;
    const cy = height * 0.51;

    glow(cx - 40, cy, 58 + energy * 23, cyan, energy * 0.12, 2.9);
    glow(cx + 72, cy - 4, 64 + energy * 22, violet, energy * 0.13, 2.4);

    for (let index = 0; index < 15; index += 1) {
      const seed = index + 19;
      const y = cy - 34 + random(seed * 1.9) * 71;
      const swing = (random(seed * 3.2) - 0.5) * 46;
      const color = index % 3 === 0 ? ice : index % 3 === 1 ? cyan : violet;

      curve(
        [
          [cx - 210, y + swing * 0.22],
          [cx - 75, y - 25 - swing],
          [cx + 65, y + 26 + swing],
          [cx + 210, y - swing * 0.18],
        ],
        color,
        energy * (0.025 + random(seed * 4.5) * 0.09),
        8 + random(seed * 6.1) * 18,
        13,
      );
    }

    for (let index = 0; index < 4; index += 1) {
      const offset = (index - 1.5) * 12;

      curve(
        [
          [cx - 196, cy + offset],
          [cx - 63, cy - 17 - offset],
          [cx + 64, cy + 16 + offset * 0.3],
          [cx + 194, cy - offset * 0.55],
        ],
        index % 2 ? violet : cyan,
        energy * 0.24,
        0.8,
        7,
      );
    }

    drawParticles(cx, cy, 205, 50, ice, 24, energy * 0.68, phase);
  }

  function lightningPath(
    startX,
    endX,
    centerY,
    seed,
    displacement,
    energy,
    color,
    widthValue,
  ) {
    const points = [];
    const segments = 18;

    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const taper = Math.sin(t * Math.PI);

      points.push([
        startX + (endX - startX) * t,
        centerY + (random(seed + index * 1.73) - 0.5) * displacement * taper,
      ]);
    }

    curve(points, color, energy * 0.72, widthValue, 9);
    curve(
      points,
      '#ffffff',
      energy * 0.78,
      Math.max(0.55, widthValue * 0.28),
      2,
    );

    return points;
  }

  function drawArc(energy, phase, colors) {
    const [cyan, ice, blue] = colors;
    const cx = width * 0.5;
    const cy = height * 0.53;

    glow(cx, cy, 47 + energy * 22, cyan, energy * 0.16, 3.6);

    const main = lightningPath(
      cx - 218,
      cx + 219,
      cy,
      32,
      31 + energy * 17,
      energy,
      cyan,
      2.1,
    );

    [3, 6, 10, 14, 16].forEach((pointIndex, branchIndex) => {
      const [x, y] = main[pointIndex];
      const direction = branchIndex % 2 ? 1 : -1;

      lightningPath(
        x,
        x + 28 + branchIndex * 4,
        y,
        83 + branchIndex * 9,
        22 * direction,
        energy * 0.62,
        branchIndex % 2 ? blue : ice,
        1.1,
      );
    });
    drawParticles(cx, cy, 224, 67, ice, 42, energy, phase);
  }

  function drawRune(energy, phase, colors) {
    const [amberColor, gold, cyan] = colors;
    const cx = width * 0.39;
    const cy = height * 0.52;
    const rotation = phase * 0.55;

    glow(cx, cy, 58 + energy * 15, amberColor, energy * 0.13, 1.25);
    context.save();
    context.translate(cx, cy);
    context.rotate(rotation);
    [38, 51, 65].forEach((radiusValue, index) => {
      const start = -1.2 + index * 0.7;
      const end = start + 2.1 + index * 0.18;

      context.beginPath();
      context.arc(0, 0, radiusValue * (0.8 + energy * 0.2), start, end);
      context.strokeStyle = rgba(
        index === 1 ? cyan : gold,
        energy * (0.24 + index * 0.07),
      );
      context.lineWidth = index === 1 ? 1 : 1.4;
      context.shadowColor = rgba(
        index === 1 ? cyan : amberColor,
        energy * 0.55,
      );
      context.shadowBlur = 7;
      context.stroke();
    });

    for (let index = 0; index < 18; index += 1) {
      if (index % 5 === 0) {
        continue;
      }

      const angle = (index / 18) * Math.PI * 2;
      const inner = 54;
      const outer = inner + (index % 3 === 0 ? 9 : 5) * energy;

      context.beginPath();
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      context.strokeStyle = rgba(index % 4 === 0 ? cyan : gold, energy * 0.36);
      context.lineWidth = 0.8;
      context.stroke();
    }

    context.restore();
    drawParticles(cx, cy, 98, 86, gold, 26, energy * 0.85, phase);
    drawParticles(cx, cy, 124, 75, cyan, 13, energy * 0.6, phase);
  }

  function drawSolar(energy, phase, colors) {
    const [amberColor, gold, coral] = colors;
    const cx = width * 0.4;
    const cy = height * 0.52;

    glow(cx, cy, 55 + energy * 34, gold, energy * 0.36, 1.3);
    glow(cx, cy, 42 + energy * 22, amberColor, energy * 0.18, 3.8);

    const horizontal = context.createLinearGradient(cx - 235, 0, cx + 235, 0);

    horizontal.addColorStop(0, rgba(amberColor, 0));
    horizontal.addColorStop(0.4, rgba(amberColor, energy * 0.32));
    horizontal.addColorStop(0.5, rgba('#ffffff', energy * 0.92));
    horizontal.addColorStop(0.6, rgba(coral, energy * 0.3));
    horizontal.addColorStop(1, rgba(coral, 0));
    context.fillStyle = horizontal;
    context.fillRect(cx - 235, cy - 1, 470, 2);

    for (let index = 0; index < 28; index += 1) {
      const angle = random(index * 2.4) * Math.PI * 2;
      const length = 18 + random(index * 4.9) * 78 * energy;
      const inner = 8 + random(index * 8.1) * 17;

      context.beginPath();
      context.moveTo(
        cx + Math.cos(angle) * inner,
        cy + Math.sin(angle) * inner,
      );
      context.lineTo(
        cx + Math.cos(angle) * (inner + length),
        cy + Math.sin(angle) * (inner + length),
      );
      context.strokeStyle = rgba(index % 4 === 0 ? coral : gold, energy * 0.25);
      context.lineWidth = index % 5 === 0 ? 1.4 : 0.65;
      context.stroke();
    }

    drawParticles(cx, cy, 152, 78, gold, 38, energy, phase);
  }

  function drawPrism(energy, phase, colors) {
    const [magenta, cyan, violet] = colors;
    const cx = width * 0.48;
    const cy = height * 0.53;

    glow(cx, cy, 62 + energy * 25, magenta, energy * 0.14, 3.2);
    glow(cx + 40, cy - 5, 54 + energy * 24, cyan, energy * 0.12, 2.8);
    context.save();
    context.translate(cx, cy);
    context.rotate(-0.22);

    for (let index = 0; index < 15; index += 1) {
      const seed = index + 41;
      const y = -52 + random(seed * 2.8) * 104;
      const start = -190 + random(seed * 3.7) * 64;
      const length = 140 + random(seed * 5.4) * 185 * (0.65 + energy * 0.35);
      const thickness = 2 + random(seed * 7.1) * 9;
      const gradient = context.createLinearGradient(
        start,
        0,
        start + length,
        0,
      );
      const color = index % 3 === 0 ? magenta : index % 3 === 1 ? cyan : violet;

      gradient.addColorStop(0, rgba(color, 0));
      gradient.addColorStop(0.28, rgba(color, energy * 0.16));
      gradient.addColorStop(0.75, rgba(color, energy * 0.52));
      gradient.addColorStop(1, rgba(color, 0));
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(start, y);
      context.lineTo(start + length, y - thickness * 0.6);
      context.lineTo(start + length - 22, y + thickness * 0.75);
      context.lineTo(start + 17, y + thickness);
      context.closePath();
      context.fill();
    }

    for (let index = 0; index < 19; index += 1) {
      const seed = index + 76;
      const x = -150 + random(seed * 2.4) * 320;
      const y = -58 + random(seed * 5.6) * 116;
      const size = 2 + random(seed * 4.3) * 8 * energy;

      context.beginPath();
      context.moveTo(x, y - size);
      context.lineTo(x + size * 1.8, y);
      context.lineTo(x, y + size);
      context.lineTo(x - size * 0.6, y);
      context.closePath();
      context.fillStyle = rgba(index % 2 ? cyan : magenta, energy * 0.58);
      context.fill();
    }

    context.restore();
  }

  const drawers = {
    ember: drawEmber,
    smoke: drawSmoke,
    arc: drawArc,
    rune: drawRune,
    solar: drawSolar,
    prism: drawPrism,
  };

  function hasLayer(config, effect) {
    return config.layers.some((layer) => layer.effect === effect);
  }

  function draw() {
    if (!context || !width || !height) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    if (state.energy <= 0.001) {
      return;
    }

    const config = variants[state.variant];
    const energy = state.reduced ? Math.min(state.energy, 0.2) : state.energy;

    config.layers.forEach(({ effect, gain }) => {
      drawers[effect](energy * gain, state.phase, effectPalettes[effect]);
    });
  }

  function killMotion() {
    state.timeline?.kill();
    state.timeline = null;
    gsap.killTweensOf([
      vfx,
      copy,
      labelNode,
      proofNode,
      countNode,
      flare,
      ring,
      slash,
    ]);
  }

  function resetVisuals() {
    killMotion();
    state.energy = 0;
    state.phase = 0;
    gsap.set(vfx, {
      xPercent: -50,
      y: 0,
      scale: 1,
      opacity: 1,
      filter: 'brightness(1)',
    });
    gsap.set(copy, {
      x: 0,
      y: 0,
      scale: 1,
      opacity: state.miss ? 0.54 : 0.82,
      filter: state.miss ? 'saturate(0.28)' : 'saturate(1)',
    });
    gsap.set(countNode, {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    });
    gsap.set(labelNode, {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      filter: 'brightness(1)',
    });
    gsap.set(proofNode, {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    });
    gsap.set([flare, ring, slash], {
      x: 0,
      y: 0,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 0,
    });
    draw();
  }

  function addEnergy(timeline, duration, maximum = 1) {
    const proxy = { value: 0 };

    timeline.to(
      proxy,
      {
        value: 1,
        duration,
        ease: 'none',
        onUpdate: () => {
          state.phase = proxy.value;
          state.energy =
            Math.pow(Math.sin(proxy.value * Math.PI), 0.72) * maximum;
          draw();
        },
      },
      0,
    );
  }

  function addDomEffect(timeline, config) {
    const peak = config.duration * 0.36;
    const settle = config.duration - peak;

    if (config.dom.ring && hasLayer(config, 'rune')) {
      timeline.fromTo(
        ring,
        { rotation: -48, scale: 0.62, opacity: 0 },
        {
          rotation: 12,
          scale: 1.06 + config.peakEnergy * 0.08,
          opacity: config.dom.ring,
          duration: peak,
          ease: 'power3.out',
        },
        0,
      );
      timeline.to(
        ring,
        {
          rotation: 42,
          scale: 1.25,
          opacity: 0,
          duration: settle,
          ease: 'power2.in',
        },
        peak,
      );
    }

    if (config.dom.flare && hasLayer(config, 'solar')) {
      timeline.fromTo(
        flare,
        { scaleX: 0.12, opacity: 0 },
        {
          scaleX: 0.72 + config.peakEnergy * 0.48,
          opacity: config.dom.flare,
          duration: peak,
          ease: 'expo.out',
        },
        0,
      );
      timeline.to(
        flare,
        { scaleX: 1.7, opacity: 0, duration: settle, ease: 'power2.in' },
        peak,
      );
    }

    if (config.dom.slash && hasLayer(config, 'prism')) {
      timeline.fromTo(
        slash,
        { rotation: -12, scaleX: 0.12, x: -55, opacity: 0 },
        {
          rotation: -12,
          scaleX: 1.12,
          x: 0,
          opacity: config.dom.slash,
          duration: peak,
          ease: 'expo.out',
        },
        0,
      );
      timeline.to(
        slash,
        {
          x: 38,
          scaleX: 1.35,
          opacity: 0,
          duration: settle,
          ease: 'power2.in',
        },
        peak,
      );
    }
  }

  function replay({ announceChange = true } = {}) {
    const config = variants[state.variant];
    const threshold = config.threshold;

    killMotion();
    state.miss = false;
    state.count = threshold - 1;
    state.label = config.name.toUpperCase();
    state.meta = 'STREAK';
    syncControls();
    updateCopy();
    resetVisuals();

    if (state.reduced) {
      const timeline = gsap.timeline({
        onComplete: () => {
          gsap.set([labelNode, proofNode], { y: 0, opacity: 1 });
          gsap.set(copy, { opacity: 0.82 });
        },
      });

      state.timeline = timeline;
      timeline.fromTo(
        labelNode,
        { y: 2, opacity: 0.28 },
        { y: 0, opacity: 1, duration: 0.1, ease: 'power1.out' },
        0,
      );
      timeline.call(
        () => {
          state.count = threshold;
          state.best = Math.max(state.best, threshold);
          updateCopy();

          if (announceChange) {
            announce(`${threshold} hit streak, ${config.name}.`);
          }
        },
        undefined,
        0.075,
      );
      timeline.fromTo(
        proofNode,
        { y: 2, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.1, ease: 'power1.out' },
        0.075,
      );

      return;
    }

    const peak = config.duration * 0.38;
    const settle = config.duration - peak;
    const countDelay = 0.055 + config.peakEnergy * 0.105;
    const titleRise = Math.min(peak, countDelay + 0.045);
    const proofRise = Math.min(0.16, Math.max(0.09, peak * 0.68));
    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        state.energy = 0;
        state.phase = 0;
        gsap.set(copy, {
          scale: 1,
          opacity: 0.82,
          filter: 'brightness(1)',
        });
        gsap.set(labelNode, {
          y: 0,
          scale: 1,
          opacity: 1,
          filter: 'brightness(1)',
        });
        gsap.set(proofNode, { y: 0, scale: 1, opacity: 1 });
        gsap.set(vfx, { xPercent: -50, x: 0 });
        draw();
      },
    });

    state.timeline = timeline;

    timeline.call(
      () => {
        state.count = threshold;
        state.best = Math.max(state.best, threshold);
        updateCopy();

        if (announceChange) {
          announce(`${threshold} hit streak, ${config.name}.`);
        }
      },
      undefined,
      countDelay,
    );
    timeline.set(
      copy,
      { x: 0, y: 0, scale: 1, opacity: 1, filter: 'brightness(1)' },
      0,
    );
    timeline.fromTo(
      labelNode,
      {
        y: 3 + config.peakEnergy * 3,
        scale: 0.94 - config.peakEnergy * 0.06,
        opacity: 0,
        filter: 'brightness(0.9)',
      },
      {
        y: 0,
        scale: config.peakScale,
        opacity: 1,
        filter: `brightness(${1.04 + config.peakEnergy * 0.14})`,
        duration: titleRise,
        ease: `back.out(${1.35 + config.peakEnergy * 0.85})`,
      },
      0,
    );
    timeline.fromTo(
      proofNode,
      { y: 3, scale: 0.94, opacity: 0 },
      {
        y: 0,
        scale: 1,
        opacity: 0.86,
        duration: proofRise,
        ease: 'expo.out',
      },
      countDelay,
    );
    timeline.fromTo(
      countNode,
      {
        y: 1,
        scale: 0.78,
        rotation: -config.peakEnergy * 1.4,
        opacity: 0,
      },
      {
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        duration: proofRise,
        ease: 'expo.out',
      },
      countDelay,
    );
    timeline.to(
      labelNode,
      {
        scale: 1,
        filter: 'brightness(1)',
        duration: config.duration - titleRise,
        ease: 'power3.out',
      },
      titleRise,
    );
    timeline.to(
      copy,
      { opacity: 0.82, duration: settle, ease: 'power3.out' },
      peak,
    );

    if (config.peakEnergy >= 0.9) {
      timeline.fromTo(
        vfx,
        { xPercent: -50, x: -2 },
        {
          xPercent: -50,
          x: 2,
          duration: 0.055,
          repeat: 3,
          yoyo: true,
          ease: 'none',
        },
        peak * 0.62,
      );
      timeline.to(
        vfx,
        { xPercent: -50, x: 0, duration: 0.06 },
        peak * 0.62 + 0.22,
      );
    }

    addEnergy(timeline, config.duration, config.peakEnergy);
    addDomEffect(timeline, config);
  }

  function hit({ announceChange = true } = {}) {
    const config = variants[state.variant];

    killMotion();

    if (state.miss) {
      state.miss = false;
      state.count = 1;
      state.label = 'BACK IN TIME';
    } else {
      state.count += 1;
      state.label =
        state.count >= config.threshold
          ? config.name.toUpperCase()
          : 'LOCKED IN';
    }

    state.meta = 'STREAK';
    state.best = Math.max(state.best, state.count);
    syncControls();
    updateCopy();
    resetVisuals();

    if (!state.reduced) {
      const duration = 0.16 + config.peakEnergy * 0.22;
      const microEnergy = 0.12 + config.peakEnergy * 0.3;
      const timeline = gsap.timeline({
        onComplete: () => {
          state.energy = 0;
          state.phase = 0;
          draw();
        },
      });

      state.timeline = timeline;
      timeline.fromTo(
        proofNode,
        { scale: 0.96, opacity: 0.68 },
        {
          scale: 1.045,
          opacity: 0.94,
          duration: duration * 0.38,
          ease: 'power2.out',
        },
        0,
      );
      timeline.to(
        proofNode,
        {
          scale: 1,
          opacity: 1,
          duration: duration * 0.62,
          ease: 'power2.out',
        },
        duration * 0.38,
      );
      addEnergy(timeline, duration, microEnergy);
    }

    if (announceChange) {
      announce(`${state.count} hit streak.`);
    }
  }

  function setMiss(
    next = !state.miss,
    { animate = true, announceChange = true } = {},
  ) {
    const config = variants[state.variant];

    killMotion();
    state.miss = Boolean(next);
    state.count = state.miss ? state.best : config.threshold;
    state.label = state.miss ? 'STREAK ENDED' : config.name.toUpperCase();
    state.meta = state.miss ? 'BEST' : 'STREAK';
    syncControls();
    updateCopy();
    resetVisuals();

    if (animate && !state.reduced) {
      const timeline = gsap.timeline();

      state.timeline = timeline;

      if (state.miss) {
        timeline.fromTo(
          copy,
          { y: 0, scale: 1, opacity: 0.82, filter: 'saturate(1)' },
          {
            y: 7,
            scale: 0.96,
            opacity: 0.4,
            filter: 'saturate(0.2)',
            duration: 0.24,
            ease: 'power2.inOut',
          },
        );
        timeline.to(copy, { y: 0, scale: 1, opacity: 0.54, duration: 0.18 });
      } else {
        timeline.fromTo(
          copy,
          { y: 5, scale: 0.97, opacity: 0.35 },
          { y: 0, scale: 1, opacity: 0.82, duration: 0.24, ease: 'power2.out' },
        );
      }
    }

    if (announceChange) {
      announce(
        state.miss
          ? `Streak ended. Best ${state.best} preserved.`
          : 'Streak comparison restored.',
      );
    }
  }

  function setReduced(next, { replayAfter = false } = {}) {
    state.reduced = Boolean(next);
    killMotion();
    syncControls();
    resetVisuals();

    if (replayAfter) {
      replay();
    }

    announce(
      state.reduced ? 'Reduced motion enabled.' : 'Reduced motion disabled.',
    );
  }

  function select(variant, { replayAfter = true, announceChange = true } = {}) {
    if (!variants[variant]) {
      return false;
    }

    killMotion();
    state.variant = variant;

    const config = variants[variant];

    state.count = config.threshold;
    state.label = config.name.toUpperCase();
    state.meta = 'STREAK';
    state.miss = false;
    syncControls();
    updateCopy();
    resetVisuals();
    resizeCanvas();

    if (announceChange) {
      announce(`${config.name} selected.`);
    }

    if (replayAfter) {
      window.setTimeout(() => replay({ announceChange: false }), 70);
    }

    return true;
  }

  function capture(variant = state.variant, phase = 'peak') {
    select(variant, { replayAfter: false, announceChange: false });

    const config = variants[state.variant];

    state.count = phase === 'hit' ? config.threshold + 1 : config.threshold;
    state.label = config.name.toUpperCase();
    state.meta = 'STREAK';
    state.miss = phase === 'miss';

    if (state.miss) {
      state.count = state.best;
      state.label = 'STREAK ENDED';
      state.meta = 'BEST';
    }

    syncControls();
    updateCopy();
    state.energy =
      phase === 'peak'
        ? config.peakEnergy
        : phase === 'hit'
        ? 0.12 + config.peakEnergy * 0.3
        : 0;
    state.phase = phase === 'peak' ? 0.43 : phase === 'hit' ? 0.34 : 0;
    gsap.set(copy, {
      x: 0,
      y: 0,
      scale: 1,
      opacity: state.miss ? 0.54 : phase === 'peak' ? 1 : 0.82,
      filter: state.miss ? 'saturate(0.25)' : 'brightness(1.1)',
    });
    gsap.set(labelNode, {
      x: 0,
      y: 0,
      scale: phase === 'peak' ? config.peakScale : 1,
      opacity: 1,
      filter: phase === 'peak' ? 'brightness(1.12)' : 'brightness(1)',
    });
    gsap.set(proofNode, { x: 0, y: 0, scale: 1, opacity: 0.86 });
    gsap.set(countNode, { x: 0, y: 0, scale: 1, opacity: 1 });

    if (config.dom.ring && phase === 'peak') {
      gsap.set(ring, {
        rotation: 9,
        scale: 1.06 + config.peakEnergy * 0.08,
        opacity: config.dom.ring,
      });
    }

    if (config.dom.flare && phase === 'peak') {
      gsap.set(flare, {
        scaleX: 0.72 + config.peakEnergy * 0.48,
        opacity: config.dom.flare,
      });
    }

    if (config.dom.slash && phase === 'peak') {
      gsap.set(slash, {
        rotation: -12,
        scaleX: 1.08,
        opacity: config.dom.slash,
      });
    }

    draw();

    return {
      variant: state.variant,
      phase,
      count: state.count,
      reduced: state.reduced,
      threshold: config.threshold,
      duration: config.duration,
      peakScale: config.peakScale,
      peakEnergy: config.peakEnergy,
      layerCount: config.layers.length,
      chips: [...config.chips],
    };
  }

  options.forEach((option) => {
    option.addEventListener('click', () => select(option.dataset.vfx));
  });
  replayButton.addEventListener('click', () => replay());
  hitButton.addEventListener('click', () => hit());
  missButton.addEventListener('click', () => setMiss());
  motionButton.addEventListener('click', () => setReduced(!state.reduced));
  vfx.addEventListener('click', () => replay());
  vfx.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      replay();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const number = Number.parseInt(event.key, 10);

    if (number >= 1 && number <= options.length) {
      event.preventDefault();
      select(options[number - 1].dataset.vfx);

      return;
    }

    if (event.target.closest('button, [role="button"]')) {
      return;
    }

    if (event.key.toLowerCase() === 'h') {
      hit();
    }

    if (event.key.toLowerCase() === 'm') {
      setMiss();
    }

    if (event.key.toLowerCase() === 'r') {
      setReduced(!state.reduced);
    }

    if (event.key === ' ') {
      event.preventDefault();
      replay();
    }
  });

  const resizeObserver = new ResizeObserver(resizeCanvas);

  resizeObserver.observe(canvas);

  const galleryApi = {
    capture,
    hit,
    miss: setMiss,
    replay,
    select,
    setReduced,
    getState: () => ({ ...state, timeline: undefined }),
  };

  window.__vfxGallery = galleryApi;
  window.__plaqueGallery = galleryApi;

  syncControls();
  updateCopy();
  resizeCanvas();
  resetVisuals();
  window.setTimeout(() => replay({ announceChange: false }), 260);
})();
