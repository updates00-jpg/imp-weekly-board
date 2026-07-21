# IMP Weekly Board

Mobilna aplikacja PWA dla użytkowników `IMP-1`–`IMP-15`. Interfejs aplikacji jest w języku angielskim.

## Co zawiera

- logowanie numerem IMP i 6-cyfrowym PIN-em;
- widoki `Today`, `Week`, `My Tasks`;
- dodawanie, edycję, miękkie usuwanie i szybką zmianę statusu;
- przypisywanie wielu użytkowników;
- role `member` i `admin`;
- Supabase Auth, Postgres, RLS i Realtime;
- instalację na ekranie startowym Android/iPhone;
- automatyczne wdrożenie na GitHub Pages.

## Jak działa PIN

Użytkownik widzi wyłącznie `IMP-7` i PIN. Aplikacja technicznie mapuje login na ukryty adres `imp-7@imp-board.invalid` i używa Supabase Auth. Ten adres nie jest wyświetlany i nie służy do korespondencji.

PIN ma dokładnie 6 cyfr. Nie publikuj pliku `credentials.csv`.

## Stan konfiguracji Supabase

Jeżeli plik `supabase/schema.sql` został już wykonany i pojawił się komunikat `Success. No rows returned`, nie uruchamiaj go ponownie.

## 1. Klucze Supabase

W Supabase otwórz `Project Settings -> API Keys` i skopiuj:

- `Project URL`, np. `https://abcdefgh.supabase.co`;
- `Publishable key`, zaczynający się od `sb_publishable_`;
- `Secret key`, zaczynający się od `sb_secret_`.

`Publishable key` będzie używany w aplikacji i może znaleźć się w GitHub Secrets. `Secret key` jest kluczem uprzywilejowanym: używaj go wyłącznie lokalnie do tworzenia kont i resetowania PIN-ów. Nie umieszczaj go w kodzie frontendu ani w GitHub Pages.

## 2. Utwórz użytkowników IMP-1–IMP-15

Zainstaluj Node.js 22 LTS, rozpakuj projekt i otwórz terminal w katalogu zawierającym `package.json`.

```bash
npm install
```

### Windows PowerShell

```powershell
$env:SUPABASE_URL="https://TWOJ-PROJEKT.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_TUTAJ_PELNY_KLUCZ"
npm run create-users
```

### macOS / Linux

```bash
SUPABASE_URL="https://TWOJ-PROJEKT.supabase.co" \
SUPABASE_SECRET_KEY="sb_secret_TUTAJ_PELNY_KLUCZ" \
npm run create-users
```

Skrypt utworzy 15 kont i zapisze `credentials.csv`. Konta `IMP-1` i `IMP-2` otrzymają rolę `admin`, pozostałe rolę `member`.

Przechowaj PIN-y w bezpiecznym miejscu, przekaż je użytkownikom indywidualnie, a następnie usuń `credentials.csv`.

## 3. Test lokalny

Skopiuj `.env.example` jako `.env` i wpisz:

```env
VITE_SUPABASE_URL=https://TWOJ-PROJEKT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TUTAJ_PELNY_KLUCZ
VITE_LOGIN_DOMAIN=imp-board.invalid
```

Uruchom:

```bash
npm run dev
```

## 4. Publikacja na GitHub Pages

1. Utwórz repozytorium, np. `imp-weekly-board`.
2. Wgraj zawartość katalogu projektu — plik `package.json` musi znajdować się w głównym katalogu repozytorium.
3. Otwórz `Settings -> Secrets and variables -> Actions`.
4. Dodaj:
   - `VITE_SUPABASE_URL` — Project URL;
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — klucz `sb_publishable_...`.
5. Nie dodawaj `sb_secret_...` do GitHub.
6. Otwórz `Settings -> Pages` i jako `Source` wybierz `GitHub Actions`.
7. Wyślij pliki do gałęzi `main`.

Workflow `.github/workflows/deploy.yml` zbuduje i opublikuje aplikację.

## 5. Instalacja na telefonie

### Android / Chrome

Otwórz aplikację, menu przeglądarki, następnie `Install app` lub `Add to Home screen`.

### iPhone / Safari

Otwórz aplikację w Safari, wybierz `Share`, następnie `Add to Home Screen`.

## Reset PIN-u

### Windows PowerShell

```powershell
$env:SUPABASE_URL="https://TWOJ-PROJEKT.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_TUTAJ_PELNY_KLUCZ"
npm run reset-pin -- IMP-7 123456
```

Nowy PIN musi mieć dokładnie 6 cyfr.

## Bezpieczeństwo

- `sb_publishable_...` jest przeznaczony do aplikacji klienckiej; dostęp do danych ograniczają polityki RLS.
- `sb_secret_...` ma dostęp uprzywilejowany. Nie zapisuj go w `.env` używanym przez Vite, repozytorium ani GitHub Pages.
- Frontend nigdy nie otrzymuje klucza secret.


## Version 2.0

Tasks can be edited by tapping the task card or the explicit **Edit** button. The edit form supports title, description, date, times, owner, status, priority, and assigned users. Changes are saved to Supabase and synchronized through Realtime.

## v2.4 database migration

Before deploying v2.4, run `supabase/migration_v2_4.sql` once in Supabase Dashboard → SQL Editor.
It adds cross-midnight/multi-day task dates and the `leave_periods` table.

## v2.5 migration

Before deploying v2.5, run `supabase/migration_v2_5.sql` once in the Supabase SQL Editor. It adds the explicit `Task`, `Duty`, and `Stand By` entry types used by the weekly Board.
