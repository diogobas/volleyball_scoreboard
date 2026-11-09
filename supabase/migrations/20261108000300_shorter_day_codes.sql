begin;

create or replace function private.normalize_day_code(p_code text) returns text
language plpgsql immutable set search_path='' as $$
declare compact text := regexp_replace(p_code,'[-[:space:]]','','g');
begin
  -- Accept both current and previously issued short codes.
  if compact ~* '^([A-HJ-NP-Z2-9]{8}|[A-HJ-NP-Z2-9]{12})$' then return upper(compact); end if;
  if compact ~* '^[0-9a-f]{64}$' then return lower(compact); end if;
  return btrim(p_code);
end;
$$;

create or replace function private.new_day_code() returns text
language plpgsql volatile set search_path='' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  entropy bytea;
  code text;
  i integer;
begin
  loop
    entropy := sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text,'UTF8'));
    code := '';
    -- Eight base-32 symbols (40 bits), grouped for easy entry.
    for i in 0..7 loop
      if i=4 then code := code || '-'; end if;
      code := code || substr(alphabet,1 + get_byte(entropy,i) % 32,1);
    end loop;
    if not exists(select 1 from private.game_days where code_hash=sha256(convert_to(private.normalize_day_code(code),'UTF8'))) then
      return code;
    end if;
  end loop;
end;
$$;
revoke all on function private.normalize_day_code(text),private.new_day_code() from public,anon,authenticated;

commit;
