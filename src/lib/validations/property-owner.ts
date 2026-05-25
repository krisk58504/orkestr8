import { z } from "zod";
import { requiredId } from "./shared";

/**
 * Minimal grant input — only the two FKs. organization_id is derived
 * from the caller's session by the server action. created_by is auto-
 * stamped to auth.uid().
 */
export const propertyOwnerInputSchema = z.object({
  user_id: requiredId("an eligible owner"),
  property_id: requiredId("a property"),
});

export type PropertyOwnerInput = z.input<typeof propertyOwnerInputSchema>;
export type PropertyOwnerParsed = z.output<typeof propertyOwnerInputSchema>;
