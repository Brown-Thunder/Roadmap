import type { Appearance } from "@clerk/types";
import { TOKENS } from "./brand";

export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: TOKENS.brandPrimary,
    colorSuccess: TOKENS.successSolid,
    borderRadius: "0.875rem",
    fontFamily: "var(--font-inter), Inter, system-ui, -apple-system, sans-serif",
  },
  elements: {
    card: {
      boxShadow: "0 4px 14px rgba(16,24,40,0.09), 0 2px 5px rgba(16,24,40,0.05)",
    },
  },
};
