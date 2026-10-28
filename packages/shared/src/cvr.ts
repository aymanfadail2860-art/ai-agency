/**
 * Validering af danske CVR-numre.
 * Et CVR-nummer består af 8 cifre, hvor første ciffer ikke er 0, og vægtet
 * modulus 11-kontrol (vægte 2,7,6,5,4,3,2,1) giver 0.
 */
const WEIGHTS = [2, 7, 6, 5, 4, 3, 2, 1];

export function normalizeCvr(input: string): string {
  return input.replace(/^DK/i, "").replace(/[\s.-]/g, "");
}

export type CvrValidation =
  | { valid: true; cvr: string }
  | { valid: false; cvr: string; reason: string };

export function validateCvr(input: string): CvrValidation {
  const cvr = normalizeCvr(input ?? "");
  if (!/^\d{8}$/.test(cvr)) {
    return { valid: false, cvr, reason: "Et CVR-nummer skal bestå af præcis 8 cifre." };
  }
  if (cvr.startsWith("0")) {
    return { valid: false, cvr, reason: "Et CVR-nummer kan ikke starte med 0." };
  }
  const sum = cvr.split("").reduce((acc, digit, i) => acc + Number(digit) * WEIGHTS[i], 0);
  if (sum % 11 !== 0) {
    return { valid: false, cvr, reason: "CVR-nummeret fejler kontrolcifferberegningen (modulus 11)." };
  }
  return { valid: true, cvr };
}
