# Restaurant data

`restaurants.json` and `restaurants.csv` hold the same list of restaurants in Cambridge and in Boston's Fenway and Back Bay. The website (`web/index.html`) shows this list.

Last updated: October 5, 2026. 102 restaurants.

## Fields

| Field | Meaning |
|---|---|
| `id` | Unique number for the restaurant |
| `name` | Restaurant name |
| `neighborhood` | Neighborhood, e.g. `Kendall Square`, `Fenway`, `Back Bay` |
| `cuisine` | Short cuisine label, e.g. `Japanese / Ramen` |
| `address` | Street address with city, state and ZIP |
| `zip` | 5-digit ZIP code (kept as text so leading zeros stay) |
| `price_range` | `$` under $15, `$$` $15–30, `$$$` $30–60, `$$$$` $60+ per person (typical guide ranges, not exact prices) |
| `lat`, `lng` | Approximate map position, estimated from the street address (not geocoded) |
| `source` | A public page used to check the restaurant exists at that address and is open (empty for the first 44 entries) |

## Where the data comes from

- **IDs 1–44:** the original Cambridge list. These entries don't have a recorded source yet.
- **IDs 45–102:** added October 5, 2026 from web research. Each one was checked against at least one public source (the restaurant's own site, Google/Yelp-style listings, delivery pages, Boston Magazine, The Infatuation, Boston.com, Cambridge Office for Tourism). Places reported closed or closing were left out.

Restaurants open and close often. Before relying on an entry, check its `source` link or the restaurant's own page. No deals are stored here yet.
