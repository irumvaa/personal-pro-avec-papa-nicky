# Mini-Alimentation Dashboard

A simple dashboard to track how the mini-grocery store is doing each month:
revenue, profit, expenses, top products, and progress toward recovering the
initial investment. It reads three CSV files and one config file — no
database, no backend, just files you edit.

## How to update it every month

You never touch the HTML or JS. You only edit the files in the `data/`
folder. Do this straight on GitHub (works fine from your phone):

1. Go to the file on GitHub (e.g. `data/summary.csv`) and tap the pencil
   (edit) icon.
2. Add a **new row** at the bottom for the new month. Don't edit old rows
   unless you're fixing a mistake — the dashboard is built to keep every
   month you've ever added.
3. Tap "Commit changes." GitHub Pages rebuilds automatically within a
   minute or two.

That's it. The dashboard re-reads all rows every time it loads, so it
automatically grows as you add months. You never have to touch a formula
or a chart.

### `data/summary.csv` — one row per month

| column | what to put |
|---|---|
| `month` | A label like `August 2026`. This is what shows up everywhere. |
| `revenue` | Total sales for the month, in FBU. |
| `cogs` | Cost of the goods you sold (what you paid for the stock that sold), in FBU. |
| `operating_expenses` | Rent, electricity, transport, etc. — everything that isn't cost of goods. |
| `receivables` | Money owed to you that hasn't been collected yet, in FBU. |
| `notes` | Anything you want to remember about that month (optional). |

Gross profit, net profit, and margins are all calculated automatically —
you never enter those directly.

### `data/expenses.csv` — as many rows as you need per month

One row per expense category per month. Categories don't have to match
month to month — some months you'll have a "Salaries" line, some you
won't. Just add whatever categories that month actually had.

| column | what to put |
|---|---|
| `month` | Must match a `month` label from summary.csv exactly. |
| `category` | e.g. `Rent`, `Restocking`, `Electricity`, `Transport`. |
| `amount` | In FBU. |

Tip: the category amounts for a month should add up to that month's
`operating_expenses` in summary.csv. If they don't, the dashboard shows a
small warning so you can catch typos.

### `data/products.csv` — as many rows as you need per month

One row per product per month. Only list the products you want to track
(you don't need every single item in the store — the ones that matter
most to watch).

| column | what to put |
|---|---|
| `month` | Must match a `month` label from summary.csv exactly. |
| `product` | Product name, e.g. `Belle Saveur Water`. |
| `revenue` | What it sold for that month, in FBU (optional but nice to have). |
| `profit` | Profit from that product that month, in FBU. |

### `data/config.json` — rarely changes

Update this only when:
- The exchange rate moves meaningfully.
- You put more money into the business (update `totalInitialInvestmentFbu`).

## Deploying to GitHub Pages

1. Copy this whole `dashboard` folder into your
   `personal-pro-avec-papa-nicky` repository (or wherever you want to host
   it — you can rename the folder).
2. In the repo, go to **Settings → Pages**, and set the source to the
   branch and folder containing `index.html`.
3. GitHub gives you a URL like
   `https://irumvaa.github.io/personal-pro-avec-papa-nicky/` — bookmark it
   on your phone and laptop.
4. Every time you commit a change to a file in `data/`, the live page
   updates automatically within a minute or two.

## Removing the demo data

The two "Demo - Month 1" / "Demo - Month 2" rows in the CSV files are
placeholders so you can see the dashboard working and copy the exact
format. Delete them once you've added your first real month — the
dashboard shows a banner reminding you to do this as long as any row's
month name contains "Demo".
