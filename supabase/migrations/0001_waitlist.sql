-- Лист ожидания раннего доступа ЛАД.
-- Применить: Supabase Dashboard → SQL Editor → вставить и выполнить,
-- либо `supabase db push` при использовании Supabase CLI.

create table if not exists public.waitlist (
  id          bigint generated always as identity primary key,
  email       text not null unique,
  source      text,
  utm         jsonb,
  referrer    text,
  status      text not null default 'new',   -- new / invited / active / declined
  note        text,                          -- ваши пометки по семье
  created_at  timestamptz not null default now(),
  constraint waitlist_email_lower check (email = lower(email)),
  constraint waitlist_email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

comment on table public.waitlist is 'Заявки на ранний доступ с лендинга ladvdome.app';

-- Таблица закрыта для публичных ключей: ни чтения, ни записи напрямую.
alter table public.waitlist enable row level security;
revoke all on table public.waitlist from anon, authenticated;

-- Единственная дверь для лендинга: функция, которая нормализует адрес,
-- проверяет формат и молча игнорирует повторную запись того же адреса.
create or replace function public.join_waitlist(
  p_email    text,
  p_source   text  default null,
  p_utm      jsonb default null,
  p_referrer text  default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null
     or length(v_email) > 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  insert into public.waitlist (email, source, utm, referrer)
  values (v_email, left(p_source, 100), p_utm, left(p_referrer, 500))
  on conflict (email) do nothing;
end;
$$;

revoke all on function public.join_waitlist(text, text, jsonb, text) from public;
grant execute on function public.join_waitlist(text, text, jsonb, text) to anon;
