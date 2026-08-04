# معمارية VOKA الأساسية

## هدف النظام

VOKA منصة SaaS متعددة الشركات، تحول المحادثات النصية أو الصوتية إلى بيانات منظمة وعروض أسعار احترافية.

## قواعد المنتج الأساسية

- المستخدم هو صاحب القرار النهائي.
- الذكاء الاصطناعي يقترح ولا يعتمد تلقائياً.
- الصمت لا يغلق أي محادثة أو بند.
- لا يغلق البند إلا عندما يقول المستخدم صراحة: تم.
- تظل المحادثة قابلة للاستكمال.
- المنتجات والخدمات نوعان منفصلان.
- الخدمات تدخل ضمن الإجمالي النهائي.
- النظام يدعم العربية والإنجليزية.

## الهيكل الأساسي

User
↓
CompanyMember
↓
Company

كل بيانات العمل يجب أن تكون مرتبطة بشركة محددة.

## الأدوار الأولية

- OWNER
- ADMIN
- SALES
- VIEWER

## Advanced Import / Export Center

The Advanced Import / Export Center is an optional, web-only capability for
advanced users. Voice and AI remain the primary interface for normal users.

Implementation details: [Modules — Advanced Import / Export Center](architecture/13_MODULES.md#advanced-import--export-center).

## المرحلة الحالية

MVP-02 Core Architecture

النطاق الحالي:

- إعداد Prisma
- تصميم تعدد الشركات
- إنشاء Company
- إنشاء User
- إنشاء CompanyMember
- تعريف الأدوار وحالات العضوية
