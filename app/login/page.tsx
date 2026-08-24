"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Input } from "../../components/ui";
import { sanitizeReturnTo } from "../../lib/auth/return-to";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams ? searchParams.get("returnTo") : null;
  const returnTo = sanitizeReturnTo(rawReturnTo);

  const [isArabic, setIsArabic] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        throw new Error(
          isArabic
            ? "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            : "Invalid email or password",
        );
      }

      window.location.href = returnTo;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isArabic
          ? "البريد الإلكتروني أو كلمة المرور غير صحيحة"
          : "Invalid email or password",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-white"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <div className="absolute top-6 end-6">
        <button
          type="button"
          onClick={() => setIsArabic((prev) => !prev)}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <span>{isArabic ? "English" : "العربية"}</span>
          <span aria-hidden="true">🌐</span>
        </button>
      </div>

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-violet-600 text-2xl font-black shadow-lg shadow-sky-500/20">
            VO
          </div>

          <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">
            {isArabic ? "مرحباً بك في VOKA" : "Welcome to VOKA"}
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            {isArabic
              ? "نظام إدارة المبيعات الذكي للشركات"
              : "AI-first sales operating system for modern enterprises"}
          </p>
        </div>

        <Card className="border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {isArabic ? "البريد الإلكتروني" : "Email address"}
              </label>

              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  isArabic ? "name@company.com" : "name@company.com"
                }
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {isArabic ? "كلمة المرور" : "Password"}
              </label>

              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full justify-center py-3 text-base font-semibold"
            >
              {loading
                ? isArabic
                  ? "جارٍ تسجيل الدخول..."
                  : "Signing in..."
                : isArabic
                ? "تسجيل الدخول"
                : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-slate-500">
          {isArabic
            ? "© VOKA. جميع الحقوق محفوظة."
            : "© VOKA. All rights reserved."}
        </p>
      </div>
    </div>
  );
}
