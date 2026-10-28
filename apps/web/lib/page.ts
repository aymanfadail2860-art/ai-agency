import { notFound } from "next/navigation";
import { isAppError } from "@agency/shared";

/** Oversætter modulernes not_found-fejl til Next.js' 404-side. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (isAppError(err) && err.code === "not_found") notFound();
    throw err;
  }
}
