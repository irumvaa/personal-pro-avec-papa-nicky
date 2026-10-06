# Mini-Alimentation Dashboard

**Live dashboard: https://irumvaa.github.io/personal-pro-avec-papa-nicky/**

A simple dashboard to track how the mini-grocery store is doing each month:
revenue, profit, expenses, top products, and progress toward recovering the
initial investment. It reads three CSV files and one config file — no
database, no backend, just files you edit.

## How to update it every month

Send the new monthly report to Claude. Claude reads it, adds the new cycle to the files in `data/`, checks the totals against the report, and pushes the update. GitHub Pages rebuilds the dashboard within a minute or two.

You can also edit the files in `data/` yourself on GitHub (works from a phone). Add a new row at the bottom and do not change old rows unless you are fixing a mistake.

### Data files

| file | what it holds |
|---|---|
| `summary.csv` | One row per cycle: `month` (label), `revenue`, `cogs` (cost of goods sold), `operating_expenses`, `receivables`, `notes`. Profits and margins are calculated. |
| `expenses.csv` | One row per expense per cycle: `month` (must match summary.csv), `category`, `amount`. |
| `products.csv` | One row per sale line: `month`, `product`, `quantity`, `cost`, `revenue`, `profit`. The same product repeated is merged automatically. |
| `cash.csv` | Cash on hand per cycle, as reported by the shop: `month`, `cash_on_hand`, `note`, `note_fr`. |
| `initial_stock.csv` | The opening stock purchase (from the STOCK INITIAL sheet). |
| `notes.csv` | What worked, what did not, actions, per cycle (optional). |
| `config.json` | Exchange rates, total investment and equipment breakdown, one-off sales (`oneOffs`), the concentration warning level (`concentrationWarnPct`) and the minimum sales for the margin ranking (`marginRankingMinRevenueFbu`). |
| `dictionary.json` | French/Kirundi to English translations (see below). |

### What the dashboard checks for you

- **Payback range**: best case (latest cycle's profit continues), all-time average, and a cautious case without the sales listed in `oneOffs`.
- **Sales concentration**: share of sales from the top 2 products, with a warning above the level in `config.json`.
- **Break-even sales**: operating costs divided by the gross margin.
- **Cash and working capital**: cash on hand and debts to recover, per cycle.
- **Margin ranking**: products ranked by margin, with high-volume, low-margin products marked.

### `data/dictionary.json` — the translation glossary

Product names and expense categories can be typed in French or Kirundi
exactly as your reports have them — the dashboard translates them to
English automatically when it displays them. It also understands common
typos and variants (`BAINGNE` vs `BAIGNE`, `SUCRE1` vs `SUCRE`, `EAU
AQUAVIE` vs `AQUAVIE`) using fuzzy matching, and strips size markers
(`G`/`GRAND`, `P`/`PT`/`PETIT`) automatically.

If a term isn't recognized, or the match is only approximate, the
dashboard shows it with a dotted underline — hover over it to see why.
Anything it can't match at all is shown in its original language rather
than guessed at. The "Show original names" checkbox next to the language
toggle reveals the original text next to every translated term, so you
can always double-check.

To add a new term or fix a wrong one, edit `data/dictionary.json`. Each
entry looks like:

```json
"SUCRE": ["Sugar", "high"]
```

The key is the term in capital letters (accents and punctuation don't
matter, the matcher normalizes them). The confidence level is one of:
`"high"` (a clear translation), `"brand"` (a brand name kept as-is with
a short description), `"medium"` or `"low"` (best guess — flagged in the
dashboard so you know to double check it).
