# Temipixel Invoice Maker

A single-page invoice app for Temipixel Design Studio — dashboard, client
database, invoice creator with an AI drafting assistant, service templates,
and a printable invoice preview. It's a static site (no backend, no build
step) that stores its data in the browser's `localStorage`.

## Files

```
index.html      Markup / page structure
style.css       All styling (Adire indigo / Kente gold theme, responsive)
app.js          All app logic (state, rendering, invoice math, AI parser)
vercel.json     Vercel config (clean URLs + basic security headers)
package.json    Optional npm scripts for local preview
.gitignore
```

## Run it locally

No build step needed.

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open the printed local URL. Or just double-click `index.html`.

---

## Push to GitHub

```bash
cd temipixel-invoice-maker
git init
git add .
git commit -m "Initial commit: Temipixel Invoice Maker"
git branch -M main
git remote add origin https://github.com/<your-username>/temipixel-invoice-maker.git
git push -u origin main
```

(Create the empty repo on GitHub first — no README/license, since this
folder already has one — then run the commands above.)

## Deploy to Vercel

**Option A — via the Vercel dashboard (no CLI):**
1. Push the repo to GitHub (above).
2. Go to vercel.com → **Add New… → Project** → import the GitHub repo.
3. Framework preset: choose **Other** (it's a static site — no build
   command or output directory needed).
4. Click **Deploy**. Vercel serves `index.html` at the project root.

**Option B — via the Vercel CLI:**
```bash
npm i -g vercel
cd temipixel-invoice-maker
vercel        # first deploy, follow the prompts
vercel --prod # promote to production
```

Either way, once deployed you'll get a `*.vercel.app` URL (and can attach
a custom domain from the Vercel dashboard's Domains tab).

---

## Notes

- **Storage**: everything (invoices, clients, templates, settings) is saved
  to `localStorage` under keys prefixed `tp_`. It's per-browser and
  per-device — it will not sync across devices or between your local copy
  and the deployed one. Use the print/download button on an invoice
  regularly if you want an off-device backup.
- **AI Invoice Assistant**: this is a lightweight, rule-based text parser
  built directly into `app.js` (see `parseInvoicePrompt`) — it does not call
  an external AI API, so nothing needs to be configured for it to work once
  deployed. It looks for currency amounts, percentages (e.g. "65% upfront"),
  and known service names, and never fills in a price it wasn't given. If
  you'd rather back it with a real LLM, swap `parseInvoicePrompt()`'s output
  for a call to an API of your choice and keep the field-filling logic that
  follows it in `runAiAssistant()` — you'd likely want that call to go
  through a small serverless function (e.g. a Vercel API route) rather than
  calling the API directly from the browser, so any API key stays off the
  client.
- **Logo**: uploaded as a data URL directly into `settings.logo`, so it's
  saved in `localStorage` along with everything else — no file storage or
  environment variables needed.
- **Printing invoices**: "Preview" → "Download / Print" opens the browser
  print dialog; choose "Save as PDF" as the destination.

## Recent fix

Typing into line-item fields (service name, qty, price, tax) previously
only accepted one keystroke at a time. That was caused by `updateItem()`
re-rendering the entire items table on every keystroke, which destroyed
and recreated the very `<input>` being typed into and threw away focus.
It's fixed to only patch the affected row's calculated total in place,
leaving the inputs untouched while typing.
