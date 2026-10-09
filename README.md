# Taste and Tales by Munni

Homemade cakes in Berlin. A fast static website built with Vite and hosted free on Vercel.

- **Website:** https://taste-and-tales-by-munni.vercel.app/
- **Admin:** https://taste-and-tales-by-munni.vercel.app/admin

## Features

- Pink vanilla look during the day, chocolate look in the evening, with a rotating hero slideshow (switch times set in admin)
- Interactive cake builder: flavor × size price list, extras, message on cake, live price, flavor photo changes with the selection
- Individual treats & savouries with quantities
- Coupon codes you create in admin (percent off, on/off, optionally shown on the site)
- Email popup that gives each visitor a personal one-time coupon
- Orders go to Facebook Messenger (or WhatsApp) with the full order already written
- Gallery carousel of real cakes with a full-screen view and "I want a cake like this"
- Admin panel to change prices, flavors, photos, gallery, offers, texts and coupons, with no database

## How it works

All content lives in [`src/data/site.json`](src/data/site.json). The admin panel edits that file through the GitHub API.
Every change to `main` is built and deployed automatically by Vercel, usually within a minute.

### Admin sign-in

Add these environment variables in **Vercel → taste-and-tales-by-munni → Settings → Environment Variables** (environment: Production, mark them **Sensitive**):

| Name | Value |
| --- | --- |
| `ADMIN_USERNAME` | the admin username |
| `ADMIN_PASSWORD` | a long password (it protects the token below, so make it strong) |
| `ADMIN_GITHUB_TOKEN` (optional) | a fine-grained token: **Only select repositories** → `taste-and-tales-by-munni`, permissions **Contents: Read and write** and **Commit statuses: Read-only** ([create one](https://github.com/settings/personal-access-tokens/new)) |

Then redeploy (Deployments → ⋯ → Redeploy, or push any change). During the build the token is encrypted with a key derived from the username and password (PBKDF2, 600,000 rounds → AES-GCM); only the encrypted copy is published. Signing in with the right username and password unlocks it in the browser.

Without `ADMIN_GITHUB_TOKEN`, the admin asks for the token once after the first sign-in and keeps it on that device; the password is still asked every session. To change the password, update the variable and redeploy.

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
