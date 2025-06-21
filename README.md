## Example Usage

```ts
// src/my-app/ids.ts

import {
  initialize,
  type Satisfies,
  type Duplicates,
  type TypesFromConfig,
  type ScopedId as _ScopedId,
  type UnscopedId as _UnscopedId,
  type Id as _Id,
} from "@zingage/postgres-multi-tenant-ids";

// Configure your entity types!
const config = {
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
} as const;

// Validate that your config has no duplicate entity type hints
type _ValidateConfig = Satisfies<Duplicates<typeof config>, never>;

// Generate exports specific to your config
export const {
  makeTenantId,
  uuidV4ToTenantId,
  isTenantId,
  stringIsTenantId,
  getTenantShortIdFromFullId,

  makeScopedId,
  isScopedId,
  stringIsScopedId,
  scopedIdsBelongToSameTenant,

  makeUnscopedId,
  isUnscopedId,
  stringIsUnscopedId,
} = initialize(config);

// Generate and export some types based on your specific config.
export type TenantScopedEntityType = keyof (typeof config)["tenantScoped"];
export type CrossTenantEntityType = keyof (typeof config)["crossTenant"];
export type NonTenantEntityType =
  | TenantScopedEntityType
  | CrossTenantEntityType;

export type Id<T extends NonTenantEntityType> = _Id<typeof config, T>;
export type ScopedId<T extends TenantScopedEntityType> = _ScopedId<
  (typeof config)["tenantScoped"],
  T
>;
export type UnscopedId<T extends CrossTenantEntityType> = _UnscopedId<
  (typeof config)["crossTenant"],
  T
>;

//

// Optional: make zod schemas helpers
import { makeZodSchemas } from "@zingage/postgres-multi-tenant-ids/zod.js";
export const { tenantIdSchema, unscopedIdSchemaOfType, scopedIdSchemaOfType } =
  makeZodSchemas(config);

//

// Optional: make fast-check arbitraries for generating valid ids in tests
import { makeFastCheckArbitraries } from "@zingage/postgres-multi-tenant-ids/fast-check.js";
export const {
  TenantScopedEntityTypeArbitrary,
  CrossTenantEntityTypeArbitrary,
  IdDateArbitrary,
  TenantIdArbitrary,
  TenantScopedIdArbitrary,
  CrossTenantIdArbitrary,
} = makeFastCheckArbitraries(config);
```

## Running PostgreSQL Locally for Integration Tests

You can run a local PostgreSQL 17 server using Docker Compose for integration testing:

```bash
# Start the PostgreSQL container
docker compose up -d --wait
```

This will start a PostgreSQL 17 server accessible at `localhost:9000` with:

- user: `postgres`
- password: `postgres`
- database: `pg_ids_test`

The database will be automatically initialized with the required functions and extensions from `install.sql`.

To stop the server:

```bash
docker compose down
```

To stop the server and remove all data:

```bash
docker compose down -v
```
