-- Deals refresh 2026-10-19: all 18 existing deals re-checked and still valid; 3 new deals added.
begin;
update public.deals set last_checked = date '2026-10-19' where status in ('sourced', 'verified');
update public.deals set source_url = 'https://www.restaurantdive.com/news/cava-sea-sand-sun-spend-discount-tiers/802492/', source_date = '2025-10' where id = 17;
update public.deals set source_url = 'https://www.legalseafoods.com/whats-on/happy-hour/' where id = 18;
insert into public.deals (restaurant_id, type, description, source_url, source_date, status, last_checked) values
  (2,  'late-night', 'Late night, every night from 10pm: "The Last Call", steak frites plate + dirty martini for $24', 'https://www.aldenharlow.com/menus', 'current site', 'sourced', date '2026-10-19'),
  (53, 'rewards',    'WOW TIKKA Rewards: earn points on online orders, redeem for free food', 'https://www.wowtikka.com/', 'current site', 'sourced', date '2026-10-19'),
  (82, 'rewards',    'Santouka app: earn 5 points per visit, redeem for rewards (Back Bay participates)', 'https://santouka-usa.com/', 'current site', 'sourced', date '2026-10-19');
update public.restaurants set deal_check = 'deals' where id in (2, 53, 82);
commit;
select r.id, r.name, d.type, d.description, d.last_checked from public.deals d join public.restaurants r on r.id = d.restaurant_id where d.restaurant_id in (2, 53, 82) or d.id in (17, 18) order by d.id;
