import { instantiateTaggedType } from "@ethanresnick/type-party";
import { parse as uuidParse, stringify as uuidStringify } from "uuid";

import {
  isUUIDV8,
  makeUUIDBuffer,
  type UUIDBuffer,
  type UUIDV4,
  type UUIDV8,
} from "../helpers/utils.js";
import type { TenantId, TenantShortId } from "../index.js";

export function makeTenantId(): TenantId {
  const bytesView = new Uint8Array(makeUUIDBuffer());

  // Fill the buffer with random data.
  crypto.getRandomValues(bytesView);

  return makeTenantIdFromRandomBytes(bytesView);
}

export function uuidV4ToTenantId(uuidV4: UUIDV4) {
  // This is not totally random -- uuids have a few fixed bits -- but the fixed
  // bits are all gonna be overwritten, because uuid v8s have magic bits in the
  // same positions.
  const randomishBytes = uuidParse(
    uuidV4
  ) satisfies Uint8Array<ArrayBufferLike> as Uint8Array<UUIDBuffer>;

  return makeTenantIdFromRandomBytes(randomishBytes);
}

function makeTenantIdFromRandomBytes(bytes: Uint8Array<UUIDBuffer>): TenantId {
  // Force the leading bits to be 000, per tenant id rules.
  bytes[0]! &= 0b0001_1111;

  // Insert the version and variant bits.
  bytes[6]! |= 0b1000_0000; // force leading bit to 1
  bytes[6]! &= 0b1000_1111; // force subsequent 3 bits to 0

  bytes[8]! |= 0b1000_0000; // force leading bit to 1
  bytes[8]! &= 0b1011_1111; // force subsequent bit to 0

  return instantiateTaggedType<TenantId>(uuidStringify(bytes));
}

export function getTenantShortIdFromFullId(id: TenantId): TenantShortId {
  const tenantIdBytes = uuidParse(id);
  const trailing32Bits = new DataView(tenantIdBytes.buffer).getUint32(12);
  // Zero out the leading bit, since only the trailing 31 bits are the prefix.
  return instantiateTaggedType<TenantShortId>(trailing32Bits & 0x7fffffff);
}

export function isTenantId(id: UUIDV8): id is TenantId {
  return parseInt(id[0]!, 16) < 2; // validate leading bits are 000X
}

export function stringIsTenantId(id: string): id is TenantId {
  return isUUIDV8(id) && isTenantId(id);
}
