begin;

create or replace function private.check_day_lineup(p_group uuid,p_lineup jsonb) returns void
language plpgsql set search_path='' as $$
declare t text; person jsonb; seen uuid[] := '{}'; person_id uuid;
begin
  perform private.require_match_keys(p_lineup,array['A','B']);
  foreach t in array array['A','B'] loop
    perform private.require_match_keys(p_lineup->t,array['name','players']);
    if jsonb_typeof(p_lineup->t->'name') is distinct from 'string' or char_length(btrim(p_lineup->t->>'name')) not between 1 and 16
      or jsonb_typeof(p_lineup->t->'players') is distinct from 'array' then raise exception 'Invalid team lineup.'; end if;
    if jsonb_array_length(p_lineup->t->'players') <> 6 then raise exception 'Select six players per team.'; end if;
    for person in select value from jsonb_array_elements(p_lineup->t->'players') loop
      perform private.require_match_keys(
        case when jsonb_typeof(person)='object' then person-'role' else person end,
        array['id','name']
      );
      if person ? 'role' and (jsonb_typeof(person->'role') is distinct from 'string' or person->>'role' not in ('S','MB','OH','O')) then
        raise exception 'Choose a valid lineup role.' using errcode='22023';
      end if;
      person_id := (person->>'id')::uuid;
      if person_id is null or person_id=any(seen) or not exists(select 1 from public.players where id=person_id and group_id=p_group and deleted_at is null and name=person->>'name') then
        raise exception 'Select twelve different players registered in this group.';
      end if;
      seen := array_append(seen,person_id);
    end loop;
  end loop;
end;
$$;

-- The scoreboard consumes player IDs and names in court order.
create or replace function public.redeem_day_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d private.game_days; g public.groups; scoreboard_lineup jsonb;
begin
  select * into d from private.game_days where code_hash=sha256(convert_to(private.normalize_day_code(p_code),'UTF8'));
  if not found then raise exception 'Code is invalid or revoked.' using errcode='42501'; end if;
  select * into g from public.groups where id=d.group_id;
  select jsonb_object_agg(team, jsonb_build_object('name',l.lineup->team->'name','players',(
    select jsonb_agg(person-'role' order by position)
    from jsonb_array_elements(l.lineup->team->'players') with ordinality as p(person,position)
  ))) into scoreboard_lineup
  from private.day_lineups l cross join (values ('A'),('B')) as teams(team)
  where l.day_id=d.id and l.version=d.lineup_version;
  return jsonb_build_object('day_id',d.id,'group_id',g.id,'group_name',g.name,'time_zone',g.time_zone,'play_date',d.play_date,'lineup_version',d.lineup_version,
    'lineup',scoreboard_lineup);
end;
$$;

commit;
