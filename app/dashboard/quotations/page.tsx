"use client";

import Link from "next/link";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, SectionHeader } from "../../../components/ui";
import { useLanguage } from "../../../components/i18n/LanguageProvider";

type Quote = { id:string; quotationNumber:string; status:string; issueDate:string; currencyCode:string; customer:{name:string}; totals:{totalAmount:number} };
type Pagination = { total:number; page:number; pageSize:number; totalPages:number };
const statusAr:Record<string,string>={DRAFT:"مسودة",SENT:"مرسل",APPROVED:"معتمد",REJECTED:"مرفوض",EXPIRED:"منتهي",CANCELLED:"ملغي"};

export default function QuotationsPage() {
  const { isArabic } = useLanguage();
  const [quotes,setQuotes]=useState<Quote[]>([]);
  const [pagination,setPagination]=useState<Pagination>({total:0,page:1,pageSize:20,totalPages:0});
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("");
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [unauthorized,setUnauthorized]=useState(false);
  const [retry,setRetry]=useState(0);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [signingIn,setSigningIn]=useState(false);

  const load=useCallback(async()=>{try{setLoading(true);setError("");setUnauthorized(false);const params=new URLSearchParams({page:String(page),pageSize:"20"});if(search.trim())params.set("search",search.trim());if(status)params.set("status",status);const response=await fetch("/api/quotations?"+params.toString());if(response.status===401){setUnauthorized(true);return;}if(!response.ok)throw new Error("Unable to load quotations");const json=await response.json();setQuotes(json.data.quotations);setPagination(json.data.pagination);}catch(e){setError(e instanceof Error?e.message:"Unknown error");}finally{setLoading(false);}},[page,search,status]);
  useEffect(()=>{const timer=setTimeout(load,250);return()=>clearTimeout(timer);},[load]);

  async function signIn(event:React.FormEvent){event.preventDefault();try{setSigningIn(true);setError("");const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});if(!response.ok)throw new Error(isArabic?"بيانات الدخول غير صحيحة":"Invalid email or password");setPassword("");await load();}catch(e){setError(e instanceof Error?e.message:"Sign in failed");}finally{setSigningIn(false);}}

  const money=(quote:Quote)=>new Intl.NumberFormat(isArabic?"ar-KW":"en-US",{style:"currency",currency:quote.currencyCode}).format(quote.totals.totalAmount);
  return <section className="space-y-6" dir={isArabic?"rtl":"ltr"}>
    <SectionHeader eyebrow={isArabic?"محرك المبيعات":"Sales engine"} title={isArabic?"عروض الأسعار":"Quotations"} description={isArabic?"أنشئ وتابع واعتمد عروض الأسعار من مكان واحد.":"Create, track and approve quotations from one workspace."} actions={<Link href="/dashboard/quotations/new"><Button title={isArabic?"سيتم تنفيذه في جزء إنشاء العرض":"Coming in the create quotation slice"}><span>+</span>{isArabic?"إنشاء عرض سعر":"Create quotation"}</Button></Link>} />
    <div className="grid gap-4 sm:grid-cols-3">
      <Card padding="sm"><p className="text-sm text-slate-500">{isArabic?"إجمالي العروض":"Total quotations"}</p><p className="mt-3 text-3xl font-semibold">{unauthorized?"—":pagination.total}</p></Card>
      <Card padding="sm" className="border-sky-400/20"><p className="text-sm text-slate-500">{isArabic?"الصفحة الحالية":"Current page"}</p><p className="mt-3 text-3xl font-semibold text-sky-300">{unauthorized?"—":pagination.page}</p></Card>
      <Card padding="sm" className="border-emerald-400/20"><p className="text-sm text-slate-500">{isArabic?"عدد الصفحات":"Total pages"}</p><p className="mt-3 text-3xl font-semibold text-emerald-300">{unauthorized?"—":pagination.totalPages}</p></Card>
    </div>
    <Card padding="sm"><div className="flex flex-col gap-3 md:flex-row"><div className="flex-1"><Input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder={isArabic?"ابحث برقم العرض أو اسم العميل...":"Search by quotation number or customer..."} /></div><select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}} className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-4 text-sm text-slate-300"><option value="">{isArabic?"كل الحالات":"All statuses"}</option>{Object.keys(statusAr).map(value=><option key={value} value={value}>{isArabic?statusAr[value]:value}</option>)}</select></div></Card>
    {loading&&<Card><div className="h-28 animate-pulse rounded-2xl bg-white/5"/></Card>}
    {!loading&&unauthorized&&<Card className="border-amber-400/20 bg-amber-400/5"><h3 className="text-lg font-semibold text-amber-200">{isArabic?"سجّل الدخول لعرض عروض الأسعار":"Sign in to view quotations"}</h3><p className="mt-2 text-sm text-slate-400">{isArabic?"الجلسة غير موجودة أو انتهت. أدخل بيانات حساب VOKA.":"Your session is missing or expired. Enter your VOKA account."}</p><form onSubmit={signIn} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder={isArabic?"البريد الإلكتروني":"Email"} /><Input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder={isArabic?"كلمة المرور":"Password"} /><Button type="submit" disabled={signingIn}>{signingIn?(isArabic?"جارٍ الدخول...":"Signing in..."):(isArabic?"تسجيل الدخول":"Sign in")}</Button></form>{error&&<p className="mt-3 text-sm text-red-300">{error}</p>}</Card>}
    {!loading&&!unauthorized&&error&&<Card className="border-red-400/20 bg-red-400/5"><p className="text-red-300">{isArabic?"تعذر تحميل عروض الأسعار":"Could not load quotations"}</p><p className="mt-2 text-sm text-red-200/70">{error}</p></Card>}
    {!loading&&!unauthorized&&!error&&quotes.length===0&&<Card className="py-14 text-center"><div className="text-4xl">◇</div><h3 className="mt-4 text-lg font-semibold">{isArabic?"لا توجد عروض أسعار":"No quotations found"}</h3><p className="mt-2 text-sm text-slate-500">{isArabic?"لا توجد نتائج مطابقة حاليًا.":"There are no matching results yet."}</p></Card>}
    {!loading&&!unauthorized&&!error&&quotes.map(q=><Card key={q.id} padding="sm" role="link" tabIndex={0} onClick={()=>window.location.href="/dashboard/quotations/"+q.id} onKeyDown={e=>{if(e.key==="Enter")window.location.href="/dashboard/quotations/"+q.id}} className="flex cursor-pointer items-center justify-between hover:border-sky-400/20"><div><p className="font-semibold text-sky-300">{q.quotationNumber}</p><p className="mt-1 text-sm text-slate-400">{q.customer.name}</p><p className="mt-1 text-xs text-slate-600">{new Date(q.issueDate).toLocaleDateString(isArabic?"ar-KW":"en-GB")}</p></div><div className="text-end"><Badge>{isArabic?(statusAr[q.status]??q.status):q.status}</Badge><p className="mt-2 font-semibold">{money(q)}</p></div></Card>)}
    {!loading&&!unauthorized&&!error&&pagination.totalPages>1&&<div className="flex items-center justify-between"><Button variant="secondary" disabled={page<=1} onClick={()=>setPage(v=>v-1)}>{isArabic?"السابق":"Previous"}</Button><span className="text-sm text-slate-500">{page} / {pagination.totalPages}</span><Button variant="secondary" disabled={page>=pagination.totalPages} onClick={()=>setPage(v=>v+1)}>{isArabic?"التالي":"Next"}</Button></div>}
  </section>;
}
