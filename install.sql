BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET statement_timeout = '120s';
SET lock_timeout = '15s';

-- =====================================================
-- EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- DOMAINS
-- =====================================================

CREATE FUNCTION public.is_tenant_id(id uuid) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
    DECLARE
      bytes bytea;
    BEGIN  
      -- Check if first 3 bits are 000 and that the version is correct (1000 for v8)
      bytes := uuid_send(id);
      RETURN (get_byte(bytes, 0) & B'11100000'::int) = 0 AND (get_byte(bytes, 6) & B'11110000'::int) = 128;
    END;
    $$;

CREATE DOMAIN public.tenant_id AS uuid
        CONSTRAINT tenant_id_check CHECK (public.is_tenant_id(VALUE));



CREATE FUNCTION public.is_tenant_scoped_id(id uuid) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
    DECLARE
      bytes bytea;
    BEGIN  
      -- Check if first bit is 1 and that the version is correct (1000 for v8)
      -- "get_bit [numbers] bits from the right within each byte; for example [...] bit 
      -- 15 is the most significant bit of the second byte."
      bytes := uuid_send(id);
      RETURN get_bit(bytes, 7) = 1 AND (get_byte(bytes, 6) & B'11110000'::int) = 128;
    END;
    $$;

CREATE DOMAIN public.tenant_scoped_id AS uuid
        CONSTRAINT tenant_scoped_id_check CHECK (public.is_tenant_scoped_id(VALUE));



CREATE FUNCTION public.is_cross_tenant_id(id uuid) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
    DECLARE
      bytes bytea;
    BEGIN  
      -- Check if first 3 bits are 001 and that the version is correct (1000 for v8)
      bytes := uuid_send(id);
      RETURN (get_byte(bytes, 0) & B'11100000'::int) = B'00100000'::int 
        AND (get_byte(bytes, 6) & B'11110000'::int) = 128;
    END;
    $$;

CREATE DOMAIN public.cross_tenant_id AS uuid
        CONSTRAINT cross_tenant_id_check CHECK (public.is_cross_tenant_id(VALUE));


-- =====================================================
-- FUNCTIONS
-- =====================================================

CREATE FUNCTION public.get_tenant_short_id_from_full_id(tenant_id public.tenant_id) RETURNS bit
    LANGUAGE plpgsql IMMUTABLE STRICT LEAKPROOF PARALLEL SAFE
    AS $$
        DECLARE
        trailing_bytes bytea;
        BEGIN
        -- Convert UUID to bytea, by getting the type's defined binary representation,
        -- which happens to be the expected one (just the bytes of the id, in uuid order),
        -- and take the first 4 bytes
        trailing_bytes := substring(uuid_send(tenant_id) from 13 for 4);

        -- trim off the leading bit, to keep the 31 LSB, by shifting in a 0 and then discarding it
        RETURN (('x' || encode(trailing_bytes, 'hex'))::bit(32) << 1)::bit(31);
        END;
      $$;

CREATE FUNCTION public.get_tenant_short_id_from_scoped_id(tenant_scoped_id public.tenant_scoped_id) RETURNS bit(31)
    LANGUAGE plpgsql IMMUTABLE STRICT LEAKPROOF PARALLEL SAFE
    AS $$
        DECLARE
        leading_bytes bytea;
        BEGIN
        -- Convert UUID to bytea, by getting the type's defined binary representation,
        -- which happens to be the expected one (just the bytes of the id, in uuid order),
        -- and take the first 4 bytes
        leading_bytes := substring(uuid_send(tenant_scoped_id) from 1 for 4);
    
        -- trim off the leading bit, to keep the 31 LSB, by shifting in a 0 and then discarding it
        RETURN (('x' || encode(leading_bytes, 'hex'))::bit(32) << 1)::bit(31);
        END;
    $$;

CREATE FUNCTION public.is_id_scoped_to_tenant(scoped_id public.tenant_scoped_id, tenant_id public.tenant_id) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT LEAKPROOF PARALLEL SAFE
    AS $$
          SELECT public.get_tenant_short_id_from_full_id(tenant_id) = public.get_tenant_short_id_from_scoped_id(scoped_id);
        $$;

CREATE FUNCTION public.are_ids_in_same_tenant(id_1 public.tenant_scoped_id, id_2 public.tenant_scoped_id) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
    DECLARE
      bytes_1 bytea;
      bytes_2 bytea;
    BEGIN
      -- Convert UUIDs to bytea
      bytes_1 := uuid_send(id_1);
      bytes_2 := uuid_send(id_2);
      
      -- Owned ids owned by the same tenant will have the first 32 bits matching.
      RETURN substring(bytes_1 FROM 1 FOR 4) = substring(bytes_2 FROM 1 FOR 4);
    END;
    $$;

CREATE FUNCTION public.make_tenant_id_from_uuid(uuid uuid) RETURNS public.tenant_id
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
    DECLARE
      bytes bytea;
    BEGIN
      -- Convert UUID to bytea, by getting the type's defined binary representation,
      -- which happens to be the expected one (just the bytes of the id, in uuid order)
      bytes := uuid_send(uuid);
    
      -- Force the leading bits to be 000, per tenant id rules
      bytes := set_byte(bytes, 0, (get_byte(bytes, 0) & B'00011111'::int));
    
      -- Override the old (likely v4) version + variant bits, without shifting any data down
      bytes := set_byte(bytes, 6, (get_byte(bytes, 6) | B'10000000'::int)); -- force leading bit to 1
      bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & B'10001111'::int)); -- force subsequent 3 bits to 0
    
      bytes := set_byte(bytes, 8, (get_byte(bytes, 8) | B'10000000'::int)); -- force leading bit to 1
      bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & B'10111111'::int)); -- force subsequent bit to 0
    
      -- Convert back to UUID
      RETURN encode(bytes, 'hex')::tenant_id;
    END;
    $$;

CREATE FUNCTION public.make_tenant_scoped_entity_id_from_tenant_short_id(tenant_short_id bit, insert_rate text, entity_type_hint bit, desired_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP) RETURNS public.tenant_scoped_id
    LANGUAGE plpgsql STRICT
    AS $$
      DECLARE
        ms_since_epoch_bitstring bit(42);
        random_data bytea;
      BEGIN
        IF insert_rate != 'VERY_LOW' THEN
          RAISE EXCEPTION 'Only very low insert rate is currently supported.';
        END IF;
        
        -- ms since epoch, according to desired timestamp
        ms_since_epoch_bitstring := (EXTRACT(EPOCH FROM desired_timestamp) * 1000)::bigint::bit(42);
        
        random_data = gen_random_bytes(5);

        -- Convert back to UUID;
        -- See https://stackoverflow.com/a/78084730
        RETURN ENCODE(
          substr(varbit_send(
            B'1' || tenant_short_id ||  -- 32 bits
            -- the only remaining bytes code currently defined, then the timesamp for it
            B'000' || substring(ms_since_epoch_bitstring from 1 for 13) || -- 16 bits
            -- but intersperse version here, per spec
            B'1000' || substring(ms_since_epoch_bitstring from 14 for 12) || -- 16 bits
            -- and intersperse varint here, per spec
            B'10' || substring(ms_since_epoch_bitstring from 26) || -- 19 bits
            entity_type_hint || -- 10 bits
            -- Fill the remainder w/ 35 random bits
            get_byte(random_data, 0)::bit(8) || 
            get_byte(random_data, 1)::bit(8) || 
            get_byte(random_data, 2)::bit(8) || 
            get_byte(random_data, 3)::bit(8) ||
            substring(get_byte(random_data, 4)::bit(8) from 1 for 3)),
            5
          ),
          'hex'
        )::uuid;
      END;
    $$;

CREATE FUNCTION public.make_tenant_scoped_entity_id(owning_tenant_id public.tenant_id, insert_rate text, entity_type_hint bit, desired_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP) RETURNS public.tenant_scoped_id
    LANGUAGE sql STRICT
    AS $$ 
          SELECT public.make_tenant_scoped_entity_id_from_tenant_short_id(
              public.get_tenant_short_id_from_full_id(owning_tenant_id),
              insert_rate,
              entity_type_hint,
              desired_timestamp
            );
        $$;

CREATE FUNCTION public.make_cross_tenant_entity_id(insert_rate text, entity_type_hint bit, desired_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP) RETURNS public.cross_tenant_id
    LANGUAGE plpgsql STRICT
    AS $$
    DECLARE
      ms_since_epoch_bitstring bit(42);
      random_data bytea;
    BEGIN
      IF insert_rate != 'VERY_LOW' THEN
        RAISE EXCEPTION 'Only very low insert rate is currently supported.';
      END IF;
      
      -- ms since epoch, according to desired timestamp
      ms_since_epoch_bitstring := (EXTRACT(EPOCH FROM desired_timestamp) * 1000)::bigint::bit(42);

      random_data = gen_random_bytes(8);

      -- Convert back to UUID;
      -- See https://stackoverflow.com/a/78084730
      RETURN ENCODE(
        substr(varbit_send(
          B'001' || -- Leading bits for unowned entity id
          B'000' || -- the only remaining bytes code currently defined
          ms_since_epoch_bitstring || -- then the timesamp, which fits in perfectly before the version bits
          B'1000' || -- version bits, interspersed here per spec
          entity_type_hint || -- 10 bits
          substring(get_byte(random_data, 0)::bit(8) from 1 for 2) || -- random pre-variant padding
          B'10' || -- and intersperse variant here, per spec
          -- Fill remaining 62 bits with random data
          substring(get_byte(random_data, 0)::bit(8) from 3 for 6) ||
          get_byte(random_data, 1)::bit(8) || 
          get_byte(random_data, 2)::bit(8) ||
          get_byte(random_data, 3)::bit(8) ||
          get_byte(random_data, 4)::bit(8) || 
          get_byte(random_data, 5)::bit(8) || 
          get_byte(random_data, 6)::bit(8) || 
          get_byte(random_data, 7)::bit(8)),
          5
        ),
        'hex'
      )::uuid;
    END;
  $$;
COMMIT;