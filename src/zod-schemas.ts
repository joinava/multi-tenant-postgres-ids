import { z } from "zod/v4";
import type {
  ScopedId,
  TenantId,
  UnscopedId,
} from "./helpers/config-agnostic-types.js";
import { stringIsUnscopedId } from "./id-kind-implementations/cross-tenant-entity-ids.js";
import { stringIsTenantId } from "./id-kind-implementations/tenant-ids.js";
import { stringIsScopedId } from "./id-kind-implementations/tenant-scoped-entity-ids.js";
import type { EntityTypesConfig } from "./index.js";

export function makeZodSchemas<T extends EntityTypesConfig>(_entityConfigs: T) {
  type TenantScopedEntityType = keyof T["tenantScoped"] & string;
  type CrossTenantEntityType = keyof T["crossTenant"] & string;

  return {
    tenantIdSchema: z.custom<TenantId>(
      (val: unknown) => typeof val === "string" && stringIsTenantId(val),
      { message: "Invalid id" }
    ),
    unscopedIdSchemaOfType: <K extends CrossTenantEntityType>() => {
      return z.custom<UnscopedId<T["crossTenant"], K>>(
        (val: unknown) =>
          typeof val === "string" &&
          stringIsUnscopedId<T["crossTenant"], K>(val),
        { message: "Invalid id" }
      );
    },
    scopedIdSchemaOfType: <K extends TenantScopedEntityType>() => {
      return z.custom<ScopedId<T["tenantScoped"], K>>(
        (val: unknown) =>
          typeof val === "string" &&
          stringIsScopedId<T["tenantScoped"], K>(val),
        { message: "Invalid id" }
      );
    },
  };
}
