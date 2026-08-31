import type {
  ConversationLocale,
  SystemConfigurationGraph,
} from "./types";

const OPTION_REQUEST =
  /(?:\u0628\u062f\u0627\u0626\u0644|\u062e\u064a\u0627\u0631\u0627\u062a|\u0645\u0627\u0631\u0643\u0627\u062a|\u0628\u0631\u0627\u0646\u062f\u0627\u062a|\u0645\u0648\u062f\u064a\u0644\u0627\u062a|\u0642\u0627\u0631\u0646|\u0645\u0642\u0627\u0631\u0646\u0629|\u062f\u0648\u0631|\u062f\u0648\u0651\u0631|\u0627\u0628\u062d\u062b|\u0627\u062e\u062a\u0627\u0631\u0644\u064a|options?|alternatives?|brands?|models?|compare|search|recommend)/iu;

export function asksForProductOptions(message: string) {
  return OPTION_REQUEST.test(message.normalize("NFKC"));
}

export function renderProductOptionsReply(
  graph: SystemConfigurationGraph,
  locale: ConversationLocale,
  researchAttempted: boolean,
) {
  const candidates = [...graph.candidateProducts.reduce((groups, candidate) => {
    const current = groups.get(candidate.componentKey) ?? [];
    if (current.length < 3) groups.set(candidate.componentKey, [...current, candidate]);
    return groups;
  }, new Map<string, typeof graph.candidateProducts>()).values()].flat();

  if (!candidates.length) {
    return locale === "ar"
      ? researchAttempted
        ? "\u0628\u062d\u062b\u062a \u0641\u064a \u0643\u062a\u0627\u0644\u0648\u062c \u0627\u0644\u0634\u0631\u0643\u0629 \u0648\u0627\u0644\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u062e\u0627\u0631\u062c\u064a\u0629 \u0627\u0644\u0645\u062a\u0627\u062d\u0629\u060c \u0644\u0643\u0646 \u0644\u0645 \u0623\u0633\u062a\u0637\u0639 \u062a\u062b\u0628\u064a\u062a \u0628\u062f\u0627\u0626\u0644 \u0645\u0648\u062b\u0648\u0642\u0629 \u0643\u0641\u0627\u064a\u0629 \u0627\u0644\u0622\u0646. \u0644\u0646 \u0623\u0636\u0639 \u0645\u0627\u0631\u0643\u0627\u062a \u0623\u0648 \u0645\u0648\u062f\u064a\u0644\u0627\u062a \u063a\u064a\u0631 \u0645\u0624\u0643\u062f\u0629."
        : "\u0644\u0645 \u0623\u062c\u062f \u0628\u062f\u0627\u0626\u0644 \u0645\u0648\u062b\u0648\u0642\u0629 \u0641\u064a \u0643\u062a\u0627\u0644\u0648\u062c \u0627\u0644\u0634\u0631\u0643\u0629 \u062d\u062a\u0649 \u0627\u0644\u0622\u0646."
      : researchAttempted
        ? "I searched the company catalog and the available external market sources, but I could not verify enough reliable alternatives yet. I will not invent brands or models."
        : "I could not find reliable alternatives in the company catalog yet.";
  }

  const sourceLabel = (source: string) => {
    if (locale === "ar") {
      return source === "VERIFIED_CATALOG"
        ? "\u0643\u062a\u0627\u0644\u0648\u062c \u0627\u0644\u0634\u0631\u0643\u0629"
        : "\u0628\u062d\u062b \u0633\u0648\u0642 \u062e\u0627\u0631\u062c\u064a";
    }

    return source === "VERIFIED_CATALOG"
      ? "company catalog"
      : "external market research";
  };

  const componentIndexes = new Map<string, number>();
  const rows = candidates.map((candidate) => {
    const index = componentIndexes.get(candidate.componentKey) ?? 0;
    componentIndexes.set(candidate.componentKey, index + 1);
    const title =
      locale === "ar"
        ? candidate.nameAr || candidate.name || candidate.nameEn
        : candidate.nameEn || candidate.name || candidate.nameAr;

    const identity = [
      candidate.brand,
      candidate.model,
    ].filter(Boolean).join(" - ");

    return `${candidate.componentKey} · ${index + 1}) ${title}${identity ? ` - ${identity}` : ""} [${sourceLabel(candidate.source)}]`;
  });

  if (locale === "ar") {
    const countText =
      candidates.length >= 3
        ? "\u0648\u062c\u062f\u062a \u0628\u062f\u0627\u0626\u0644 \u0645\u0648\u062b\u0648\u0642\u0629 \u0644\u0643\u0644 \u0645\u0643\u0648\u0651\u0646 \u0631\u0626\u064a\u0633\u064a \u0645\u062a\u0627\u062d:"
        : `\u0642\u062f\u0631\u062a \u0623\u062b\u0628\u062a ${candidates.length} \u0628\u062f\u064a\u0644 \u0645\u0648\u062b\u0648\u0642 \u0641\u0642\u0637 \u062d\u0627\u0644\u064a\u064b\u0627\u060c \u0648\u0645\u0634 \u0647\u0636\u064a\u0641 \u0627\u062e\u062a\u064a\u0627\u0631 \u063a\u064a\u0631 \u0645\u0624\u0643\u062f:`;

    return [
      countText,
      "",
      ...rows,
      "",
      "\u0627\u062e\u062a\u0627\u0631 1 \u0623\u0648 2 \u0623\u0648 3\u060c \u0623\u0648 \u0642\u0648\u0644 \u0644\u064a \u00ab\u0627\u062e\u062a\u0627\u0631\u0644\u064a \u0627\u0644\u0623\u0646\u0633\u0628\u00bb \u0648\u0623\u0646\u0627 \u0623\u0631\u0634\u062d \u0644\u0643 \u0648\u0627\u062d\u062f \u0628\u0646\u0627\u0621\u064b \u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062a \u0648\u0627\u0644\u0641\u0626\u0629 \u0648\u0627\u0644\u0633\u0648\u0642.",
    ].join("\n");
  }

  const countText =
    candidates.length >= 3
      ? "I found trustworthy alternatives for each available primary component:"
      : `I could verify only ${candidates.length} reliable alternative(s) for now, so I will not invent another option:`;

  return [
    countText,
    "",
    ...rows,
    "",
    "Choose 1, 2, or 3, or tell me to recommend the best fit based on specification, tier, and market evidence.",
  ].join("\n");
}
