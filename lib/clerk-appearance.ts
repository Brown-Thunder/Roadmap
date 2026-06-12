import type { Appearance } from "@clerk/types";

export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "#102A56",
    colorSuccess: "#00A969",
    borderRadius: "0.875rem",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  elements: {
    card: {
      boxShadow: "0 4px 14px rgba(15,23,42,0.09), 0 2px 5px rgba(15,23,42,0.05)",
    },
  },
};
