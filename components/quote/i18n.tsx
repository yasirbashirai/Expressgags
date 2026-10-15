"use client";

/** Language context for the quote wizard (English / Spanish). Strings live in src/content/i18n/quote.ts. */
import { createContext, useContext } from "react";
import { QUOTE_STRINGS, type Lang, type QuoteStrings } from "@/content/i18n/quote";

const QuoteLangContext = createContext<Lang>("en");

export const QuoteLangProvider = QuoteLangContext.Provider;

/** Current wizard language and its strings. */
export function useQuoteT(): { lang: Lang; t: QuoteStrings } {
  const lang = useContext(QuoteLangContext);
  return { lang, t: QUOTE_STRINGS[lang] };
}
