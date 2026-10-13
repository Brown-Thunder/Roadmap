// Stasher brand colours for TypeScript. Mirrors app/brand-tokens.css (from the
// stasher-brand skill). Use these named tokens wherever a colour is needed in
// code — inline styles, SVG attributes, colours combined with an alpha suffix,
// third-party themes — instead of raw hex values.

export const BRAND = {
  white: "#FFFFFF",
  black: "#000000",
  gray: {
    25: "#FCFCFD", 50: "#F9FAFB", 100: "#F2F4F7", 200: "#EAECF0", 300: "#D0D5DD",
    400: "#98A2B3", 500: "#667085", 600: "#475467", 700: "#344054", 800: "#1D2939",
    900: "#101828", 950: "#0C111D",
  },
  blue: {
    25: "#F5FAFF", 50: "#EFF8FF", 100: "#D1E9FF", 200: "#B2DDFF", 300: "#84CAFF",
    400: "#53B1FD", 500: "#2E90FA", 600: "#1570EF", 700: "#175CD3", 800: "#1849A9",
    900: "#194185", 950: "#102A56", 975: "#0A1934",
  },
  red: {
    25: "#FFF5F6", 50: "#FFF1F3", 100: "#FFE4E8", 200: "#FECCD6", 300: "#FEA3B4",
    400: "#FD6F8E", 500: "#F63D68", 600: "#E31B53", 700: "#C01048", 800: "#A11043",
    900: "#89123E",
  },
  green: {
    25: "#F6FEF9", 50: "#ECFDF3", 100: "#DBFAE6", 200: "#A9EFC5", 300: "#75E0A7",
    400: "#47CD89", 500: "#17B26A", 600: "#079455", 700: "#067647", 800: "#085D3A",
    900: "#074D31",
  },
  yellow: {
    25: "#FFFCF5", 50: "#FFFAEB", 100: "#FEEFC7", 200: "#FEDF89", 300: "#FEC84B",
    400: "#FDB022", 500: "#F79009", 600: "#DC6803", 700: "#B54708", 800: "#93370D",
    900: "#792E0D",
  },
  pink: {
    25: "#FEF6FB", 50: "#FDF2FA", 100: "#FCE7F6", 200: "#FCCEEE", 300: "#FAA7E0",
    400: "#F670C7", 500: "#EE46BC", 600: "#DD2590", 700: "#C11574", 800: "#9E165F",
    900: "#841651",
  },
  // Primitives with no semantic role in the brand — used only for categorical
  // tags (assignee / area colours) that need more distinct hues.
  purple: {
    50: "#F4F3FF", 100: "#EBE9FE", 200: "#D9D6FE", 300: "#BDB4FE", 400: "#9B8AFB",
    500: "#7A5AF8", 600: "#6938EF", 700: "#5925DC", 800: "#4A1FB8", 900: "#3E1C96",
  },
  lavender: {
    50: "#F9F5FF", 100: "#F4EBFF", 200: "#E9D7FE", 300: "#D6BBFB", 400: "#B692F6",
    500: "#9E77ED", 600: "#7F56D9", 700: "#6941C6", 800: "#53389E", 900: "#42307D",
  },
  gold: {
    50: "#FEFBE8", 100: "#FEF7C3", 200: "#FEEE95", 300: "#FDE172", 400: "#FAC515",
    500: "#EAAA08", 600: "#CA8504", 700: "#A15C07", 800: "#85490E", 900: "#713B12",
  },
} as const;

// Semantic tokens (brand colors.md). Prefer these over primitives.
export const TOKENS = {
  textPrimary: BRAND.gray[900],
  textBody: BRAND.gray[700],
  textSecondary: BRAND.gray[600],
  textTertiary: BRAND.gray[500],
  textDisabled: BRAND.gray[400], // fails AA — disabled UI only

  bgSurface: BRAND.white,
  bgMuted: BRAND.gray[50],
  bgEmphasis: BRAND.gray[100],
  bgSelected: BRAND.blue[50],

  borderSubtle: BRAND.gray[100],
  borderDefault: BRAND.gray[300],
  borderInput: BRAND.gray[400],
  borderStrong: BRAND.gray[500],

  brandPrimary: BRAND.blue[950],
  brandPrimaryHover: BRAND.blue[975],
  interactive: BRAND.blue[600],
  focusRing: BRAND.blue[400],

  successSolid: BRAND.green[600],
  successSoft: BRAND.green[50],
  successText: BRAND.green[700],
  successBorder: BRAND.green[300],

  errorSolid: BRAND.red[600],
  errorSoft: BRAND.red[50],
  errorText: BRAND.red[700],
  errorBorder: BRAND.red[300],

  warningSolid: BRAND.yellow[600],
  warningSoft: BRAND.yellow[50],
  warningText: BRAND.yellow[700],
  warningBorder: BRAND.yellow[300],
} as const;

// Okabe-Ito — the brand's colour-blind-safe categorical palette, used in order
// for data visualisation (e.g. goal colours on the roadmap timeline).
export const OKABE_ITO = [
  "#000000", // black
  "#E69F00", // orange
  "#56B4E9", // sky blue
  "#009E73", // bluish green
  "#F0E442", // yellow
  "#0072B2", // blue
  "#D55E00", // vermilion
  "#CC79A7", // reddish purple
] as const;

// A solid pale version of a brand colour: `amount` of the colour over white
// (0–1). Used for tinted backgrounds where an alpha suffix can't be used,
// e.g. when the result is itself combined with another alpha.
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number) => Math.round(255 + (c - 255) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
