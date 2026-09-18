-- V4 Fighters: ranking e campeonato. Rode no SQL Editor do Supabase (ou via MCP: apply_migration).
-- Acesso livre por link: as políticas abaixo liberam leitura e escrita pra chave pública (anon).
-- É adequado pra um evento interno; qualquer pessoa com o link pode gravar.

create table if not exists players (
  id text primary key, name text not null, fighter text,
  wins int not null default 0, losses int not null default 0, points int not null default 0,
  updated_at timestamptz not null default now());

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(), name text not null, owner text not null,
  status text not null default 'inscricoes' check (status in ('inscricoes','andamento','fim')),
  champion text, created_at timestamptz not null default now());

create table if not exists tournament_entries (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id text not null, name text not null, fighter text not null, joined_at timestamptz not null default now(),
  primary key (tournament_id, player_id));

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round int not null, slot int not null,
  p1 text, p1_name text, p2 text, p2_name text, winner text,
  status text not null default 'pendente' check (status in ('pendente','chamando','lutando','fim')),
  unique (tournament_id, round, slot));

-- vitória = 3 pontos, derrota = 1 (quem joga pontua)
create or replace function record_result(w_id text, w_name text, l_id text, l_name text) returns void language sql as $$
  insert into players (id, name, wins, points) values (w_id, w_name, 1, 3)
    on conflict (id) do update set wins = players.wins + 1, points = players.points + 3, name = excluded.name, updated_at = now();
  insert into players (id, name, losses, points) values (l_id, l_name, 1, 1)
    on conflict (id) do update set losses = players.losses + 1, points = players.points + 1, name = excluded.name, updated_at = now();
$$;

alter table players enable row level security;
alter table tournaments enable row level security;
alter table tournament_entries enable row level security;
alter table matches enable row level security;
do $$ declare t text; begin
  foreach t in array array['players','tournaments','tournament_entries','matches'] loop
    execute format('drop policy if exists "livre" on %I', t);
    execute format('create policy "livre" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop; end $$;

-- mudanças em tempo real pro saguão
alter publication supabase_realtime add table tournaments, tournament_entries, matches, players;

-- cada lutador só pode ser usado por um inscrito no campeonato
create unique index if not exists um_lutador_por_campeonato on tournament_entries (tournament_id, fighter);
