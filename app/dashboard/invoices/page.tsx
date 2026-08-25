"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, SectionHeader } from "@/components/ui";
import { useLanguage } from "@/components/i18n/LanguageProvider";

type Row = { id:string; number:string; status:string; settlementStatus:string; invoiceDate:string; dueDate:string|null; currencyCode:string; customer:{name:string}; totals:{totalAmount:number}; paidAmount:number; outstandingAmount:number };
export default function InvoicesPage(){
 const {isArabic}=useLanguage(); const [rows,setRows]=useState<Row[]>([]); const [search,setSearch]=useState(""); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 const load=useCallback(async()=>{try{setLoading(true);setError("");const q=new URLSearchParams();if(search.trim())q.set("search",search.trim());const r=await fetch(`/api/invoices?${q}`);if(!r.ok)throw new Error(isArabic?"تعذر تحميل الفواتير":"Unable to load invoices");const b=await r.json();setRows(b.data.invoices??[])}catch(e){setError(e instanceof Error?e.message:"Error")}finally{setLoading(false)}},[search,isArabic]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),250);return()=>clearTimeout(timer)},[load]);
 const money=(n:number,c:string)=>new Intl.NumberFormat(isArabic?"ar-KW":"en-US",{style:"currency",currency:c,minimumFractionDigits:3}).format(n);
 return <section className="space-y-6" dir={isArabic?"rtl":"ltr"}>
  <SectionHeader eyebrow={isArabic?"الذمم المدينة":"Receivables"} title={isArabic?"الفواتير والمدفوعات":"Invoices & Payments"} description={isArabic?"إصدار المطالبات المالية ومتابعة التحصيل الحقيقي.":"Issue financial claims and track actual settlement."} actions={<div className="flex gap-3"><Link href="/dashboard/reports"><Button variant="secondary">{isArabic?"أعمار الذمم":"Aging report"}</Button></Link><Link href="/dashboard/invoices/new"><Button>{isArabic?"إنشاء فاتورة":"Create invoice"}</Button></Link></div>}/>
  <Card padding="sm"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder={isArabic?"ابحث برقم الفاتورة أو العميل":"Search invoice or customer"}/></Card>
  {loading&&<Card><div className="h-24 animate-pulse rounded-xl bg-white/5"/></Card>}{error&&<Card className="border-red-400/20"><p className="text-red-300">{error}</p></Card>}
  {!loading&&!error&&rows.length===0&&<Card className="py-12 text-center">{isArabic?"لا توجد فواتير بعد":"No invoices yet"}</Card>}
  {rows.map(row=><Link key={row.id} href={`/dashboard/invoices/${row.id}`}><Card padding="sm" className="mb-3 flex items-center justify-between hover:border-sky-400/20"><div><p className="font-semibold text-sky-300">{row.number}</p><p className="text-sm text-slate-300">{row.customer.name}</p><p className="text-xs text-slate-500">{new Date(row.invoiceDate).toLocaleDateString(isArabic?"ar-KW":"en-GB")}</p></div><div className="text-end"><div className="flex gap-2"><Badge>{row.status}</Badge><Badge>{row.settlementStatus}</Badge></div><p className="mt-2">{money(row.totals.totalAmount,row.currencyCode)}</p><p className="text-xs text-amber-300">{isArabic?"المتبقي":"Outstanding"}: {money(row.outstandingAmount,row.currencyCode)}</p></div></Card></Link>)}
 </section>
}
