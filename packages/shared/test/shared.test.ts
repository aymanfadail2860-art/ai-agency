import { describe, expect, it } from "vitest";
import { formatDkk, fromOre, newId, toOre, validateCvr } from "@agency/shared";

describe("CVR-validering", () => {
  it("accepterer gyldige CVR-numre (modulus 11)", () => {
    expect(validateCvr("10150817")).toEqual({ valid: true, cvr: "10150817" });
    expect(validateCvr("DK 24 25 67 90")).toEqual({ valid: true, cvr: "24256790" });
  });
  it("afviser forkert længde, foranstillet nul og forkert kontrolciffer", () => {
    expect(validateCvr("1234567").valid).toBe(false);
    expect(validateCvr("01234567").valid).toBe(false);
    expect(validateCvr("12345678").valid).toBe(false);
    expect(validateCvr("abcdefgh").valid).toBe(false);
  });
});

describe("valuta og id'er", () => {
  it("konverterer mellem kroner og øre uden afrundingsfejl", () => {
    expect(toOre(0.1 + 0.2)).toBe(30);
    expect(fromOre(12345)).toBe(123.45);
  });
  it("formaterer DKK på dansk", () => {
    expect(formatDkk(12500)).toBe("12.500,00 kr.");
    expect(formatDkk(12500, { whole: true })).toBe("12.500 kr.");
  });
  it("laver præfiksede, unikke id'er", () => {
    const a = newId("quote");
    expect(a).toMatch(/^qte_[0-9a-f]{20}$/);
    expect(newId("quote")).not.toBe(a);
  });
});
