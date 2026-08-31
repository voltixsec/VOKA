import { describe, expect, it } from "vitest";
import { attemptedPrerequisiteFields, guidanceQuestion, isGuidanceRequest, isUnanswerableResponse, prerequisiteQuestion, relevantGuidanceInput, relevantPrerequisiteInput, resolveGuidanceSelection } from "../engineering-guidance";
import type { WorkingCommercialDraft } from "../types";

function guidedDraft(options: { activeField?: string; value?: string | null } = {}) {
  const input = {
    name: "driveType",
    labelAr: "نوع نظام الحركة",
    labelEn: "Drive type",
    value: options.value ?? null,
    required: true,
    provenance: options.value ? "USER_PROVIDED" : "NEEDS_CONFIRMATION",
    guidance: {
      options: [
        { value: "traction", labelAr: "نظام جر", labelEn: "Traction" },
        { value: "hydraulic", labelAr: "نظام هيدروليكي", labelEn: "Hydraulic" },
      ],
      recommendedValue: "traction",
      rationaleAr: "ترشيح مبدئي",
      rationaleEn: "Preliminary recommendation",
      requiresConfirmation: true,
      provenance: "RESEARCHED",
    },
  } as const;
  return {
    activeQuestion: { field: options.activeField ?? "driveType" },
    canonicalProposal: {
      agenticState: { provisionalSystem: { inputs: [input] } },
    },
  } as unknown as WorkingCommercialDraft;
}

describe("bounded engineering guidance resolution", () => {
  it.each([
    "إيه هي الحمولات المتاحة؟", "ما الاختيارات؟", "رشحلي", "إيه المناسب للـ SUV؟",
    "What capacities are available?", "What are my options?", "What do you recommend?",
  ])("recognizes an engineering guidance question without treating it as a value: %s", (question) => {
    expect(isGuidanceRequest(question)).toBe(true);
  });

  it.each(["مش عارف الوزن", "I don't know the vehicle weight", "What else can you use to decide?"])(
    "marks an explicitly unanswerable prerequisite as conversation control: %s",
    (text) => expect(isUnanswerableResponse(text)).toBe(true),
  );

  it.each(["موافق", "تمام اختار ده", "امشي على ترشيحك", "اعتمد الاختيار ده", "yes", "go with that", "use your recommendation"])(
    "resolves recommendation confirmation %s only against the active guided input",
    (reply) => {
      expect(resolveGuidanceSelection(guidedDraft(), reply)).toMatchObject({
        status: "SELECTED", input: { name: "driveType" }, option: { value: "traction" },
      });
    },
  );

  it.each([
    ["الأول", "traction"],
    ["اختار 1", "traction"],
    ["خليه الأول", "traction"],
    ["choose the first one", "traction"],
    ["go with option 1", "traction"],
    ["الثاني", "hydraulic"],
    ["second option", "hydraulic"],
  ])("resolves bounded ordinal selection %s", (reply, expected) => {
    expect(resolveGuidanceSelection(guidedDraft(), reply)).toMatchObject({
      status: "SELECTED", input: { name: "driveType" }, option: { value: expected },
    });
  });

  it.each(["اختار الجر", "خليه هيدروليكي", "الهيدروليكي", "traction", "select hydraulic"])(
    "resolves explicit bounded label %s",
    (reply) => {
      expect(resolveGuidanceSelection(guidedDraft(), reply).status).toBe("SELECTED");
    },
  );

  it("rejects an out-of-range option while retaining the guided field", () => {
    expect(resolveGuidanceSelection(guidedDraft(), "اختار الخيار الثالث")).toMatchObject({
      status: "INVALID", input: { name: "driveType" },
    });
  });

  it("rejects arbitrary text while the bounded guidance field is active", () => {
    expect(resolveGuidanceSelection(guidedDraft(), "a value outside the list")).toMatchObject({
      status: "INVALID", input: { name: "driveType" },
    });
  });

  it("does not apply relative confirmation when another field is active", () => {
    expect(resolveGuidanceSelection(guidedDraft({ activeField: "capacity" }), "موافق")).toEqual({ status: "NONE" });
    expect(relevantGuidanceInput(guidedDraft({ activeField: "capacity" }))?.name).toBe("driveType");
  });

  it("supports an explicit later correction without depending on the current question", () => {
    expect(resolveGuidanceSelection(guidedDraft({ activeField: "capacity", value: "traction" }), "لا خليه hydraulic بدل traction")).toMatchObject({
      status: "SELECTED", input: { name: "driveType" }, option: { value: "hydraulic" },
    });
  });

  it("projects only the bounded options into the active question", () => {
    const input = relevantGuidanceInput(guidedDraft())!;
    expect(guidanceQuestion(input).options).toEqual([
      { ar: "نظام جر", en: "Traction", value: "traction" },
      { ar: "نظام هيدروليكي", en: "Hydraulic", value: "hydraulic" },
    ]);
  });

  it("retains the parent engineering decision while moving to an unresolved prerequisite", () => {
    const draft = {
      canonicalProposal: {
        agenticState: {
          provisionalSystem: {
            inputs: [
              { name: "vehicleClass", labelAr: "نوع المركبات", labelEn: "Vehicle class", value: "SUV", prerequisiteFor: "capacity" },
              {
                name: "maximumVehicleWeight", labelAr: "أقصى وزن متوقع للمركبة", labelEn: "Expected maximum vehicle weight",
                value: null, prerequisiteFor: "capacity", prerequisiteReasonAr: "نوع المركبة وحده لا يكفي لاعتماد الحمولة.", prerequisiteReasonEn: "Vehicle class alone cannot establish rated load.",
              },
            ],
          },
        },
      },
    } as unknown as WorkingCommercialDraft;

    const prerequisite = relevantPrerequisiteInput(draft, "capacity");
    expect(prerequisite?.name).toBe("maximumVehicleWeight");
    expect(prerequisiteQuestion(prerequisite!)).toMatchObject({
      field: "maximumVehicleWeight", guidanceFor: "capacity", allowDefer: false,
    });
  });

  it("generically advances parentEngineeringField from prerequisite A to B after UNKNOWN", () => {
    const unknownText = "I don't know prerequisite A";
    const draft = {
      activeQuestion: { field: "prerequisiteA", guidanceFor: "parentEngineeringField" },
      temporarilyUnanswerable: [],
      canonicalProposal: {
        agenticState: {
          provisionalSystem: {
            inputs: [
              { name: "prerequisiteA", labelAr: "المدخل أ", labelEn: "Prerequisite A", value: null, prerequisiteFor: "parentEngineeringField" },
              { name: "prerequisiteB", labelAr: "المدخل ب", labelEn: "Prerequisite B", value: null, prerequisiteFor: "parentEngineeringField" },
            ],
          },
        },
      },
      transactionalState: { ledger: { facts: {} } },
      systemAnswers: {},
    } as unknown as WorkingCommercialDraft;

    const attempted = attemptedPrerequisiteFields(draft, isUnanswerableResponse(unknownText));
    const next = relevantPrerequisiteInput(draft, "parentEngineeringField", attempted);
    expect([...attempted]).toEqual(["prerequisiteA"]);
    expect(next?.name).toBe("prerequisiteB");
    expect([...attempted]).not.toContain(unknownText);
    expect(Object.values(draft.systemAnswers ?? {})).not.toContain(unknownText);
  });
});
