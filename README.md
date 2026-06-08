# Kids Friendly Lille

React + Vite app for finding kid-friendly places around Lille.

## Environment

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Then fill:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-browser-key
```

Use only Supabase publishable/anon keys in Vite. Never expose `service_role` or `sb_secret_...` keys in browser code.

For Google Maps, create a browser key in Google Cloud and restrict it:

- Application restriction: HTTP referrers.
- Local dev referrers: `http://127.0.0.1:4177/*`, `http://localhost:4177/*`.
- Production referrer: your Netlify domain.
- API restrictions: Maps JavaScript API first, then Places API when the Places ingestion endpoint is added.

The app no longer accepts a Google Maps key through URL query params or localStorage.

## Supabase

In Supabase, enable **Authentication > Providers > Email**.

Apply the MVP database schema:

```bash
npx supabase link --project-ref nrybiythbezauvkcgpzd
npx supabase db push
```

The migration creates:

- `places`: base place data, including Google Places IDs/payload placeholders.
- `equipment_definitions`: concrete Kids Friendly criteria.
- `equipment_validations`: parent validations used for scoring.
- `reviews`: structured parent reviews.
- `favorites`: authenticated user favorites.
- `place_suggestions`: submitted places awaiting admin validation.
- `profiles`: reputation points and display names.
- `published_places_with_stats`: read model used by the app map.

Restart the dev server after changing `.env`:

```bash
npm run dev -- --port 4177
```
