"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Language = "en" | "ar";

interface LanguageContextValue {
  language: Language;
  isArabic: boolean;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext =
  createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "voka-language";

export function LanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [language, setLanguageState] =
    useState<Language>("en");

  useEffect(() => {
    const savedLanguage =
      window.localStorage.getItem(STORAGE_KEY);

    if (
      savedLanguage === "ar" ||
      savedLanguage === "en"
    ) {
      setLanguageState(savedLanguage);
    }
  }, []);

  useEffect(() => {
    const direction =
      language === "ar" ? "rtl" : "ltr";

    document.documentElement.lang = language;
    document.documentElement.dir = direction;

    window.localStorage.setItem(
      STORAGE_KEY,
      language
    );
  }, [language]);

  function setLanguage(
    nextLanguage: Language
  ) {
    setLanguageState(nextLanguage);
  }

  function toggleLanguage() {
    setLanguageState((currentLanguage) =>
      currentLanguage === "en"
        ? "ar"
        : "en"
    );
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        isArabic: language === "ar",
        setLanguage,
        toggleLanguage,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context =
    useContext(LanguageContext);

  if (!context) {
    throw new Error(
      "useLanguage must be used inside LanguageProvider"
    );
  }

  return context;
}
