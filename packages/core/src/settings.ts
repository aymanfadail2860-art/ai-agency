import { z } from "zod";
import { IsoDate, ModeSchema } from "./models";

export const PlatformSettingsSchema = z.object({
  mode: ModeSchema,
  updatedAt: IsoDate.nullable(),
});
export type PlatformSettings = z.infer<typeof PlatformSettingsSchema>;

export const PlatformSettingsUpdateSchema = z.object({ mode: ModeSchema });
