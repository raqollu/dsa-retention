# DSA Retention

A minimal spaced-repetition dashboard for algorithms and data structures.

## What it does

- Schedules reviews at **D0, D1, D5, D7, D15, D25**.
- Keeps the algorithm hidden on review cards to train recognition rather than template recall.
- Tracks whether a review was solved independently, with a hint, or failed due to recognition / implementation / concept gaps.
- Stores review outcomes locally in the browser (`localStorage`).
- Keeps the canonical algorithm/problem catalog in `data/algorithms.json` so it can be updated by ChatGPT/GitHub without needing a backend.

## Run locally

Because the site fetches `data/algorithms.json`, serve it instead of double-clicking `index.html`:

```bash
cd dsa-retention
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

This is a static site and can be deployed directly with GitHub Pages, Cloudflare Pages, Netlify, or Vercel. No build step is required.

### GitHub Pages

1. Push these files to a repository.
2. Repository Settings → Pages.
3. Deploy from the `main` branch, root folder.

## How ChatGPT can populate it

The source of truth for algorithm/problem definitions is:

```text
data/algorithms.json
```

When you tell ChatGPT something like:

> I learned Segment Tree today.

ChatGPT can append a new algorithm entry containing:

- `learnedOn`
- mental model
- confidence / weaknesses
- D0 problems
- D1 / D5 / D7 / D15 / D25 review problems

The UI derives the dates automatically from `learnedOn`.

Review outcomes are kept local to the browser so updating `algorithms.json` does not overwrite your completion history.
