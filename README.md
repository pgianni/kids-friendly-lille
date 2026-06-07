# Kids Friendly Lille

React + Vite app for finding kid-friendly places around Lille.

## Supabase

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Then fill:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

In Supabase, enable **Authentication > Providers > Email**.

Restart the dev server after changing `.env`:

```bash
npm run dev -- --port 4177
```
