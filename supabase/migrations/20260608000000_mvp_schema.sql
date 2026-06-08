create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  points integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.places (
  id text primary key,
  google_place_id text unique,
  name text not null,
  category text not null,
  address text not null,
  phone text,
  website text,
  hours text,
  lat double precision not null,
  lng double precision not null,
  distance_km numeric(5, 1) not null default 0,
  photo_url text,
  tags text[] not null default '{}',
  google_payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'pending', 'published', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_definitions (
  id text primary key,
  label text not null,
  icon_id text not null,
  score_group text not null check (score_group in ('equipment', 'child_experience', 'parent_comfort')),
  score_weight numeric(6, 2) not null default 1
);

create table if not exists public.equipment_validations (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.places(id) on delete cascade,
  equipment_id text not null references public.equipment_definitions(id),
  user_id uuid references auth.users(id) on delete set null,
  answer text not null check (answer in ('yes', 'no', 'unknown')),
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.places(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_display_name text not null default 'Parent',
  recommended_age text not null,
  welcome smallint not null check (welcome between 1 and 5),
  comfort smallint not null check (comfort between 1 and 5),
  gear smallint not null check (gear between 1 and 5),
  comment text,
  status text not null default 'published' check (status in ('pending', 'published', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table if not exists public.place_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  address text not null,
  category text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists places_status_idx on public.places(status);
create index if not exists places_category_idx on public.places(category);
create index if not exists equipment_validations_place_idx on public.equipment_validations(place_id);
create index if not exists reviews_place_idx on public.reviews(place_id);

create or replace function public.calculate_kids_friendly_score(target_place_id text)
returns integer
language sql
stable
as $$
  with criterion_votes as (
    select
      ed.score_group,
      ed.score_weight,
      count(ev.*) filter (where ev.answer in ('yes', 'no')) as known_votes,
      count(ev.*) filter (where ev.answer = 'yes') as yes_votes
    from public.equipment_definitions ed
    join public.equipment_validations ev on ev.equipment_id = ed.id
    where ev.place_id = target_place_id
    group by ed.id, ed.score_group, ed.score_weight
  ),
  weighted_groups as (
    select
      score_group,
      case score_group
        when 'equipment' then 40
        when 'child_experience' then 40
        when 'parent_comfort' then 20
        else 0
      end as group_weight,
      sum((yes_votes::numeric / nullif(known_votes, 0)) * score_weight) / nullif(sum(score_weight), 0) as group_ratio
    from criterion_votes
    where known_votes > 0
    group by score_group
  )
  select coalesce(round((sum(group_ratio * group_weight) / nullif(sum(group_weight), 0)) * 100)::integer, 0)
  from weighted_groups;
$$;

create or replace view public.published_places_with_stats as
select
  p.id,
  p.google_place_id,
  p.name,
  p.category,
  p.address,
  p.phone,
  p.website,
  p.hours,
  p.lat,
  p.lng,
  p.distance_km,
  p.photo_url,
  p.tags,
  public.calculate_kids_friendly_score(p.id) as score,
  coalesce(eq.equipment, '[]'::jsonb) as equipment,
  coalesce(rv.reviews, '[]'::jsonb) as reviews
from public.places p
left join lateral (
  select jsonb_agg(jsonb_build_array(ed.icon_id, ed.label, stats.yes_count) order by stats.yes_count desc, ed.label) as equipment
  from (
    select equipment_id, count(*) filter (where answer = 'yes') as yes_count
    from public.equipment_validations
    where place_id = p.id
    group by equipment_id
  ) stats
  join public.equipment_definitions ed on ed.id = stats.equipment_id
  where stats.yes_count > 0
) eq on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'author', r.author_display_name,
    'age', r.recommended_age,
    'welcome', r.welcome,
    'comfort', r.comfort,
    'gear', r.gear,
    'text', coalesce(r.comment, '')
  ) order by r.created_at desc) as reviews
  from public.reviews r
  where r.place_id = p.id and r.status = 'published'
) rv on true
where p.status = 'published';

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.equipment_definitions enable row level security;
alter table public.equipment_validations enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
alter table public.place_suggestions enable row level security;

create policy "Published places are readable" on public.places for select using (status = 'published');
create policy "Equipment definitions are readable" on public.equipment_definitions for select using (true);
create policy "Equipment validations are readable" on public.equipment_validations for select using (true);
create policy "Reviews are readable when published" on public.reviews for select using (status = 'published');
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can validate equipment" on public.equipment_validations for insert with check (auth.uid() = user_id);
create policy "Users can create reviews" on public.reviews for insert with check (auth.uid() = user_id);
create policy "Users can read own favorites" on public.favorites for select using (auth.uid() = user_id);
create policy "Users can add own favorites" on public.favorites for insert with check (auth.uid() = user_id);
create policy "Users can remove own favorites" on public.favorites for delete using (auth.uid() = user_id);
create policy "Users can suggest places" on public.place_suggestions for insert with check (auth.uid() = user_id);

insert into public.equipment_definitions (id, label, icon_id, score_group, score_weight) values
  ('changing_table', 'Table à langer', 'baby', 'equipment', 1),
  ('high_chair', 'Chaise bébé', 'chair', 'equipment', 1),
  ('bottle_warmer', 'Chauffe biberon', 'bottle', 'equipment', 1),
  ('stroller', 'Accessible poussette', 'stroller', 'equipment', 1),
  ('play_corner', 'Coin jeux', 'play', 'child_experience', 1),
  ('kids_activity', 'Activités enfants', 'activity', 'child_experience', 1),
  ('safe_space', 'Espace sécurisé', 'tree', 'child_experience', 1),
  ('indoor', 'Intérieur', 'indoor', 'parent_comfort', 1),
  ('outdoor', 'Espace extérieur', 'tree', 'parent_comfort', 1),
  ('family_welcome', 'Accueil familles', 'sparkle', 'parent_comfort', 1),
  ('picnic', 'Pique-nique facile', 'picnic', 'parent_comfort', 1),
  ('water_point', 'Point d''eau', 'water', 'equipment', 1)
on conflict (id) do update set
  label = excluded.label,
  icon_id = excluded.icon_id,
  score_group = excluded.score_group,
  score_weight = excluded.score_weight;

insert into public.places (id, name, category, address, phone, website, hours, lat, lng, distance_km, photo_url, tags, status) values
  ('bbq-lille', 'La Luck Lille', 'Activité', '1 bis rue Princesse, Lille', '03 20 15 78 31', 'https://www.laluck.com', 'Mar-dim, 11:30-00:00', 50.6448, 3.0565, 1.1, 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=900&q=80', array['indoor', 'play_corner', 'stroller'], 'published'),
  ('citadelle', 'Parc de la Citadelle', 'Parc', 'Avenue du 43e Régiment d''Infanterie, Lille', '03 20 49 50 00', 'https://www.lille.fr', 'Tous les jours', 50.641, 3.044, 1.6, 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80', array['outdoor', 'play_corner', 'stroller'], 'published'),
  ('cafemome', 'Café Môme', 'Café', 'Rue Esquermoise, Lille', '03 20 00 00 00', 'https://example.com', 'Lun-sam, 09:00-18:30', 50.6372, 3.0615, 0.5, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80', array['indoor', 'changing_table', 'high_chair', 'stroller'], 'published'),
  ('lam', 'LaM', 'Musée', '1 allée du Musée, Villeneuve-d''Ascq', '03 20 19 68 68', 'https://www.musee-lam.fr', 'Mar-dim, 10:00-18:00', 50.6377, 3.1502, 7.2, 'https://images.unsplash.com/photo-1544967082-d9d25d867d66?auto=format&fit=crop&w=900&q=80', array['indoor', 'outdoor', 'stroller', 'activity'], 'published'),
  ('mediatheque-lomme', 'Médiathèque de Lomme', 'Bibliothèque', '794 avenue de Dunkerque, Lomme', '03 20 17 27 40', 'https://bm-lille.fr', 'Mar-sam', 50.6436, 3.0124, 4.1, 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80', array['indoor', 'stroller', 'play_corner'], 'published'),
  ('euralille', 'Westfield Euralille', 'Centre commercial', '100 avenue Willy Brandt, Lille', '03 20 14 52 20', 'https://www.westfield.com/france/euralille', 'Lun-sam, 10:00-20:00', 50.638, 3.075, 1.0, 'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?auto=format&fit=crop&w=900&q=80', array['indoor', 'changing_table', 'stroller'], 'published'),
  ('piscine-marx', 'Piscine Marx Dormoy', 'Piscine', '36 avenue Marx Dormoy, Lille', '03 20 92 53 30', 'https://www.lille.fr', 'Selon créneaux', 50.6321, 3.0472, 2.2, 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=900&q=80', array['indoor', 'changing_table'], 'published'),
  ('ferme-marcel', 'La Ferme Marcel Dhénin', 'Activité', '14 rue Eugène Jacquet, Lille', '03 20 55 16 12', 'https://www.lille.fr', 'Mer-dim', 50.6416, 3.0837, 1.8, 'https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=900&q=80', array['outdoor', 'activity', 'stroller'], 'published')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  address = excluded.address,
  phone = excluded.phone,
  website = excluded.website,
  hours = excluded.hours,
  lat = excluded.lat,
  lng = excluded.lng,
  distance_km = excluded.distance_km,
  photo_url = excluded.photo_url,
  tags = excluded.tags,
  status = excluded.status,
  updated_at = now();

insert into public.equipment_validations (place_id, equipment_id, answer)
select 'bbq-lille', 'kids_activity', 'yes' from generate_series(1, 34)
union all select 'bbq-lille', 'stroller', 'yes' from generate_series(1, 22)
union all select 'bbq-lille', 'indoor', 'yes' from generate_series(1, 41)
union all select 'bbq-lille', 'play_corner', 'yes' from generate_series(1, 30)
union all select 'bbq-lille', 'family_welcome', 'yes' from generate_series(1, 38)
union all select 'bbq-lille', 'family_welcome', 'no' from generate_series(1, 5)
union all select 'citadelle', 'play_corner', 'yes' from generate_series(1, 67)
union all select 'citadelle', 'stroller', 'yes' from generate_series(1, 53)
union all select 'citadelle', 'outdoor', 'yes' from generate_series(1, 82)
union all select 'citadelle', 'picnic', 'yes' from generate_series(1, 29)
union all select 'citadelle', 'safe_space', 'no' from generate_series(1, 10)
union all select 'cafemome', 'changing_table', 'yes' from generate_series(1, 16)
union all select 'cafemome', 'high_chair', 'yes' from generate_series(1, 21)
union all select 'cafemome', 'stroller', 'yes' from generate_series(1, 12)
union all select 'cafemome', 'bottle_warmer', 'yes' from generate_series(1, 8)
union all select 'cafemome', 'family_welcome', 'yes' from generate_series(1, 18)
union all select 'cafemome', 'stroller', 'no' from generate_series(1, 7)
union all select 'lam', 'stroller', 'yes' from generate_series(1, 38)
union all select 'lam', 'kids_activity', 'yes' from generate_series(1, 26)
union all select 'lam', 'outdoor', 'yes' from generate_series(1, 19)
union all select 'lam', 'indoor', 'yes' from generate_series(1, 40)
union all select 'lam', 'family_welcome', 'no' from generate_series(1, 9)
union all select 'mediatheque-lomme', 'play_corner', 'yes' from generate_series(1, 14)
union all select 'mediatheque-lomme', 'stroller', 'yes' from generate_series(1, 18)
union all select 'mediatheque-lomme', 'indoor', 'yes' from generate_series(1, 23)
union all select 'mediatheque-lomme', 'family_welcome', 'yes' from generate_series(1, 12)
union all select 'mediatheque-lomme', 'play_corner', 'no' from generate_series(1, 6)
union all select 'euralille', 'changing_table', 'yes' from generate_series(1, 31)
union all select 'euralille', 'stroller', 'yes' from generate_series(1, 44)
union all select 'euralille', 'indoor', 'yes' from generate_series(1, 50)
union all select 'euralille', 'family_welcome', 'no' from generate_series(1, 18)
union all select 'piscine-marx', 'changing_table', 'yes' from generate_series(1, 9)
union all select 'piscine-marx', 'kids_activity', 'yes' from generate_series(1, 12)
union all select 'piscine-marx', 'indoor', 'yes' from generate_series(1, 16)
union all select 'piscine-marx', 'family_welcome', 'no' from generate_series(1, 16)
union all select 'ferme-marcel', 'kids_activity', 'yes' from generate_series(1, 45)
union all select 'ferme-marcel', 'outdoor', 'yes' from generate_series(1, 39)
union all select 'ferme-marcel', 'stroller', 'yes' from generate_series(1, 23)
union all select 'ferme-marcel', 'water_point', 'yes' from generate_series(1, 17);

insert into public.reviews (place_id, author_display_name, recommended_age, welcome, comfort, gear, comment) values
  ('bbq-lille', 'Camille', '4-8 ans', 5, 4, 4, 'Equipe très patiente, jeux bien expliqués et tables faciles à partager.'),
  ('bbq-lille', 'Nassim', '6-10 ans', 5, 4, 5, 'Bon plan pluie, on peut vraiment rester longtemps sans stress.'),
  ('citadelle', 'Lucie', '0-10 ans', 4, 4, 4, 'Grand espace, chemins praticables et beaucoup de pauses possibles.'),
  ('citadelle', 'Sarah', '2-6 ans', 4, 5, 4, 'Très pratique avec draisienne et poussette, surtout le matin.'),
  ('cafemome', 'Aline', '0-3 ans', 5, 4, 4, 'Petit mais vraiment accueillant, table à langer confirmée.'),
  ('cafemome', 'Jules', '1-4 ans', 4, 4, 3, 'Service sympa, mieux hors heure de pointe avec une poussette.'),
  ('lam', 'Marion', '5-10 ans', 5, 4, 4, 'Ateliers très adaptés, bonne circulation dans les salles.'),
  ('mediatheque-lomme', 'Inès', '2-8 ans', 4, 4, 3, 'Calme, lumineux, bon espace jeunesse.'),
  ('euralille', 'Amel', '0-6 ans', 3, 4, 4, 'Pratique en dépannage, attention aux heures très chargées.'),
  ('piscine-marx', 'Paul', '3-8 ans', 3, 3, 3, 'Bassin agréable, vestiaires parfois serrés avec enfants.'),
  ('ferme-marcel', 'Zoé', '1-8 ans', 5, 5, 4, 'Très vivant, parfait pour une sortie courte sans quitter Lille.');
