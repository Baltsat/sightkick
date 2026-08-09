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

const accent = '#f73586';
const accentBright = '#ff684f';
const accentHover = lighten(accent, 0.12);
const accentDeep = darken(accent, 0.22);
const accentText = darken(accent, 0.25);

export const themedark = {
  color: {
    bg: '#f8f5ef',
    surface: '#ffffff',
    surfaceRaised: '#eee8dc',
    surfaceSunken: '#e4ddd0',
    headerGradient: 'linear-gradient(180deg, #ffffff, #eee8dc)',

    border: 'rgba(17,23,34,0.14)',
    borderSoft: 'rgba(17,23,34,0.08)',
    divider: 'rgba(17,23,34,0.10)',
    fill: 'rgba(17,23,34,0.055)',
    fillStrong: 'rgba(17,23,34,0.11)',

    text: '#111722',
    textBody: '#1b2430',
    textMuted: '#526172',
    textFaint: '#667588',
    textDim: '#748195',
    textDimmer: '#8490a1',

    star: '#ffad2f',
    starPerfect: '#56d8f2',

    accent,
    accentBright,
    accentHover,
    accentDeep,
    accentText,
    accentInk: '#111722',
    accentGradient: `linear-gradient(145deg, ${accentHover}, ${accentDeep})`,
    accentGradientFade: `linear-gradient(90deg, ${alpha(
      accent,
      0.35,
    )}, rgba(255, 255, 255, 0.04))`,
    accentSoftBg: alpha(accent, 0.08),
    accentSoftBorder: alpha(accent, 0.22),

    paper: '#eee8dc',
    ink: '#111722',
    inkSoft: '#536274',

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
    body: 15,
    label: 14,
    small: 13.5,
    caption: 12.5,
    overline: 12,
    micro: 11,
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
      '0 40px 90px -30px rgba(17,23,34,0.18), 0 0 0 1px rgba(255,255,255,0.72)',
    star: 'drop-shadow(rgba(255, 173, 47, 0.45) 0px 3px 8px)',
    starPerfect: 'drop-shadow(0 3px 10px rgba(86,216,242,0.5))',
    panel:
      '0 40px 90px -30px rgba(17,23,34,0.18), 0 0 0 1px rgba(255,255,255,0.72)',
    accentButton: `0 12px 32px -6px ${alpha(
      accent,
      0.6,
    )}, inset 0 1px 0 rgba(255,255,255,0.3)`,
    accentChip: `0 6px 16px -4px ${alpha(accent, 0.5)}`,
    accentSoft: `0 6px 6px -6px ${alpha(accent, 0.5)}`,
    paper:
      'inset 0 1px 0 rgba(255,255,255,0.9), 0 18px 40px -20px rgba(17,23,34,0.22)',
    floatLabel: '0 8px 20px rgba(17,23,34,0.16)',
  },

  space: { xs: 4, sm: 8, md: 14, lg: 22, xl: 26, xxl: 40 },

  control: {
    toggleOn: accent,
    toggleOffTrack: 'rgba(17,23,34,0.16)',
    toggleKnobOn: '#ffffff',
    toggleKnobOff: '#ffffff',
    sliderTrack: 'rgba(17,23,34,0.12)',
    sliderFill: `linear-gradient(90deg, ${accentDeep}, ${accent})`,
    sliderFillMuted: 'rgba(17,23,34,0.18)',
    sliderThumb: '#ffffff',
    iconButtonBg: 'rgba(17,23,34,0.055)',
    iconButtonActiveBg: alpha(accent, 0.14),
    iconButtonActiveBorder: alpha(accent, 0.28),
  },
};

export default themedark;
