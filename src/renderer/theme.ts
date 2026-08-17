export const channels = (color: string) => {
  const value = color.replace('#', '');

  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ] as const;
};

export const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((n) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

export const mixToward = (color: string, target: number, amount: number) => {
  const [r, g, b] = channels(color);

  return toHex(
    r + (target - r) * amount,
    g + (target - g) * amount,
    b + (target - b) * amount,
  );
};

export const lighten = (color: string, amount: number) =>
  mixToward(color, 255, amount);

export const darken = (color: string, amount: number) =>
  mixToward(color, 0, amount);

export const alpha = (color: string, value: number) => {
  const [r, g, b] = channels(color);

  return `rgba(${r}, ${g}, ${b}, ${value})`;
};

const accent = '#e85a36';
const accentBright = '#e85a36';
const accentHover = lighten(accent, 0.12);
const accentDeep = darken(accent, 0.22);
const accentText = darken(accent, 0.25);

export const themedark = {
  color: {
    bg: '#f4efe5',
    surface: '#fcf9f2',
    surfaceRaised: '#fcf9f2',
    surfaceSunken: '#eae1d3',
    headerGradient: 'linear-gradient(180deg, #fcf9f2, #eae1d3)',

    border: 'rgba(36,31,25,0.14)',
    borderSoft: 'rgba(36,31,25,0.08)',
    divider: 'rgba(36,31,25,0.10)',
    fill: 'rgba(36,31,25,0.055)',
    fillStrong: 'rgba(36,31,25,0.11)',

    text: '#241f19',
    textBody: '#241f19',
    textMuted: '#71685e',
    textFaint: '#71685e',
    textDim: '#71685e',
    textDimmer: '#71685e',

    star: '#f4bd3d',
    starPerfect: '#f4bd3d',

    accent,
    accentBright,
    accentHover,
    accentDeep,
    accentText,
    accentInk: '#241f19',
    accentGradient: `linear-gradient(145deg, ${accentHover}, ${accentDeep})`,
    accentGradientFade: `linear-gradient(90deg, ${alpha(
      accent,
      0.35,
    )}, rgba(255, 255, 255, 0.04))`,
    accentSoftBg: alpha(accent, 0.08),
    accentSoftBorder: alpha(accent, 0.22),

    paper: '#eee8dc',
    ink: '#241f19',
    inkSoft: '#71685e',

    green: '#16885b',
    orange: '#e95d37',
    blue: '#247eae',
    yellow: '#c27a10',
    red: '#ce3f54',
  },

  font: {
    display: "'Newsreader', Georgia, serif",
    ui: "'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif", // labels, body, numbers
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  },

  fontSize: {
    sheetTitle: 32,
    sectionTitle: 24,
    songTitle: 19,
    panelTitle: 21,
    transportTitle: 17,
    body: 16,
    label: 15,
    small: 14,
    caption: 13,
    overline: 13,
    micro: 12,
  },

  radius: {
    xs: 2,
    sm: 8,
    md: 11,
    lg: 14,
    xl: 18,
    panel: 22,
    pill: 999,
  },

  shadow: {
    frame:
      '0 40px 90px -30px rgba(36,31,25,0.18), 0 0 0 1px rgba(255,255,255,0.72)',
    star: 'drop-shadow(rgba(244,189,61,0.45) 0px 3px 8px)',
    starPerfect: 'drop-shadow(0 3px 10px rgba(244,189,61,0.5))',
    panel:
      '0 40px 90px -30px rgba(36,31,25,0.18), 0 0 0 1px rgba(255,255,255,0.72)',
    accentButton: `0 12px 32px -6px ${alpha(
      accent,
      0.6,
    )}, inset 0 1px 0 rgba(255,255,255,0.3)`,
    accentChip: `0 6px 16px -4px ${alpha(accent, 0.5)}`,
    accentSoft: `0 6px 6px -6px ${alpha(accent, 0.5)}`,
    paper:
      'inset 0 1px 0 rgba(255,255,255,0.9), 0 18px 40px -20px rgba(36,31,25,0.22)',
    floatLabel: '0 8px 20px rgba(36,31,25,0.16)',
  },

  space: { xs: 4, sm: 8, md: 14, lg: 22, xl: 26, xxl: 40 },

  control: {
    toggleOn: accent,
    toggleOffTrack: 'rgba(36,31,25,0.16)',
    toggleKnobOn: '#ffffff',
    toggleKnobOff: '#ffffff',
    sliderTrack: 'rgba(36,31,25,0.12)',
    sliderFill: `linear-gradient(90deg, ${accentDeep}, ${accent})`,
    sliderFillMuted: 'rgba(36,31,25,0.18)',
    sliderThumb: '#ffffff',
    iconButtonBg: 'rgba(36,31,25,0.055)',
    iconButtonActiveBg: alpha(accent, 0.14),
    iconButtonActiveBorder: alpha(accent, 0.28),
  },
};

export default themedark;
