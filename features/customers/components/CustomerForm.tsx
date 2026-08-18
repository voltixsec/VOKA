"use client";

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Button,
  Card,
  Input,
} from '../../../components/ui';

import {
  CountryWhatsAppInput,
} from './CountryWhatsAppInput';

export type CustomerFormValue = {
  code: string;

  name: string;
  nameAr: string;
  nameEn: string;

  type: 'COMPANY' | 'INDIVIDUAL';
  status:
    | 'LEAD'
    | 'ACTIVE'
    | 'INACTIVE'
    | 'BLOCKED';

  legalName: string;
  email: string;
  phone: string;
  mobile: string;
  whatsapp: string;
  taxNumber: string;

  addressLine1: string;
  addressLine1Ar: string;
  addressLine1En: string;

  addressLine2: string;
  addressLine2Ar: string;
  addressLine2En: string;

  city: string;
  cityAr: string;
  cityEn: string;

  state: string;
  stateAr: string;
  stateEn: string;

  postalCode: string;
  countryCode: string;

  preferredLocale: '' | 'EN' | 'AR';
  preferredCurrency: string;
  creditLimit: string;
  paymentTermDays: string;

  notes: string;
  notesAr: string;
  notesEn: string;
};

export const emptyCustomerForm:
  CustomerFormValue = {
    code: '',

    name: '',
    nameAr: '',
    nameEn: '',

    type: 'COMPANY',
    status: 'LEAD',

    legalName: '',
    email: '',
    phone: '',
    mobile: '',
    whatsapp: '',
    taxNumber: '',

    addressLine1: '',
    addressLine1Ar: '',
    addressLine1En: '',

    addressLine2: '',
    addressLine2Ar: '',
    addressLine2En: '',

    city: '',
    cityAr: '',
    cityEn: '',

    state: '',
    stateAr: '',
    stateEn: '',

    postalCode: '',
    countryCode: 'KW',

    preferredLocale: '',
    preferredCurrency: 'KWD',
    creditLimit: '',
    paymentTermDays: '',

    notes: '',
    notesAr: '',
    notesEn: '',
  };

const localizedFieldMap = {
  name: {
    ar: 'nameAr',
    en: 'nameEn',
  },
  addressLine1: {
    ar: 'addressLine1Ar',
    en: 'addressLine1En',
  },
  addressLine2: {
    ar: 'addressLine2Ar',
    en: 'addressLine2En',
  },
  city: {
    ar: 'cityAr',
    en: 'cityEn',
  },
  state: {
    ar: 'stateAr',
    en: 'stateEn',
  },
  notes: {
    ar: 'notesAr',
    en: 'notesEn',
  },
} as const;

type LocalizedField =
  keyof typeof localizedFieldMap;

type UiLocale = 'ar' | 'en';

type EditedLocales =
  Partial<
    Record<
      LocalizedField,
      UiLocale
    >
  >;

function activeKey(
  field: LocalizedField,
  locale: UiLocale,
) {
  return localizedFieldMap[field][locale];
}

function otherLocale(
  locale: UiLocale,
): UiLocale {
  return locale === 'ar'
    ? 'en'
    : 'ar';
}

function getVisibleValue(
  value: CustomerFormValue,
  field: LocalizedField,
  locale: UiLocale,
): string {
  const active =
    value[activeKey(field, locale)];

  if (active.trim()) {
    return active;
  }

  const legacy =
    value[field];

  if (legacy.trim()) {
    return legacy;
  }

  return value[
    activeKey(
      field,
      otherLocale(locale),
    )
  ];
}

async function requestLocalizedFields(
  sourceLocale: UiLocale,
  fields: Record<string, string>,
): Promise<Record<string, string> | null> {
  try {
    const response = await fetch(
      '/api/customers/localize-fields',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          sourceLocale,
          fields,
        }),
      },
    );

    if (!response.ok) {
      return null;
    }

    const json =
      await response
        .json()
        .catch(() => null);

    if (
      !json?.data?.fields ||
      typeof json.data.fields !== 'object'
    ) {
      return null;
    }

    return json.data.fields;
  }
  catch {
    return null;
  }
}

export function customerFormPayload(
  value: CustomerFormValue,
) {
  return {
    ...value,

    code:
      value.code || undefined,

    name:
      value.name || undefined,

    nameAr:
      value.nameAr || null,

    nameEn:
      value.nameEn || null,

    legalName:
      value.legalName || null,

    email:
      value.email || null,

    phone:
      value.phone || null,

    mobile:
      value.mobile || null,

    whatsapp:
      value.whatsapp || null,

    taxNumber:
      value.taxNumber || null,

    addressLine1:
      value.addressLine1 || null,

    addressLine1Ar:
      value.addressLine1Ar || null,

    addressLine1En:
      value.addressLine1En || null,

    addressLine2:
      value.addressLine2 || null,

    addressLine2Ar:
      value.addressLine2Ar || null,

    addressLine2En:
      value.addressLine2En || null,

    city:
      value.city || null,

    cityAr:
      value.cityAr || null,

    cityEn:
      value.cityEn || null,

    state:
      value.state || null,

    stateAr:
      value.stateAr || null,

    stateEn:
      value.stateEn || null,

    postalCode:
      value.postalCode || null,

    countryCode:
      value.countryCode || null,

    preferredLocale:
      value.preferredLocale || null,

    preferredCurrency:
      value.preferredCurrency || null,

    creditLimit:
      value.creditLimit === ''
        ? null
        : Number(value.creditLimit),

    paymentTermDays:
      value.paymentTermDays === ''
        ? null
        : Number(value.paymentTermDays),

    notes:
      value.notes || null,

    notesAr:
      value.notesAr || null,

    notesEn:
      value.notesEn || null,
  };
}

export function CustomerForm(
  props: {
    initialValue?: CustomerFormValue;
    isArabic: boolean;
    submitLabel: string;
    isEdit?: boolean;
    onSubmit:
      (
        value: CustomerFormValue,
      ) => Promise<void>;
  },
) {
  const [value, setValue] =
    useState<CustomerFormValue>(
      props.initialValue ??
        emptyCustomerForm,
    );

  const valueRef =
    useRef(value);

  const [editedLocales, setEditedLocales] =
    useState<EditedLocales>({});

  const [saving, setSaving] =
    useState(false);

  const [
    localizing,
    setLocalizing,
  ] = useState(false);

  const [
    whatsappValid,
    setWhatsAppValid,
  ] = useState(true);

  const [
    errorMsg,
    setErrorMsg,
  ] = useState('');

  const previousArabic =
    useRef(props.isArabic);

  const locale: UiLocale =
    props.isArabic
      ? 'ar'
      : 'en';

  function updateValue(
    updater:
      (
        current:
          CustomerFormValue,
      ) => CustomerFormValue,
  ) {
    setValue((current) => {
      const next =
        updater(current);

      valueRef.current =
        next;

      return next;
    });
  }

  function set(
    field:
      keyof CustomerFormValue,
    next: string,
  ) {
    updateValue(
      (current) => ({
        ...current,
        [field]: next,
      }),
    );
  }

  function setLocalized(
    field: LocalizedField,
    next: string,
  ) {
    const sourceLocale =
      props.isArabic
        ? 'ar'
        : 'en';

    const sourceKey =
      activeKey(
        field,
        sourceLocale,
      );

    const targetKey =
      activeKey(
        field,
        otherLocale(sourceLocale),
      );

    updateValue(
      (current) => ({
        ...current,

        /*
         * Legacy field remains current
         * for backward compatibility.
         */
        [field]: next,

        /*
         * Human-entered locale is
         * canonical.
         */
        [sourceKey]: next,

        /*
         * Clear stale AI translation.
         * It will be regenerated.
         */
        [targetKey]: '',
      }),
    );

    setEditedLocales(
      (current) => ({
        ...current,
        [field]: sourceLocale,
      }),
    );
  }

  async function localizeEditedFields(
    current:
      CustomerFormValue,
  ): Promise<CustomerFormValue> {
    let next = {
      ...current,
    };

    for (
      const sourceLocale
      of ['en', 'ar'] as const
    ) {
      const fields:
        Record<string, string> = {};

      const relevant =
        (
          Object.keys(
            localizedFieldMap,
          ) as LocalizedField[]
        ).filter(
          (field) =>
            editedLocales[field] ===
            sourceLocale,
        );

      for (const field of relevant) {
        const sourceKey =
          activeKey(
            field,
            sourceLocale,
          );

        const targetKey =
          activeKey(
            field,
            otherLocale(sourceLocale),
          );

        const sourceValue =
          next[sourceKey].trim();

        if (!sourceValue) {
          next[targetKey] = '';
          continue;
        }

        fields[field] =
          sourceValue;
      }

      if (
        Object.keys(fields)
          .length === 0
      ) {
        continue;
      }

      const translated =
        await requestLocalizedFields(
          sourceLocale,
          fields,
        );

      /*
       * Translation is an enhancement.
       * Saving the human source must
       * continue even when AI fails.
       */
      if (!translated) {
        continue;
      }

      for (
        const field
        of relevant
      ) {
        const translatedValue =
          translated[field];

        if (
          typeof translatedValue !==
            'string' ||
          !translatedValue.trim()
        ) {
          continue;
        }

        const targetKey =
          activeKey(
            field,
            otherLocale(
              sourceLocale,
            ),
          );

        next[targetKey] =
          translatedValue.trim();
      }
    }

    return next;
  }

  /*
   * Switching the UI language must
   * switch the actual field contents,
   * not labels only.
   *
   * If the target locale does not yet
   * exist, VOKA proposes it in one
   * batch without saving anything.
   */
  useEffect(() => {
    if (
      previousArabic.current ===
      props.isArabic
    ) {
      return;
    }

    previousArabic.current =
      props.isArabic;

    const targetLocale:
      UiLocale =
        props.isArabic
          ? 'ar'
          : 'en';

    const sourceLocale =
      otherLocale(
        targetLocale,
      );

    const current =
      valueRef.current;

    const fields:
      Record<string, string> = {};

    for (
      const field
      of Object.keys(
        localizedFieldMap,
      ) as LocalizedField[]
    ) {
      const targetValue =
        current[
          activeKey(
            field,
            targetLocale,
          )
        ].trim();

      if (targetValue) {
        continue;
      }

      const sourceValue =
        current[
          activeKey(
            field,
            sourceLocale,
          )
        ].trim() ||
        current[field].trim();

      if (sourceValue) {
        fields[field] =
          sourceValue;
      }
    }

    if (
      Object.keys(fields)
        .length === 0
    ) {
      return;
    }

    let cancelled = false;

    setLocalizing(true);

    void requestLocalizedFields(
      sourceLocale,
      fields,
    )
      .then(
        (translated) => {
          if (
            cancelled ||
            !translated
          ) {
            return;
          }

          updateValue(
            (latest) => {
              const next = {
                ...latest,
              };

              for (
                const field
                of Object.keys(
                  fields,
                ) as LocalizedField[]
              ) {
                const translatedValue =
                  translated[field];

                if (
                  typeof translatedValue !==
                    'string' ||
                  !translatedValue.trim()
                ) {
                  continue;
                }

                next[
                  activeKey(
                    field,
                    targetLocale,
                  )
                ] =
                  translatedValue.trim();
              }

              return next;
            },
          );
        },
      )
      .finally(() => {
        if (!cancelled) {
          setLocalizing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.isArabic]);

  const labels =
    props.isArabic
      ? {
          code:
            'رمز العميل',

          generatedCode:
            'يتم إنشاؤه تلقائياً عند الحفظ',

          customerName:
            'اسم العميل',

          legal:
            'الاسم القانوني',

          email:
            'البريد الإلكتروني',

          phone:
            'الهاتف',

          mobile:
            'الجوال',

          tax:
            'الرقم الضريبي',

          address1:
            'العنوان',

          address2:
            'تكملة العنوان',

          city:
            'المدينة',

          state:
            'المنطقة',

          postal:
            'الرمز البريدي',

          country:
            'رمز الدولة (ISO)',

          currency:
            'العملة',

          credit:
            'الحد الائتماني',

          terms:
            'أيام السداد',

          notes:
            'ملاحظات',

          additional:
            'البيانات القانونية والتجارية الاختيارية',
        }
      : {
          code:
            'Customer code',

          generatedCode:
            'Generated automatically on save',

          customerName:
            'Customer Name',

          legal:
            'Legal name',

          email:
            'Email',

          phone:
            'Phone',

          mobile:
            'Mobile',

          tax:
            'Tax number',

          address1:
            'Address',

          address2:
            'Address line 2',

          city:
            'City',

          state:
            'State / Area',

          postal:
            'Postal code',

          country:
            'Country code (ISO)',

          currency:
            'Currency',

          credit:
            'Credit limit',

          terms:
            'Payment term days',

          notes:
            'Notes',

          additional:
            'Optional legal & business details',
        };

  const statusLabels =
    props.isArabic
      ? {
          LEAD:
            'عميل محتمل',
          ACTIVE:
            'نشط',
          INACTIVE:
            'غير نشط',
          BLOCKED:
            'محظور',
        }
      : {
          LEAD:
            'Lead',
          ACTIVE:
            'Active',
          INACTIVE:
            'Inactive',
          BLOCKED:
            'Blocked',
        };

  return (
    <form
      onSubmit={
        async (event) => {
          event.preventDefault();

          setErrorMsg('');

          if (!whatsappValid) {
            return;
          }

          const customerName =
            getVisibleValue(
              value,
              'name',
              locale,
            ).trim();

          if (!customerName) {
            setErrorMsg(
              props.isArabic
                ? 'اسم العميل مطلوب.'
                : 'Customer name is required.',
            );

            return;
          }

          setSaving(true);

          try {
            const localized =
              await localizeEditedFields(
                valueRef.current,
              );

            valueRef.current =
              localized;

            setValue(localized);

            await props.onSubmit(
              localized,
            );
          }
          finally {
            setSaving(false);
          }
        }
      }
      className="space-y-6"
    >
      {
        errorMsg &&
        (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {errorMsg}
          </div>
        )
      }

      <Card className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3">
          <span className="text-xs font-medium text-slate-400">
            {labels.code}
          </span>

          <span
            dir="ltr"
            className="text-sm font-semibold text-slate-200"
          >
            {
              value.code ||
              labels.generatedCode
            }
          </span>
        </div>

        <Input
          label={
            labels.customerName
          }
          dir={
            props.isArabic
              ? 'rtl'
              : 'ltr'
          }
          value={
            getVisibleValue(
              value,
              'name',
              locale,
            )
          }
          onChange={
            (event) =>
              setLocalized(
                'name',
                event.target.value,
              )
          }
        />

        {
          localizing &&
          (
            <p className="text-xs text-sky-300">
              {
                props.isArabic
                  ? 'جارٍ تجهيز النصوص بالعربية...'
                  : 'Preparing English text...'
              }
            </p>
          )
        }

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300">
            <span className="block font-medium">
              {
                props.isArabic
                  ? 'النوع'
                  : 'Type'
              }
            </span>

            <select
              value={value.type}
              onChange={
                (event) =>
                  set(
                    'type',
                    event.target.value,
                  )
              }
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white"
            >
              <option value="COMPANY">
                {
                  props.isArabic
                    ? 'شركة'
                    : 'Company'
                }
              </option>

              <option value="INDIVIDUAL">
                {
                  props.isArabic
                    ? 'فرد'
                    : 'Individual'
                }
              </option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span className="block font-medium">
              {
                props.isArabic
                  ? 'الحالة'
                  : 'Status'
              }
            </span>

            <select
              value={value.status}
              onChange={
                (event) =>
                  set(
                    'status',
                    event.target.value,
                  )
              }
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white"
            >
              {
                (
                  [
                    'LEAD',
                    'ACTIVE',
                    'INACTIVE',
                    'BLOCKED',
                  ] as const
                ).map(
                  (status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {
                        statusLabels[
                          status
                        ]
                      }
                    </option>
                  ),
                )
              }
            </select>
          </label>
        </div>
      </Card>

      <Card className="space-y-5">
        <Input
          type="email"
          label={labels.email}
          value={value.email}
          onChange={
            (event) =>
              set(
                'email',
                event.target.value,
              )
          }
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label={labels.phone}
            value={value.phone}
            onChange={
              (event) =>
                set(
                  'phone',
                  event.target.value,
                )
            }
          />

          <Input
            label={labels.mobile}
            value={value.mobile}
            onChange={
              (event) =>
                set(
                  'mobile',
                  event.target.value,
                )
            }
          />
        </div>

        <CountryWhatsAppInput
          value={value.whatsapp}
          countryCode={
            value.countryCode
          }
          isArabic={
            props.isArabic
          }
          onChange={
            (next, valid) => {
              set(
                'whatsapp',
                next,
              );

              setWhatsAppValid(
                valid,
              );
            }
          }
        />
      </Card>

      <Card className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label={
              labels.address1
            }
            dir={
              props.isArabic
                ? 'rtl'
                : 'ltr'
            }
            value={
              getVisibleValue(
                value,
                'addressLine1',
                locale,
              )
            }
            onChange={
              (event) =>
                setLocalized(
                  'addressLine1',
                  event.target.value,
                )
            }
          />

          <Input
            label={
              labels.address2
            }
            dir={
              props.isArabic
                ? 'rtl'
                : 'ltr'
            }
            value={
              getVisibleValue(
                value,
                'addressLine2',
                locale,
              )
            }
            onChange={
              (event) =>
                setLocalized(
                  'addressLine2',
                  event.target.value,
                )
            }
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label={labels.city}
            dir={
              props.isArabic
                ? 'rtl'
                : 'ltr'
            }
            value={
              getVisibleValue(
                value,
                'city',
                locale,
              )
            }
            onChange={
              (event) =>
                setLocalized(
                  'city',
                  event.target.value,
                )
            }
          />

          <Input
            label={labels.state}
            dir={
              props.isArabic
                ? 'rtl'
                : 'ltr'
            }
            value={
              getVisibleValue(
                value,
                'state',
                locale,
              )
            }
            onChange={
              (event) =>
                setLocalized(
                  'state',
                  event.target.value,
                )
            }
          />

          <Input
            label={
              labels.postal
            }
            value={
              value.postalCode
            }
            onChange={
              (event) =>
                set(
                  'postalCode',
                  event.target.value,
                )
            }
          />
        </div>

        <Input
          label={labels.country}
          maxLength={2}
          value={
            value.countryCode
          }
          onChange={
            (event) =>
              set(
                'countryCode',
                event.target.value
                  .toUpperCase(),
              )
          }
        />
      </Card>

      <Card className="space-y-5">
        <label className="block space-y-2 text-sm text-slate-300">
          <span className="font-medium">
            {labels.notes}
          </span>

          <textarea
            dir={
              props.isArabic
                ? 'rtl'
                : 'ltr'
            }
            value={
              getVisibleValue(
                value,
                'notes',
                locale,
              )
            }
            onChange={
              (event) =>
                setLocalized(
                  'notes',
                  event.target.value,
                )
            }
            className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-sky-400/50"
          />
        </label>
      </Card>

      <Card>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-200">
            <span className="inline-flex items-center gap-2">
              <span>
                {
                  labels.additional
                }
              </span>

              <span className="text-xs text-slate-500 group-open:rotate-180">
                ▼
              </span>
            </span>
          </summary>

          <div className="mt-5 space-y-5 border-t border-white/10 pt-5">
            <Input
              label={labels.legal}
              value={
                value.legalName
              }
              onChange={
                (event) =>
                  set(
                    'legalName',
                    event.target.value,
                  )
              }
            />

            <p className="text-xs text-slate-500">
              {
                props.isArabic
                  ? 'الاسم القانوني لا تتم ترجمته تلقائياً.'
                  : 'Legal name is never translated automatically.'
              }
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                label={labels.tax}
                value={
                  value.taxNumber
                }
                onChange={
                  (event) =>
                    set(
                      'taxNumber',
                      event.target.value,
                    )
                }
              />

              <Input
                label={
                  labels.currency
                }
                maxLength={3}
                value={
                  value.preferredCurrency
                }
                onChange={
                  (event) =>
                    set(
                      'preferredCurrency',
                      event.target.value
                        .toUpperCase(),
                    )
                }
              />

              <label className="space-y-2 text-sm text-slate-300">
                <span className="block font-medium">
                  {
                    props.isArabic
                      ? 'اللغة المفضلة'
                      : 'Preferred language'
                  }
                </span>

                <select
                  value={
                    value.preferredLocale
                  }
                  onChange={
                    (event) =>
                      set(
                        'preferredLocale',
                        event.target.value,
                      )
                  }
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white"
                >
                  <option value="">
                    —
                  </option>

                  <option value="AR">
                    العربية
                  </option>

                  <option value="EN">
                    English
                  </option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                type="number"
                min="0"
                step="0.001"
                label={
                  labels.credit
                }
                value={
                  value.creditLimit
                }
                onChange={
                  (event) =>
                    set(
                      'creditLimit',
                      event.target.value,
                    )
                }
              />

              <Input
                type="number"
                min="0"
                step="1"
                label={
                  labels.terms
                }
                value={
                  value.paymentTermDays
                }
                onChange={
                  (event) =>
                    set(
                      'paymentTermDays',
                      event.target.value,
                    )
                }
              />
            </div>
          </div>
        </details>
      </Card>

      <Button
        type="submit"
        disabled={
          saving ||
          !whatsappValid
        }
      >
        {
          saving
            ? props.isArabic
              ? 'جارٍ الحفظ...'
              : 'Saving...'
            : props.submitLabel
        }
      </Button>
    </form>
  );
}