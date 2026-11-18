-- The app's interface is now in English. New profiles default to US number and
-- date formatting, and existing profiles switch to it once, so month names and
-- dates are shown in English too. The Brazilian format (1.234,56) can still be
-- chosen in Settings → Number format.
alter table public.profiles alter column locale set default 'en-US';
update public.profiles set locale = 'en-US' where locale = 'pt-BR';
