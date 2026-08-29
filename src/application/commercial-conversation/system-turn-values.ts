import { latinDigits } from "../ai-sales-assistant/services/commercial-field-values";
import type { ProvisionalSystemInput } from "../agentic-commercial-intelligence";
import type { SystemFieldAnswers } from "../ai-sales-assistant/dto/AISalesAssistantDto";

const quantityNames = /^(?:elevatorQuantity|numberOfElevators|liftQuantity|systemQuantity|quantity)$/i;
const stopsNames = /^(?:numberOfStops|stops|floors|numberOfFloors|servedFloors)$/i;
const capacityNames = /^(?:capacity|loadCapacity|ratedLoad)$/i;

function numberFrom(text: string, pattern: RegExp) {
  const match = latinDigits(text).match(pattern);
  return match && Number.isFinite(Number(match[1])) && Number(match[1]) > 0 ? Number(match[1]) : null;
}

function smallArabicNumber(token: string | undefined) {
  if (!token) return null;
  const normalized = latinDigits(token).trim();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const words: Record<string, number> = {
    واحد: 1, واحدة: 1, اثنان: 2, اثنين: 2, اتنين: 2, اثنتان: 2,
    ثلاثة: 3, ثلاث: 3, أربعة: 4, اربعة: 4, أربع: 4, خمسة: 5, خمس: 5,
    ستة: 6, ست: 6, سبعة: 7, سبع: 7, ثمانية: 8, ثمان: 8, تسعة: 9, تسع: 9, عشرة: 10, عشر: 10,
  };
  return words[normalized] ?? null;
}

/** Deterministic patching for explicit multi-value system clarification turns. */
export function systemTurnValues(text: string, inputs: ProvisionalSystemInput[]): SystemFieldAnswers {
  const patch: SystemFieldAnswers = {};
  const elevatorQuantity = numberFrom(text, /(?:^|\s)(\d+)\s*(?:مصعد|مصاعد|elevators?|lifts?)(?:\s|$)/i)
    ?? numberFrom(text, /(?:عدد\s*(?:المصاعد|المصعد)|(?:elevator|lift)\s*quantity)\s*[:=]?\s*(\d+)/i)
    ?? smallArabicNumber(latinDigits(text).match(/(?:مصعد|مصاعد)(?:\s+سيارات)?\s+(\d+|واحد|واحدة|اثنان|اثنين|اتنين|اثنتان)/i)?.[1]);
  const stops = numberFrom(text, /(?:يخدم|تخدم|serv(?:e|es|ing))\s*(\d+)\s*(?:طوابق|طابق|أدوار|دور|وقفات|وقفة|floors?|stops?)/i)
    ?? numberFrom(text, /(\d+)\s*(?:طوابق|طابق|أدوار|دور|وقفات|وقفة|floors?|stops?)/i)
    ?? smallArabicNumber(text.match(/(?:^|\s)(واحد(?:ة)?|اثنان|اثنين|اتنين|اثنتان|ثلاثة|ثلاث|أربعة|اربعة|أربع|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثمان|تسعة|تسع|عشرة|عشر)\s*(?:طوابق|طابق|أدوار|دور|وقفات|وقفة)/i)?.[1]);
  const capacity = numberFrom(text, /(\d+(?:\.\d+)?)\s*(?:كجم|كغ|kg|kilograms?)/i);
  const vehicleClass = /\bSUV\b|دفع\s*رباعي|سيارات\s*كبيرة/i.test(text) ? "SUV" : /سيارات\s*عادية|passenger\s*cars?/i.test(text) ? "PASSENGER_CAR" : null;

  for (const input of inputs) {
    if (elevatorQuantity != null && quantityNames.test(input.name)) patch[input.name] = elevatorQuantity;
    if (stops != null && stopsNames.test(input.name)) patch[input.name] = stops;
    if (capacity != null && capacityNames.test(input.name)) patch[input.name] = capacity;
    if (vehicleClass && input.name === "vehicleClass") patch[input.name] = vehicleClass;
  }
  return patch;
}
