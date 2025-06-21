import type { EntityTypesConfig } from "../index.js";

export const exampleConfig = {
  tenantScoped: {
    ACCOUNT: {
      insertRate: "VERY_LOW",
      entityTypeHint: "0000000001",
    },
    HOLDING: {
      insertRate: "VERY_LOW",
      entityTypeHint: "0000000010",
    },
  },
  crossTenant: {
    ASSET: {
      insertRate: "VERY_LOW",
      entityTypeHint: "0000000010",
    },
    ASSET_CLASS: {
      insertRate: "VERY_LOW",
      entityTypeHint: "0000000001",
    },
  },
} satisfies EntityTypesConfig;
