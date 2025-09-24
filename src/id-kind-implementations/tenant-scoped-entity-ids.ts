import { parse as uuidParse, stringify as uuidStringify } from "uuid";

import { instantiateTaggedType } from "type-party/runtime/tagged-types.js";
import type {
  ScopedId,
  ShortBinaryString,
  TenantId,
  TenantShortId,
} from "../helpers/config-agnostic-types.js";
import {
  assertUnreachable,
  interposeVersionAndVariant,
  isUUIDV8,
  makeUUIDBuffer,
  type UUIDV8,
} from "../helpers/utils.js";
import type { NamedEntityTypeConfigs } from "../index.js";

export function makeMakeScopedIdBound<T extends NamedEntityTypeConfigs>(
  tenantScopedEntityTypeConfigs: T
) {
  return <K extends keyof T & string>(
    tenantId: TenantId,
    entityType: K,
    date: Date = new Date()
  ) => {
    return makeScopedId(
      tenantScopedEntityTypeConfigs,
      tenantId,
      entityType,
      date
    );
  };
}

export function makeScopedId<
  T extends NamedEntityTypeConfigs,
  K extends keyof T & string,
>(
  tenantScopedEntityTypeConfigs: T,
  tenantId: TenantId,
  entityType: K,
  date: Date = new Date()
): ScopedId<T, K> {
  const { insertRate, entityTypeHint } =
    tenantScopedEntityTypeConfigs[entityType]!;

  const ownedIdBuffer = makeUUIDBuffer();
  const ownedIdView = new DataView(ownedIdBuffer);
  const ownedIdBytes = new Uint8Array(ownedIdBuffer);

  // If insert rate is very low, we can just use randomness at the end;
  // otherwise, we'll figure out later what we're doing.
  if (insertRate !== "VERY_LOW") {
    assertUnreachable(insertRate, "Only very low insert rate is supported");
  }

  // Read prefix for owning business id.
  // NB: we use DataView because it'll read big endian.
  const businessIdBytes = uuidParse(tenantId);
  const trailing32Bits = new DataView(businessIdBytes.buffer).getUint32(12);

  // Add a leading 1 bit for the owned id code, then the business id prefix.
  ownedIdView.setUint32(0, Number((1n << 31n) | BigInt(trailing32Bits)), false);

  // Add remaining bits code + timestamp + entity type code. This is 55 bits
  // total (with a type-level test to check our assumption about the remaining
  // bit code length). So we also add 9 bits of randomness to fill the uint64.
  const remainingBitsCode = "000" satisfies ShortBinaryString<3>;

  // milliseconds since unix epoch, padded to 42 bits, which'll overflow
  // sufficiently far into the future.
  const msTimestampString = date.valueOf().toString(2).padStart(42, "0");

  const randomness = crypto.getRandomValues(new Uint8Array(6));

  ownedIdView.setBigUint64(
    4,
    BigInt(
      `0b${remainingBitsCode}${msTimestampString}${
        entityTypeHint satisfies ShortBinaryString<10>
      }${randomness[0]!.toString(2).padStart(8, "0")}${randomness[1]! % 2}`
    ),
    false
  );

  // Add the remaining randomness.
  ownedIdView.setUint8(12, randomness[2]!);
  ownedIdView.setUint8(13, randomness[3]!);
  ownedIdView.setUint8(14, randomness[4]!);
  ownedIdView.setUint8(15, randomness[5]!);

  interposeVersionAndVariant(ownedIdBuffer);

  return instantiateTaggedType<ScopedId<T, K>>(uuidStringify(ownedIdBytes));
}

/**
 * NB: filling in T is just a convenient way to do a cast if you (think you)
 * know what type of id you're getting from the outside world.
 */
export function isScopedId<
  T extends NamedEntityTypeConfigs,
  K extends keyof T & string,
>(id: UUIDV8): id is ScopedId<T, K> {
  return parseInt(id[0]!, 16) >= 8; // validate leading bit is a 1
}

/**
 * NB: filling in T is just a convenient way to do a cast if you (think you)
 * know what type of id you're getting from the outside world.
 */
export function stringIsScopedId<
  T extends NamedEntityTypeConfigs,
  K extends keyof T & string,
>(id: string): id is ScopedId<T, K> {
  return isUUIDV8(id) && isScopedId<T, K>(id);
}

export function getTenantShortIdFromScopedId<
  T extends NamedEntityTypeConfigs,
  K extends keyof T & string,
>(id: ScopedId<T, K>): TenantShortId {
  const idBytes = uuidParse(id);
  const leading32Bits = new DataView(idBytes.buffer).getUint32(0);
  // Zero out the leading bit, since it's the owned id indicator, not part of
  // the short id.
  return instantiateTaggedType<TenantShortId>(leading32Bits & 0x7fffffff);
}

export function scopedIdsBelongToSameTenant<
  T extends NamedEntityTypeConfigs,
  K extends keyof T & string,
>(ids: ScopedId<T, K>[]): boolean {
  if (ids.length === 0) {
    return true;
  }
  const firstIdTenantShortId = getTenantShortIdFromScopedId(ids[0]!);
  return ids.every(
    (id) => getTenantShortIdFromScopedId(id) === firstIdTenantShortId
  );
}
