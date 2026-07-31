"use client";

import { useState } from "react";

import {
  Button,
  Modal,
} from "../ui";
import { useLanguage } from "../i18n/LanguageProvider";

export function DashboardHeader() {
  const [searchOpen, setSearchOpen] =
    useState(false);

  const [aiModalOpen, setAiModalOpen] =
    useState(false);

  const {
    isArabic,
    toggleLanguage,
  } = useLanguage();

  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-[88px] items-center justify-between border-b border-white/10 bg-slate-950/90 px-8 backdrop-blur-xl">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            {isArabic
              ? "مساحة عمل VOKA"
              : "VOKA Workspace"}
          </p>

          <h1 className="mt-2 text-xl font-semibold text-white">
            {isArabic
              ? "عمليات المبيعات"
              : "Sales Operations"}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className={[
              "relative overflow-hidden border-violet-400/30",
              "bg-gradient-to-r from-violet-500/25 via-fuchsia-500/20 to-sky-500/20",
              "text-violet-100 shadow-[0_0_24px_rgba(139,92,246,0.16)]",
              "hover:border-violet-300/40 hover:from-violet-500/35",
              "hover:via-fuchsia-500/30 hover:to-sky-500/30",
              "hover:shadow-[0_0_30px_rgba(139,92,246,0.25)]",
            ].join(" ")}
            onClick={() => setAiModalOpen(true)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m12 3 1.2 4.1a5 5 0 0 0 3.4 3.4l4.1 1.2-4.1 1.2a5 5 0 0 0-3.4 3.4L12 20.4l-1.2-4.1a5 5 0 0 0-3.4-3.4l-4.1-1.2 4.1-1.2a5 5 0 0 0 3.4-3.4L12 3Z" />
              <path d="m19 3 .4 1.4a2 2 0 0 0 1.2 1.2L22 6l-1.4.4a2 2 0 0 0-1.2 1.2L19 9l-.4-1.4a2 2 0 0 0-1.2-1.2L16 6l1.4-.4a2 2 0 0 0 1.2-1.2L19 3Z" />
            </svg>

            {isArabic
              ? "المساعد الذكي"
              : "AI Assistant"}
          </Button>

          <div
            className={[
              "overflow-hidden transition-all duration-300",
              searchOpen
                ? "w-72 opacity-100"
                : "w-0 opacity-0",
            ].join(" ")}
          >
            <input
              type="search"
              dir={isArabic ? "rtl" : "ltr"}
              placeholder={
                isArabic
                  ? "ابحث في VOKA..."
                  : "Search VOKA..."
              }
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/40 focus:ring-4 focus:ring-sky-400/10"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              setSearchOpen((value) => !value)
            }
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Search"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>

          <button
            type="button"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400"
            aria-label="Notifications"
          >
            🔔
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-sky-400 ring-2 ring-slate-950" />
          </button>

          <button
            type="button"
            onClick={toggleLanguage}
            className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <span>
              {isArabic
                ? "English"
                : "العربية"}
            </span>

            <span aria-hidden="true">🌐</span>
          </button>

          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-1.5 pe-4"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400/15 text-sm font-bold text-sky-300">
              VO
            </span>

            <span className="hidden text-start md:block">
              <span className="block text-sm font-semibold text-white">
                {isArabic
                  ? "مدير VOKA"
                  : "VOKA Admin"}
              </span>

              <span className="block text-xs text-slate-500">
                {isArabic
                  ? "مالك مساحة العمل"
                  : "Workspace Owner"}
              </span>
            </span>
          </button>
        </div>
      </header>

      <Modal
        open={aiModalOpen}
        title={
          isArabic
            ? "مساعد VOKA الذكي للمبيعات"
            : "VOKA AI Sales Assistant"
        }
        description={
          isArabic
            ? "مساحة المبيعات الذكية الخاصة بك."
            : "Your intelligent sales workspace."
        }
        onClose={() => setAiModalOpen(false)}
        footer={
          <Button
            onClick={() =>
              setAiModalOpen(false)
            }
          >
            {isArabic ? "حسنًا" : "Got it"}
          </Button>
        }
      >
        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-6 text-center">
          <div className="text-3xl">✨</div>

          <h3 className="mt-4 text-lg font-semibold text-white">
            {isArabic
              ? "مساعد المبيعات الذكي قريبًا"
              : "AI Sales Assistant is coming soon"}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            {isArabic
              ? "سيساعدك VOKA في إنشاء عروض الأسعار وتحليل العملاء واقتراح الخطوات التالية وأتمتة عمليات المبيعات."
              : "VOKA will help create quotations, analyze customers, recommend next actions and automate sales workflows."}
          </p>
        </div>
      </Modal>
    </>
  );
}

