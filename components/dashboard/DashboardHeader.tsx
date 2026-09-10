"use client";

import { useEffect, useState } from "react";

import {
  Button,
  Modal,
} from "../ui";
import { useLanguage } from "../i18n/LanguageProvider";
import { displayActorName } from "@/lib/i18n/display-labels";

type UserProfile = {
  id: string;
  name: string;
  email: string;
};
type NotificationItem = { id: string; titleAr: string; titleEn: string; messageAr: string; messageEn: string; href?: string | null; readAt?: string | null; createdAt: string };

export function DashboardHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const { isArabic, toggleLanguage } = useLanguage();

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) return;
        const json = await response.json();
        if (active && json.data?.user) {
          setUser({
            id: json.data.user.id,
            name: json.data.user.name,
            email: json.data.user.email,
          });
        }
      } catch {
        // Safe fallback if user cannot be fetched
      }
    }

    loadUser();
    async function loadNotifications() {
      try {
        const response = await fetch("/api/notifications?limit=20");
        const body = response?.ok ? await response.json() : null;
        if (active && body?.data) {
          setNotifications(body.data.notifications ?? []);
          setUnreadCount(body.data.unreadCount ?? 0);
        }
      } catch {
        // Notification availability must not disrupt the workspace header.
      }
    }
    void loadNotifications();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Proceed with redirect regardless of network state
    } finally {
      window.location.href = "/login";
    }
  }

  const actorName = user?.name ? displayActorName(user.name, isArabic ? "ar" : "en") : "";
  const initials = actorName
    ? actorName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "VO";

  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between gap-2 border-b border-white/10 bg-slate-950/90 px-3 backdrop-blur-xl sm:min-h-[88px] sm:px-8">
        <details className="relative lg:hidden">
          <summary className="cursor-pointer list-none rounded-xl border border-white/10 bg-white/5 px-3 py-2" aria-label={isArabic ? "فتح التنقل" : "Open navigation"}>☰</summary>
          <nav className="absolute start-0 top-12 flex w-60 flex-col rounded-2xl border border-white/10 bg-slate-900 p-2 text-sm shadow-2xl">
            {[["Dashboard","لوحة التحكم","/dashboard"],["Customers","العملاء","/dashboard/customers"],["Products & Services","المنتجات والخدمات","/dashboard/products"],["Quotations","عروض الأسعار","/dashboard/quotations"],["Sales Orders","أوامر البيع","/dashboard/sales-orders"],["Contracts","العقود","/dashboard/contracts"],["Invoices","الفواتير","/dashboard/invoices"],["Payments","المدفوعات","/dashboard/payments"],["Reports","التقارير","/dashboard/reports"],["Drawing Takeoff","حصر الرسومات","/dashboard/takeoff"],["Settings","الإعدادات","/dashboard/settings"]].map(([en, ar, href]) => <a key={href} href={href} className="rounded-xl px-3 py-2 hover:bg-white/5">{isArabic ? ar : en}</a>)}
          </nav>
        </details>
        <div className="hidden sm:block">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            {isArabic ? "مساحة عمل VOKA" : "VOKA Workspace"}
          </p>

          <h1 className="mt-2 text-xl font-semibold text-white">
            {isArabic ? "عمليات المبيعات" : "Sales Operations"}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className={[
              "hidden lg:inline-flex",
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

            {isArabic ? "المساعد الذكي" : "AI Assistant"}
          </Button>

          <div
            className={[
              "overflow-hidden transition-all duration-300",
              searchOpen ? "w-72 opacity-100" : "w-0 opacity-0",
            ].join(" ")}
          >
            <input
              type="search"
              dir={isArabic ? "rtl" : "ltr"}
              placeholder={isArabic ? "ابحث في VOKA..." : "Search VOKA..."}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/40 focus:ring-4 focus:ring-sky-400/10"
            />
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen((value) => !value)}
            className="hidden h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white md:flex"
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

          <div className="relative hidden md:block">
            <button type="button" onClick={() => setNotificationsOpen((value) => !value)} className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400" aria-label={isArabic ? "الإشعارات" : "Notifications"} aria-expanded={notificationsOpen}>
              🔔
              {unreadCount > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-sky-400 px-1 text-center text-xs font-bold text-slate-950">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
            </button>
            {notificationsOpen ? <div className={`absolute ${isArabic ? "left-0" : "right-0"} mt-2 w-80 rounded-2xl border border-white/10 bg-slate-900 p-3 shadow-2xl`}>
              <div className="flex items-center justify-between"><h2 className="font-semibold">{isArabic ? "الإشعارات" : "Notifications"}</h2>{unreadCount ? <button type="button" className="text-xs text-sky-300" onClick={async () => { const response = await fetch("/api/notifications/read-all", { method: "POST" }); if (response.ok) { setUnreadCount(0); setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))); } }}>{isArabic ? "تحديد الكل كمقروء" : "Mark all read"}</button> : null}</div>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{notifications.length ? notifications.map((item) => <a key={item.id} href={item.href ?? "#"} onClick={() => { if (!item.readAt) { void fetch(`/api/notifications/${encodeURIComponent(item.id)}`, { method: "PATCH" }); setUnreadCount((count) => Math.max(0, count - 1)); } }} className={`block rounded-xl p-3 text-sm ${item.readAt ? "bg-white/5 text-slate-400" : "bg-sky-400/10 text-white"}`}><strong className="block">{isArabic ? item.titleAr : item.titleEn}</strong><span className="mt-1 block text-xs text-slate-400">{isArabic ? item.messageAr : item.messageEn}</span><time className="mt-1 block text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString(isArabic ? "ar-KW" : "en-KW")}</time></a>) : <p className="py-6 text-center text-sm text-slate-500">{isArabic ? "لا توجد إشعارات" : "No notifications"}</p>}</div>
            </div> : null}
          </div>

          <button
            type="button"
            onClick={toggleLanguage}
            className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white sm:px-4"
          >
            <span>{isArabic ? "الإنجليزية" : "Arabic"}</span>
            <span aria-hidden="true">🌐</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              aria-label={isArabic ? "قائمة الحساب" : "Account Menu"}
              aria-expanded={accountMenuOpen}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-1.5 pe-4 transition hover:bg-white/10"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400/15 text-sm font-bold text-sky-300">
                {initials}
              </span>

              <span className="hidden text-start md:block">
                <span className="block text-sm font-semibold text-white">
                  {actorName || (isArabic ? "مدير VOKA" : "VOKA Admin")}
                </span>

                <span className="block text-xs text-slate-500 truncate max-w-[140px]">
                  {user?.email || (isArabic ? "مالك مساحة العمل" : "Workspace Owner")}
                </span>
              </span>
            </button>

            {accountMenuOpen && (
              <div
                className={`absolute ${
                  isArabic ? "left-0" : "right-0"
                } mt-2 w-56 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl z-50`}
              >
                <div className="border-b border-white/10 px-3 py-2">
                  <p className="text-sm font-semibold text-white truncate">
                    {actorName || (isArabic ? "مستخدم VOKA" : "VOKA User")}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {user?.email || ""}
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>

                    <span>
                      {loggingOut
                        ? isArabic
                          ? "جارٍ الخروج..."
                          : "Logging out..."
                        : isArabic
                        ? "تسجيل الخروج"
                        : "Logout"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
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
          <Button onClick={() => setAiModalOpen(false)}>
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
