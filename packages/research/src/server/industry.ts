import type { IndustrySegment } from "@agency/core";

/**
 * Mapper DB07/DB25-branchekoder (6 cifre) til platformens branchesegmenter.
 * Mest specifikke præfiks vinder.
 */
const PREFIX_MAP: Array<[string, IndustrySegment]> = [
  ["4791", "ecommerce"],
  ["9602", "beauty"],
  ["9604", "beauty"],
  ["9313", "fitness"],
  ["9311", "fitness"],
  ["8623", "health"],
  ["86", "health"],
  ["75", "health"],
  ["41", "trades"],
  ["42", "trades"],
  ["43", "trades"],
  ["45", "auto"],
  ["47", "retail"],
  ["46", "retail"],
  ["55", "hospitality"],
  ["56", "hospitality"],
  ["62", "it"],
  ["63", "it"],
  ["58", "it"],
  ["68", "real_estate"],
  ["69", "professional_services"],
  ["70", "professional_services"],
  ["71", "professional_services"],
  ["72", "professional_services"],
  ["73", "professional_services"],
  ["74", "professional_services"],
  ["78", "professional_services"],
  ["49", "transport"],
  ["50", "transport"],
  ["51", "transport"],
  ["52", "transport"],
  ["53", "transport"],
  ["85", "education"],
  ["84", "public"],
];

export function segmentForIndustryCode(code: string | null | undefined): IndustrySegment {
  if (!code) return "other";
  const digits = code.replace(/\D/g, "");
  const twoDigit = Number(digits.slice(0, 2));
  const match = PREFIX_MAP.find(([prefix]) => digits.startsWith(prefix));
  if (match) return match[1];
  if (twoDigit >= 10 && twoDigit <= 33) return "manufacturing";
  return "other";
}
