// Supabase connection for accounts, reviews and photos. See supabase/README.md.
// Paste your values from Supabase → Project Settings → API (Data API / API Keys).
// The publishable ("anon") key is meant to be public: row-level security in setup.sql protects the data.
// Never put the secret / service_role key here.
// While these are empty the site works as before, just without accounts and reviews.
window.CE_CONFIG = {
  supabaseUrl: "",      // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",  // starts with "sb_publishable_" or "eyJ"
};
