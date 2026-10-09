# Taste and Tales by Munni

Homemade cakes in Berlin. A fast static website built with Vite and hosted free on GitHub Pages.

- **Website:** https://shihabracs.github.io/taste-and-tales-by-munni/
- **Admin:** https://shihabracs.github.io/taste-and-tales-by-munni/admin/

## Features

- Pink vanilla look during the day, chocolate look in the evening, with a rotating hero slideshow (switch times set in admin)
- Interactive cake builder: flavor × size price list, extras, message on cake, live price, flavor photo changes with the selection
- Individual treats & savouries with quantities
- Time-based offer codes (e.g. `MORNING10` only works 06:00–11:00)
- Email popup that gives each visitor a personal one-time coupon
- Orders go to Facebook Messenger (or WhatsApp) with the full order already written
- Gallery carousel of real cakes with a full-screen view and "I want a cake like this"
- Admin panel to change prices, flavors, photos, gallery, offers, texts and coupons, with no database

## How it works

All content lives in [`src/data/site.json`](src/data/site.json). The admin panel edits that file through the GitHub API.
Every change to `main` is built and deployed automatically by [GitHub Actions](.github/workflows/deploy.yml), usually within a minute.

### Admin sign-in

The admin panel needs a GitHub fine-grained token:

1. Go to https://github.com/settings/personal-access-tokens/new
2. Repository access: **Only select repositories** → `taste-and-tales-by-munni`
3. Permissions: **Contents: Read and write**, **Actions: Read-only**
4. Paste the token in the admin page. It is stored only on that device.

### Personal coupons

A visitor's code is derived from their email (`MUNNI-XXXXXX`), so the same email always gets the same code and nothing has to be stored.
On the website a code only works with the email it was made for, and only once per device.
To make it fully one-time, open **Admin → Coupons**, check the code, and click **Mark as used** after the order. Used codes are then rejected everywhere.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173/
npm run build    # output in dist/
npm run preview  # serve the build at http://localhost:4173/
```

Preview a theme at any time with `?theme=day` or `?theme=evening`.
