(function () {
  "use strict";

  // ---------- FR/Kirundi -> English glossary matching ----------
  const glossary = { dict: null, cache: new Map() };

  function stripDiacritics(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

  function baseKey(raw) {
    let s = stripDiacritics(String(raw).toUpperCase());
    s = s.replace(/[^A-Z0-9 ]+/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/(\d+)$/, "").trim();
    return s;
  }

  function splitSize(key) {
    const tokens = key.split(" ");
    const last = tokens[tokens.length - 1];
    if (["GRAND", "G"].includes(last) && tokens.length > 1) return { base: tokens.slice(0, -1).join(" "), size: "large" };
    if (["PETIT", "P", "PT"].includes(last) && tokens.length > 1) return { base: tokens.slice(0, -1).join(" "), size: "small" };
    return { base: key, size: null };
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  function fuzzyLookup(key) {
    if (!glossary.dict) return null;
    let best = null, bestDist = Infinity;
    for (const dictKey of Object.keys(glossary.dict)) {
      const threshold = dictKey.length <= 5 ? 1 : 2;
      const dist = levenshtein(key, dictKey);
      if (dist <= threshold && dist < bestDist) { best = dictKey; bestDist = dist; }
    }
    return best;
  }

  const STRIPPABLE_PREFIXES = ["EAU ", "JUS "];
  function stripKnownPrefix(key) {
    for (const p of STRIPPABLE_PREFIXES) {
      if (key.startsWith(p) && key.length > p.length) return key.slice(p.length);
    }
    return null;
  }

  function translateProductName(raw) {
    const original = String(raw).trim();
    if (glossary.cache.has(original)) return glossary.cache.get(original);

    const key = baseKey(original);
    const { base, size } = splitSize(key);
    const sizeSuffix = size === "large" ? " (large)" : size === "small" ? " (small)" : "";

    const candidates = [base, key];
    const strippedBase = stripKnownPrefix(base);
    const strippedKey = stripKnownPrefix(key);
    if (strippedBase) candidates.push(strippedBase);
    if (strippedKey) candidates.push(strippedKey);

    let result = null;
    for (const cand of candidates) {
      if (glossary.dict && glossary.dict[cand]) {
        const [en, confidence] = glossary.dict[cand];
        result = { text: en + (confidence === "brand" || confidence === "high" ? sizeSuffix : ""), confidence, original, groupKey: cand };
        break;
      }
    }
    if (!result) {
      let fuzzyKey = null;
      for (const cand of candidates) { fuzzyKey = fuzzyLookup(cand); if (fuzzyKey) break; }
      if (fuzzyKey) {
        const [en, confidence] = glossary.dict[fuzzyKey];
        const downgraded = confidence === "high" || confidence === "brand" ? "medium" : confidence;
        result = { text: en + sizeSuffix, confidence: downgraded, original, groupKey: fuzzyKey };
      } else {
        result = { text: original, confidence: "none", original, groupKey: base };
      }
    }
    glossary.cache.set(original, result);
    return result;
  }

  function renderTranslated(tr) {
    const isUncertain = tr.confidence === "medium" || tr.confidence === "low" || tr.confidence === "none";
    // The dictionary only translates FR/Kirundi -> English. In French UI mode,
    // the original text (already French/Kirundi) IS the display text, and the
    // English gloss becomes the optional "other version" shown by the toggle.
    const mainText = state.lang === "fr" ? tr.original : tr.text;
    const otherText = state.lang === "fr" ? tr.text : tr.original;
    const hasOther = mainText !== otherText;
    const cls = state.lang === "en" && isUncertain ? ' class="uncertain-term"' : "";
    const titleAttr = state.lang === "en" && isUncertain
      ? ` title="${tr.confidence === "none" ? "Not recognized — showing original text" : "Approximate translation, original: " + tr.original}"`
      : "";
    const suffix = state.showOriginal && hasOther ? ` <span class="orig-suffix">(${otherText})</span>` : "";
    return `<span${cls}${titleAttr}>${mainText}</span>${suffix}`;
  }

  function aggregateProducts(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const translated = translateProductName(r.product);
      const key = translated.groupKey;
      if (!map.has(key)) map.set(key, { key, quantities: [], cost: 0, revenue: 0, profit: 0, representativeOriginal: r.product });
      const g = map.get(key);
      g.cost += r.cost || 0;
      g.revenue += r.revenue || 0;
      g.profit += r.profit || 0;
      if (r.quantity) g.quantities.push(r.quantity);
    });
    return Array.from(map.values()).map((g) => {
      // Re-translate the bare group key for a clean English gloss (no stray
      // size suffix from whichever variant happened to be seen first), but
      // keep the real original-cased text for French-mode display.
      const clean = translateProductName(g.key);
      return {
        ...g,
        translated: { text: clean.text, confidence: clean.confidence, original: g.representativeOriginal, groupKey: g.key },
        quantityText: g.quantities.length ? g.quantities.join(" + ") : null,
      };
    });
  }

  // ---------- Translations ----------
  const TRANSLATIONS = {
    en: {
      allTimeLabel: "All-time totals, across every month recorded",
      demoBanner: "You're looking at example data. Edit the files in data/ and add your real months — see README.md.",
      kpiRevenue: "Total revenue",
      kpiGrossProfit: "Total gross profit",
      kpiNetProfit: "Total net profit",
      kpiReceivables: "Outstanding receivables",
      kpiRevenueMonth: "Revenue",
      kpiGrossProfitMonth: "Gross profit",
      kpiNetProfitMonth: "Net profit",
      marginLabel: (pct) => `${pct}% margin`,
      avgPerMonth: (v) => `avg ${v}/month`,
      asOfMonth: (m) => `as of ${m}`,
      vsPrevious: "vs previous month",
      trendTitle: "Revenue, expenses and profit over time",
      legendRevenue: "Revenue",
      legendExpenses: "Total expenses",
      legendNetProfit: "Net profit",
      recoveryTitle: "Investment recovery",
      invested: "Invested",
      recoveredSoFar: "Recovered so far",
      remaining: "Remaining",
      etaRecovered: "Investment fully recovered.",
      etaProjection: (avg, months) => `At the average net profit so far (${avg}/month), about ${months} more month${months === 1 ? "" : "s"} to fully recover the investment.`,
      etaNoProgress: "Average net profit so far is zero or negative, so payback can't be projected yet.",
      topProductsTitleAll: "Top products (all-time)",
      topProductsTitleMonth: (month) => `Top products — ${month}`,
      colProduct: "Product",
      colRevenue: "Revenue",
      colProfit: "Profit",
      noProducts: "No products logged yet.",
      expenseTitleAll: "Expense breakdown (all-time)",
      expenseTitleMonth: (month) => `Expense breakdown — ${month}`,
      noExpenses: "No expense categories logged yet.",
      reconcileWarning: (sum, stated) => `Heads up: these categories add up to ${sum}, but the total operating expenses recorded is ${stated}. Worth checking for a typo.`,
      historyTitle: "Full history",
      historyHint: "Every month you've entered, side by side",
      showAllMonths: "Show all months",
      hideAllMonths: "Hide all months",
      colMonth: "Month",
      colGrossProfit: "Gross profit",
      colGrossMargin: "Gross margin",
      colNetProfit: "Net profit",
      colNetMargin: "Net margin",
      colReceivables: "Receivables",
      footerNote: (bank, black) => `Figures in Burundian Francs (FBU). USD estimates use a bank rate of ${bank} FBU/$ and a black market rate of ${black} FBU/$.`,
      emptyNoData: "No monthly data yet. Add a row to data/summary.csv to get started (see README.md).",
      errorLoad: (msg) => `Could not load the dashboard data. ${msg}`,
      bank: "bank",
      blackMarket: "black market",
      showOriginalLabel: "Show both languages",
      tabOverview: "Overview",
      tabMonthly: "Monthly Detail",
      tabTrends: "Trends",
      tabInvestment: "Investment Recovery",
      tabProducts: "Products",
      tabPL: "Profit & Loss",
      tabExpenses: "Expenses",
      tabPurchases: "Purchases",
      trendsBigTitle: "Revenue, costs and profit — full breakdown",
      legendCogs: "Cost of goods sold",
      legendOpex: "Operating expenses",
      legendGrossProfit: "Gross profit",
      marginChartTitle: "Margins over time",
      legendGrossMargin: "Gross margin %",
      legendNetMargin: "Net margin %",
      expenseTrendTitle: "Expense categories over time",
      growthTableTitle: "Month-over-month growth",
      gMonth: "Month", gRevenue: "Revenue", gRevenueGrowth: "Growth",
      gGrossProfit: "Gross profit", gGrossProfitGrowth: "Growth",
      gNetProfit: "Net profit", gNetProfitGrowth: "Growth",
      firstMonthDash: "—",
      investmentHeroTitle: "Investment recovery",
      cumulativeChartTitle: "Cumulative profit vs. investment",
      legendCumulative: "Cumulative net profit",
      legendInvestmentLine: "Total investment",
      recoveryTableTitle: "Recovery by month",
      rMonth: "Month", rNetProfit: "Net profit", rCumulative: "Cumulative", rPctRecovered: "% of investment recovered",
      fullProductsTitle: "All products (all-time)",
      fpColMonth: "Month", fpColProduct: "Product", fpColQty: "Quantity", fpColCost: "Bought (cost)", fpColRevenue: "Sold for", fpColProfit: "Profit", fpColMargin: "Margin",
      qtyNotRecorded: "not recorded",
      notesTitle: "Notes for this month",
      notesHint: "Filled in at the end of each month, in data/notes.csv",
      workedTitle: "What worked",
      notWorkedTitle: "What didn't work",
      actionsTitle: "Actions for next month",
      noNotes: "No notes added for this month yet.",
      bestSellersTitle: "Top 10 best sellers overall",
      bestSellersHint: "Ranked by total revenue across every month recorded",
      bsColProduct: "Product", bsColQty: "Quantity", bsColCost: "Bought (cost)", bsColRevenue: "Sold for", bsColProfit: "Profit",
      plTitle: "Profit & Loss statement (all-time)",
      plTitleMonth: (month) => `Profit & Loss statement — ${month}`,
      plRevenueSection: "I. Revenue",
      plShopSales: "Shop sales revenue",
      plTotalRevenue: "TOTAL REVENUE",
      plExpenseSection: "II. Operating expenses",
      plCogs: "Cost of goods sold",
      plTotalExpenses: "TOTAL EXPENSES",
      plResultsSection: "III. Results",
      plGrossProfit: "GROSS PROFIT",
      plNetProfit: "NET PROFIT",
      plRoiSection: "IV. Return on investment",
      plInvestment: "Total investment",
      plNetProfitToDate: "Net profit to date",
      plNetProfitThisMonth: "Net profit this month",
      plCumulativeProfit: "Cumulative net profit to date",
      plMonthsToRecover: "Months to fully recover investment",
      plNotApplicable: "not yet, at this pace",
      expensesRegisterTitle: "Expenses register",
      expensesRegisterHint: "Every expense entry recorded, grouped by month",
      erColMonth: "Month", erColCategory: "Category", erColAmount: "Amount",
      erTotalForMonth: "Total",
      erGrandTotal: "GRAND TOTAL (all months)",
      erNoExpenses: "No expenses recorded for any month yet.",
      purchasesTitle: "Purchases register",
      purchasesHint: "Cost of goods per product batch, as recorded in your sales logs. Supplier and purchase date aren't tracked in your current reports.",
      prColMonth: "Month", prColProduct: "Product", prColQty: "Quantity", prColCost: "Amount spent",
      prNoPurchases: "No purchases recorded for any month yet.",
      equipmentBreakdownTitle: "Initial investment breakdown",
      equipmentBreakdownHint: "From your own expense records (DEPENSES sheet)",
      ebColItem: "Item", ebColAmount: "Amount",
      openingStockTitle: "Opening stock purchase",
      openingStockHint: "The initial bulk purchase made before Cycle 1, from the STOCK INITIAL sheet",
      osColProduct: "Product", osColQty: "Quantity", osColCost: "Amount spent",
      osTotalLabel: "Total opening stock",
      mProductsTitle: "Top products",
      mExpenseTitle: "Expense breakdown",
      mPlTitle: "Profit & Loss statement",
    },
    fr: {
      allTimeLabel: "Totaux cumulés, sur tous les mois enregistrés",
      demoBanner: "Vous voyez des données d'exemple. Modifiez les fichiers dans data/ et ajoutez vos vrais mois — voir README.md.",
      kpiRevenue: "Chiffre d'affaires total",
      kpiGrossProfit: "Bénéfice brut total",
      kpiNetProfit: "Bénéfice net total",
      kpiReceivables: "Créances à recouvrir",
      kpiRevenueMonth: "Chiffre d'affaires",
      kpiGrossProfitMonth: "Bénéfice brut",
      kpiNetProfitMonth: "Bénéfice net",
      marginLabel: (pct) => `marge de ${pct}%`,
      avgPerMonth: (v) => `moy. ${v}/mois`,
      asOfMonth: (m) => `au ${m}`,
      vsPrevious: "vs mois précédent",
      trendTitle: "Chiffre d'affaires, dépenses et bénéfice dans le temps",
      legendRevenue: "Chiffre d'affaires",
      legendExpenses: "Dépenses totales",
      legendNetProfit: "Bénéfice net",
      recoveryTitle: "Récupération de l'investissement",
      invested: "Investi",
      recoveredSoFar: "Récupéré jusqu'à présent",
      remaining: "Restant",
      etaRecovered: "Investissement entièrement récupéré.",
      etaProjection: (avg, months) => `Au rythme du bénéfice net moyen actuel (${avg}/mois), encore environ ${months} mois pour récupérer entièrement l'investissement.`,
      etaNoProgress: "Le bénéfice net moyen actuel est nul ou négatif ; la récupération ne peut pas encore être estimée.",
      topProductsTitleAll: "Meilleurs produits (toutes périodes)",
      topProductsTitleMonth: (month) => `Meilleurs produits — ${month}`,
      colProduct: "Produit", colRevenue: "Chiffre d'affaires", colProfit: "Bénéfice",
      noProducts: "Aucun produit enregistré pour l'instant.",
      expenseTitleAll: "Répartition des dépenses (toutes périodes)",
      expenseTitleMonth: (month) => `Répartition des dépenses — ${month}`,
      noExpenses: "Aucune catégorie de dépense enregistrée pour l'instant.",
      reconcileWarning: (sum, stated) => `Attention : ces catégories totalisent ${sum}, mais le total des dépenses d'exploitation enregistré est de ${stated}. Vérifiez s'il y a une erreur de saisie.`,
      historyTitle: "Historique complet",
      historyHint: "Tous les mois que vous avez saisis, côte à côte",
      showAllMonths: "Afficher tous les mois",
      hideAllMonths: "Masquer tous les mois",
      colMonth: "Mois", colGrossProfit: "Bénéfice brut", colGrossMargin: "Marge brute",
      colNetProfit: "Bénéfice net", colNetMargin: "Marge nette", colReceivables: "Créances",
      footerNote: (bank, black) => `Montants en Francs Burundais (FBU). Estimations en USD au taux bancaire de ${bank} FBU/$ et au taux du marché parallèle de ${black} FBU/$.`,
      emptyNoData: "Pas encore de données mensuelles. Ajoutez une ligne à data/summary.csv pour commencer (voir README.md).",
      errorLoad: (msg) => `Impossible de charger les données du tableau de bord. ${msg}`,
      bank: "banque",
      blackMarket: "marché parallèle",
      showOriginalLabel: "Afficher les deux langues",
      tabOverview: "Vue d'ensemble",
      tabMonthly: "Détail mensuel",
      tabTrends: "Tendances",
      tabInvestment: "Récupération de l'investissement",
      tabProducts: "Produits",
      tabPL: "Compte de résultats",
      tabExpenses: "Dépenses",
      tabPurchases: "Achats",
      trendsBigTitle: "Chiffre d'affaires, coûts et bénéfice — détail complet",
      legendCogs: "Coût des marchandises vendues",
      legendOpex: "Dépenses d'exploitation",
      legendGrossProfit: "Bénéfice brut",
      marginChartTitle: "Marges dans le temps",
      legendGrossMargin: "Marge brute %",
      legendNetMargin: "Marge nette %",
      expenseTrendTitle: "Catégories de dépenses dans le temps",
      growthTableTitle: "Croissance mois par mois",
      gMonth: "Mois", gRevenue: "Chiffre d'affaires", gRevenueGrowth: "Croissance",
      gGrossProfit: "Bénéfice brut", gGrossProfitGrowth: "Croissance",
      gNetProfit: "Bénéfice net", gNetProfitGrowth: "Croissance",
      firstMonthDash: "—",
      investmentHeroTitle: "Récupération de l'investissement",
      cumulativeChartTitle: "Bénéfice cumulé vs. investissement",
      legendCumulative: "Bénéfice net cumulé",
      legendInvestmentLine: "Investissement total",
      recoveryTableTitle: "Récupération par mois",
      rMonth: "Mois", rNetProfit: "Bénéfice net", rCumulative: "Cumulé", rPctRecovered: "% de l'investissement récupéré",
      fullProductsTitle: "Tous les produits (toutes périodes)",
      fpColMonth: "Mois", fpColProduct: "Produit", fpColQty: "Quantité", fpColCost: "Acheté (coût)", fpColRevenue: "Vendu pour", fpColProfit: "Bénéfice", fpColMargin: "Marge",
      qtyNotRecorded: "non enregistrée",
      notesTitle: "Notes pour ce mois",
      notesHint: "À remplir à la fin de chaque mois, dans data/notes.csv",
      workedTitle: "Ce qui a bien marché",
      notWorkedTitle: "Ce qui n'a pas marché",
      actionsTitle: "Actions pour le mois prochain",
      noNotes: "Aucune note ajoutée pour ce mois pour l'instant.",
      bestSellersTitle: "Top 10 des meilleures ventes (toutes périodes)",
      bestSellersHint: "Classé par chiffre d'affaires total sur tous les mois enregistrés",
      bsColProduct: "Produit", bsColQty: "Quantité", bsColCost: "Acheté (coût)", bsColRevenue: "Vendu pour", bsColProfit: "Bénéfice",
      plTitle: "Compte de résultats (toutes périodes)",
      plTitleMonth: (month) => `Compte de résultats — ${month}`,
      plRevenueSection: "I. Produits",
      plShopSales: "Chiffre d'affaires boutique",
      plTotalRevenue: "TOTAL PRODUITS",
      plExpenseSection: "II. Charges d'exploitation",
      plCogs: "Coût des marchandises vendues",
      plTotalExpenses: "TOTAL CHARGES",
      plResultsSection: "III. Résultats",
      plGrossProfit: "BÉNÉFICE BRUT",
      plNetProfit: "BÉNÉFICE NET",
      plRoiSection: "IV. Retour sur investissement",
      plInvestment: "Investissement total",
      plNetProfitToDate: "Bénéfice net à ce jour",
      plNetProfitThisMonth: "Bénéfice net ce mois",
      plCumulativeProfit: "Bénéfice net cumulé à ce jour",
      plMonthsToRecover: "Mois pour récupérer entièrement l'investissement",
      plNotApplicable: "pas encore, à ce rythme",
      expensesRegisterTitle: "Registre des dépenses",
      expensesRegisterHint: "Chaque dépense enregistrée, groupée par mois",
      erColMonth: "Mois", erColCategory: "Catégorie", erColAmount: "Montant",
      erTotalForMonth: "Total",
      erGrandTotal: "TOTAL GÉNÉRAL (tous les mois)",
      erNoExpenses: "Aucune dépense enregistrée pour aucun mois pour l'instant.",
      purchasesTitle: "Registre des achats",
      purchasesHint: "Coût des marchandises par lot de produit, tel qu'enregistré dans vos registres de ventes. Le fournisseur et la date d'achat ne sont pas suivis dans vos rapports actuels.",
      prColMonth: "Mois", prColProduct: "Produit", prColQty: "Quantité", prColCost: "Montant dépensé",
      prNoPurchases: "Aucun achat enregistré pour aucun mois pour l'instant.",
      equipmentBreakdownTitle: "Détail de l'investissement initial",
      equipmentBreakdownHint: "D'après vos propres registres de dépenses (feuille DEPENSES)",
      ebColItem: "Article", ebColAmount: "Montant",
      openingStockTitle: "Achat du stock initial",
      openingStockHint: "L'achat initial en gros effectué avant le Cycle 1, d'après la feuille STOCK INITIAL",
      osColProduct: "Produit", osColQty: "Quantité", osColCost: "Montant dépensé",
      osTotalLabel: "Total stock initial",
      mProductsTitle: "Meilleurs produits",
      mExpenseTitle: "Répartition des dépenses",
      mPlTitle: "Compte de résultats",
    },
  };

  const state = {
    config: null,
    summary: [],
    expenses: [],
    products: [],
    notes: [],
    initialStock: [],
    monthlyIndex: -1, // used only by the Monthly Detail tab
    chart: null,
    trendsBigChart: null,
    marginChart: null,
    expenseTrendChart: null,
    cumulativeChart: null,
    activeTab: "overview",
    lang: localStorage.getItem("dashboardLang") || "en",
    showOriginal: localStorage.getItem("dashboardShowOriginal") === "true",
  };

  function t(key, ...args) {
    const entry = TRANSLATIONS[state.lang][key];
    return typeof entry === "function" ? entry(...args) : entry;
  }

  function num(v) {
    const n = parseFloat(String(v).replace(/[, ]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function fmtFBU(n) { return Math.round(n).toLocaleString("en-US") + " FBU"; }
  function fmtUSD(n, rate) {
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.round(Math.abs(n) / rate).toLocaleString("en-US");
  }
  function dualUsd(n) {
    const r = state.config.exchangeRates;
    return `${fmtUSD(n, r.bankRateFbuPerUsd)} ${t("bank")} / ${fmtUSD(n, r.blackMarketRateFbuPerUsd)} ${t("blackMarket")}`;
  }
  function pct(n, digits = 1) { return (n >= 0 ? "+" : "") + n.toFixed(digits) + "%"; }

  function fetchText(url) {
    return fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("Could not load " + url);
      return r.text();
    });
  }
  function parseCsv(text) { return Papa.parse(text, { header: true, skipEmptyLines: true }).data; }

  function loadAll() {
    return Promise.all([
      fetchText("data/config.json").then((t) => JSON.parse(t)),
      fetchText("data/summary.csv").then(parseCsv),
      fetchText("data/expenses.csv").then(parseCsv),
      fetchText("data/products.csv").then(parseCsv),
      fetchText("data/dictionary.json").then((t) => JSON.parse(t)).catch(() => ({})),
      fetchText("data/notes.csv").then(parseCsv).catch(() => []),
      fetchText("data/initial_stock.csv").then(parseCsv).catch(() => []),
    ]).then(([config, summaryRaw, expensesRaw, productsRaw, dictionary, notesRaw, initialStockRaw]) => {
      state.config = config;
      glossary.dict = dictionary;

      state.summary = summaryRaw
        .filter((r) => r.month && r.month.trim())
        .map((r) => {
          const revenue = num(r.revenue);
          const cogs = num(r.cogs);
          const opex = num(r.operating_expenses);
          const grossProfit = revenue - cogs;
          const netProfit = grossProfit - opex;
          return {
            month: r.month.trim(), revenue, cogs, operating_expenses: opex,
            receivables: num(r.receivables), notes: r.notes || "",
            grossProfit, grossMargin: revenue ? (grossProfit / revenue) * 100 : 0,
            netProfit, netMargin: revenue ? (netProfit / revenue) * 100 : 0,
          };
        });

      let cum = 0;
      state.summary.forEach((row) => { cum += row.netProfit; row.cumulativeNetProfit = cum; });

      state.expenses = expensesRaw
        .filter((r) => r.month && r.category)
        .map((r) => ({ month: r.month.trim(), category: r.category.trim(), amount: num(r.amount) }));

      state.products = productsRaw
        .filter((r) => r.month && r.product)
        .map((r) => ({
          month: r.month.trim(), product: r.product.trim(),
          quantity: (r.quantity || "").trim(), cost: num(r.cost),
          revenue: num(r.revenue), profit: num(r.profit),
        }));

      const splitBullets = (s) => (s || "").split("|").map((x) => x.trim()).filter(Boolean);
      state.notes = (notesRaw || [])
        .filter((r) => r.month && r.month.trim())
        .map((r) => ({ month: r.month.trim(), worked: splitBullets(r.worked), notWorked: splitBullets(r.not_worked), actions: splitBullets(r.actions) }));

      state.initialStock = (initialStockRaw || [])
        .filter((r) => r.product && r.product.trim())
        .map((r) => ({ product: r.product.trim(), quantity: (r.quantity || "").trim(), cost: num(r.cost), listedPrice: num(r.listed_price) }));
    });
  }

  function isDemoMonth(m) { return /demo/i.test(m); }

  // ---------- Aggregate (all-time) helpers ----------
  function aggregateSummary() {
    const totalRevenue = state.summary.reduce((a, r) => a + r.revenue, 0);
    const totalCogs = state.summary.reduce((a, r) => a + r.cogs, 0);
    const totalOpex = state.summary.reduce((a, r) => a + r.operating_expenses, 0);
    const totalGrossProfit = totalRevenue - totalCogs;
    const totalNetProfit = totalGrossProfit - totalOpex;
    const n = state.summary.length || 1;
    return {
      totalRevenue, totalCogs, totalOpex, totalGrossProfit, totalNetProfit,
      grossMargin: totalRevenue ? (totalGrossProfit / totalRevenue) * 100 : 0,
      netMargin: totalRevenue ? (totalNetProfit / totalRevenue) * 100 : 0,
      avgRevenue: totalRevenue / n, avgGrossProfit: totalGrossProfit / n, avgNetProfit: totalNetProfit / n,
      latestReceivables: state.summary.length ? state.summary[state.summary.length - 1].receivables : 0,
      latestMonth: state.summary.length ? state.summary[state.summary.length - 1].month : "",
    };
  }

  // ---------- Static UI text ----------
  function renderStaticUI() {
    document.getElementById("allTimeLabel").textContent = t("allTimeLabel");
    document.getElementById("showOriginalLabel").textContent = t("showOriginalLabel");
    document.getElementById("demoBanner").textContent = t("demoBanner") || "";
    document.getElementById("tabBtnOverview").textContent = t("tabOverview");
    document.getElementById("tabBtnMonthly").textContent = t("tabMonthly");
    document.getElementById("tabBtnTrends").textContent = t("tabTrends");
    document.getElementById("tabBtnInvestment").textContent = t("tabInvestment");
    document.getElementById("tabBtnProducts").textContent = t("tabProducts");
    document.getElementById("tabBtnPL").textContent = t("tabPL");
    document.getElementById("tabBtnExpenses").textContent = t("tabExpenses");
    document.getElementById("tabBtnPurchases").textContent = t("tabPurchases");

    document.getElementById("trendPanelTitle").textContent = t("trendTitle");
    document.getElementById("recoveryPanelTitle").textContent = t("recoveryTitle");
    document.getElementById("recoveryInvestedLabel").textContent = t("invested") + ":";
    document.getElementById("recoveryRecoveredLabel").textContent = t("recoveredSoFar") + ":";
    document.getElementById("recoveryRemainingLabel").textContent = t("remaining") + ":";
    document.getElementById("productsTitle").textContent = t("topProductsTitleAll");
    document.getElementById("colProductHead").textContent = t("colProduct");
    document.getElementById("colRevenueHead").textContent = t("colRevenue");
    document.getElementById("colProfitHead").textContent = t("colProfit");
    document.getElementById("expenseTitle").textContent = t("expenseTitleAll");
    document.getElementById("historyTitle").textContent = t("historyTitle");
    document.getElementById("historyHint").textContent = t("historyHint");
    document.getElementById("historyToggle").textContent = document.getElementById("historyTableWrap").classList.contains("show") ? t("hideAllMonths") : t("showAllMonths");
    document.getElementById("hMonth").textContent = t("colMonth");
    document.getElementById("hRevenue").textContent = t("colRevenue");
    document.getElementById("hGrossProfit").textContent = t("colGrossProfit");
    document.getElementById("hGrossMargin").textContent = t("colGrossMargin");
    document.getElementById("hNetProfit").textContent = t("colNetProfit");
    document.getElementById("hNetMargin").textContent = t("colNetMargin");
    document.getElementById("hReceivables").textContent = t("colReceivables");

    document.getElementById("mProductsTitle").textContent = t("mProductsTitle");
    document.getElementById("mColProduct").textContent = t("colProduct");
    document.getElementById("mColRevenue").textContent = t("colRevenue");
    document.getElementById("mColProfit").textContent = t("colProfit");
    document.getElementById("mExpenseTitle").textContent = t("mExpenseTitle");
    document.getElementById("mPlTitle").textContent = t("mPlTitle");
    document.getElementById("notesTitle").textContent = t("notesTitle");
    document.getElementById("notesHint").textContent = t("notesHint");
    document.getElementById("workedTitle").textContent = t("workedTitle");
    document.getElementById("notWorkedTitle").textContent = t("notWorkedTitle");
    document.getElementById("actionsTitle").textContent = t("actionsTitle");

    document.getElementById("trendsBigTitle").textContent = t("trendsBigTitle");
    document.getElementById("marginChartTitle").textContent = t("marginChartTitle");
    document.getElementById("expenseTrendTitle").textContent = t("expenseTrendTitle");
    document.getElementById("growthTableTitle").textContent = t("growthTableTitle");
    document.getElementById("gMonth").textContent = t("gMonth");
    document.getElementById("gRevenue").textContent = t("gRevenue");
    document.getElementById("gRevenueGrowth").textContent = t("gRevenueGrowth");
    document.getElementById("gGrossProfit").textContent = t("gGrossProfit");
    document.getElementById("gGrossProfitGrowth").textContent = t("gGrossProfitGrowth");
    document.getElementById("gNetProfit").textContent = t("gNetProfit");
    document.getElementById("gNetProfitGrowth").textContent = t("gNetProfitGrowth");

    document.getElementById("investmentHeroTitle").textContent = t("investmentHeroTitle");
    document.getElementById("recoveryInvestedLabelBig").textContent = t("invested") + ":";
    document.getElementById("recoveryRecoveredLabelBig").textContent = t("recoveredSoFar") + ":";
    document.getElementById("recoveryRemainingLabelBig").textContent = t("remaining") + ":";
    document.getElementById("cumulativeChartTitle").textContent = t("cumulativeChartTitle");
    document.getElementById("recoveryTableTitle").textContent = t("recoveryTableTitle");
    document.getElementById("rMonth").textContent = t("rMonth");
    document.getElementById("equipmentBreakdownTitle").textContent = t("equipmentBreakdownTitle");
    document.getElementById("equipmentBreakdownHint").textContent = t("equipmentBreakdownHint");
    document.getElementById("ebColItem").textContent = t("ebColItem");
    document.getElementById("ebColAmount").textContent = t("ebColAmount");

    document.getElementById("bestSellersTitle").textContent = t("bestSellersTitle");
    document.getElementById("bestSellersHint").textContent = t("bestSellersHint");
    document.getElementById("bsColProduct").textContent = t("bsColProduct");
    document.getElementById("bsColQty").textContent = t("bsColQty");
    document.getElementById("bsColCost").textContent = t("bsColCost");
    document.getElementById("bsColRevenue").textContent = t("bsColRevenue");
    document.getElementById("bsColProfit").textContent = t("bsColProfit");
    document.getElementById("fullProductsTitle").textContent = t("fullProductsTitle");
    document.getElementById("fpColMonth").textContent = t("fpColMonth");
    document.getElementById("fpColProduct").textContent = t("fpColProduct");
    document.getElementById("fpColQty").textContent = t("fpColQty");
    document.getElementById("fpColCost").textContent = t("fpColCost");
    document.getElementById("fpColRevenue").textContent = t("fpColRevenue");
    document.getElementById("fpColProfit").textContent = t("fpColProfit");
    document.getElementById("fpColMargin").textContent = t("fpColMargin");

    document.getElementById("plTitle").textContent = t("plTitle");
    document.getElementById("expensesRegisterTitle").textContent = t("expensesRegisterTitle");
    document.getElementById("expensesRegisterHint").textContent = t("expensesRegisterHint");
    document.getElementById("erColMonth").textContent = t("erColMonth");
    document.getElementById("erColCategory").textContent = t("erColCategory");
    document.getElementById("erColAmount").textContent = t("erColAmount");
    document.getElementById("purchasesTitle").textContent = t("purchasesTitle");
    document.getElementById("purchasesHint").textContent = t("purchasesHint");
    document.getElementById("prColMonth").textContent = t("prColMonth");
    document.getElementById("prColProduct").textContent = t("prColProduct");
    document.getElementById("prColQty").textContent = t("prColQty");
    document.getElementById("prColCost").textContent = t("prColCost");
    document.getElementById("openingStockTitle").textContent = t("openingStockTitle");
    document.getElementById("openingStockHint").textContent = t("openingStockHint");
    document.getElementById("osColProduct").textContent = t("osColProduct");
    document.getElementById("osColQty").textContent = t("osColQty");
    document.getElementById("osColCost").textContent = t("osColCost");

    if (state.config) {
      const rate = state.config.exchangeRates;
      document.getElementById("footerNote").textContent = t("footerNote", rate.bankRateFbuPerUsd.toLocaleString("en-US"), rate.blackMarketRateFbuPerUsd.toLocaleString("en-US"));
    }
    document.querySelectorAll(".lang-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.lang === state.lang));
    document.documentElement.lang = state.lang;
  }

  function populateHeader() {
    document.getElementById("businessName").textContent = state.config.businessName;
    const anyDemo = state.summary.some((r) => isDemoMonth(r.month));
    document.getElementById("demoBanner").classList.toggle("show", anyDemo);
  }

  // ================= OVERVIEW TAB (aggregate) =================
  function renderOverviewKpis() {
    const agg = aggregateSummary();
    const kpiRow = document.getElementById("kpiRow");
    kpiRow.innerHTML = "";
    function kpiCard(label, valueFbu, subLine, warn) {
      const div = document.createElement("div");
      div.className = "kpi" + (warn ? " warn" : "");
      div.innerHTML = `
        <div class="label">${label}</div>
        <div class="value">${fmtFBU(valueFbu)}</div>
        <div class="usd">${dualUsd(valueFbu)}</div>
        <div class="delta up">${subLine}</div>
      `;
      kpiRow.appendChild(div);
    }
    kpiCard(t("kpiRevenue"), agg.totalRevenue, t("avgPerMonth", fmtFBU(agg.avgRevenue)));
    kpiCard(`${t("kpiGrossProfit")} (${t("marginLabel", agg.grossMargin.toFixed(1))})`, agg.totalGrossProfit, t("avgPerMonth", fmtFBU(agg.avgGrossProfit)));
    kpiCard(`${t("kpiNetProfit")} (${t("marginLabel", agg.netMargin.toFixed(1))})`, agg.totalNetProfit, t("avgPerMonth", fmtFBU(agg.avgNetProfit)), agg.totalNetProfit < 0);
    kpiCard(t("kpiReceivables"), agg.latestReceivables, t("asOfMonth", agg.latestMonth), agg.latestReceivables > 0);
  }

  function renderTrendChart() {
    const labels = state.summary.map((r) => r.month);
    const revenue = state.summary.map((r) => r.revenue);
    const expenses = state.summary.map((r) => r.cogs + r.operating_expenses);
    const netProfit = state.summary.map((r) => r.netProfit);
    const ctx = document.getElementById("trendChart").getContext("2d");
    if (state.chart) state.chart.destroy();
    state.chart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [
        { label: t("legendRevenue"), data: revenue, borderColor: "#1F4B3D", backgroundColor: "#1F4B3D", tension: 0.25, pointRadius: 3 },
        { label: t("legendExpenses"), data: expenses, borderColor: "#A64B3B", backgroundColor: "#A64B3B", tension: 0.25, pointRadius: 3 },
        { label: t("legendNetProfit"), data: netProfit, borderColor: "#B87E1F", backgroundColor: "#B87E1F", tension: 0.25, pointRadius: 3 },
      ]},
      options: {
        responsive: true, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" }, boxWidth: 12 } }, tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${fmtFBU(item.parsed.y)}` } } },
        scales: {
          y: { ticks: { callback: (v) => (v / 1000000).toFixed(1) + "M", font: { family: "IBM Plex Mono", size: 11 } }, grid: { color: "#DDDACA" } },
          x: { ticks: { font: { family: "Inter", size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  function renderRecoveryCard(pctEl, barEl, investedEl, recoveredEl, remainingEl, etaEl) {
    const invested = state.config.investment.totalInitialInvestmentFbu;
    const latest = state.summary.length ? state.summary[state.summary.length - 1] : null;
    const recovered = latest ? Math.max(0, latest.cumulativeNetProfit) : 0;
    const pctVal = invested > 0 ? Math.min(100, (recovered / invested) * 100) : 0;
    const remaining = Math.max(0, invested - recovered);
    document.getElementById(pctEl).textContent = pctVal.toFixed(1) + "%";
    document.getElementById(barEl).style.width = pctVal + "%";
    document.getElementById(investedEl).textContent = fmtFBU(invested);
    document.getElementById(recoveredEl).textContent = fmtFBU(recovered);
    document.getElementById(remainingEl).textContent = fmtFBU(remaining);
    const avgNet = state.summary.length ? state.summary.reduce((a, r) => a + r.netProfit, 0) / state.summary.length : 0;
    const etaElNode = document.getElementById(etaEl);
    if (remaining <= 0) etaElNode.textContent = t("etaRecovered");
    else if (avgNet > 0) etaElNode.textContent = t("etaProjection", fmtFBU(avgNet), Math.ceil(remaining / avgNet));
    else etaElNode.textContent = t("etaNoProgress");
  }

  function renderProductsList(tableSel, rows, showTranslatedRankStartAt1) {
    const tbody = document.querySelector(tableSel + " tbody");
    tbody.innerHTML = "";
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${t("noProducts")}</td></tr>`;
      return;
    }
    rows.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="rank">${i + 1}</td>
        <td>${renderTranslated(p.translated)}</td>
        <td class="num">${p.revenue ? fmtFBU(p.revenue) : "-"}</td>
        <td class="num">${fmtFBU(p.profit)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderExpenseList(listSel, warningSel, rows, statedTotal) {
    const list = document.getElementById(listSel);
    list.innerHTML = "";
    if (rows.length === 0) {
      list.innerHTML = `<div class="empty-state">${t("noExpenses")}</div>`;
    } else {
      const max = Math.max(...rows.map((r) => r.amount), 1);
      rows.forEach((r) => {
        const div = document.createElement("div");
        div.className = "expense-row";
        div.innerHTML = `
          <div class="cat">${renderTranslated(r.translated || translateProductName(r.category))}</div>
          <div class="expense-bar-track"><div class="expense-bar-fill" style="width:${(r.amount / max) * 100}%"></div></div>
          <div class="amt">${fmtFBU(r.amount)}</div>
        `;
        list.appendChild(div);
      });
    }
    const sum = rows.reduce((a, r) => a + r.amount, 0);
    const warnEl = document.getElementById(warningSel);
    if (rows.length > 0 && statedTotal !== null && Math.abs(sum - statedTotal) > 1) {
      warnEl.style.display = "block";
      warnEl.textContent = t("reconcileWarning", fmtFBU(sum), fmtFBU(statedTotal));
    } else {
      warnEl.style.display = "none";
    }
  }

  function aggregateExpenseCategories(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const translated = translateProductName(r.category);
      const key = translated.groupKey;
      if (!map.has(key)) map.set(key, { key, amount: 0, representativeOriginal: r.category });
      const g = map.get(key);
      g.amount += r.amount;
    });
    return Array.from(map.values())
      .map((g) => {
        const clean = translateProductName(g.key);
        return {
          category: g.key,
          amount: g.amount,
          translated: { text: clean.text, confidence: clean.confidence, original: g.representativeOriginal, groupKey: g.key },
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  function renderOverview() {
    renderOverviewKpis();
    renderTrendChart();
    renderRecoveryCard("recoveryPct", "recoveryBarFill", "recoveryInvested", "recoveryRecovered", "recoveryRemaining", "recoveryEta");
    const allProducts = aggregateProducts(state.products).sort((a, b) => b.profit - a.profit).slice(0, 8);
    renderProductsList("#productsTable", allProducts);
    const aggExpenses = aggregateExpenseCategories(state.expenses);
    const totalOpex = state.summary.reduce((a, r) => a + r.operating_expenses, 0);
    renderExpenseList("expenseList", "reconcileWarning", aggExpenses, totalOpex);
    renderHistory();
  }

  function renderHistory() {
    const tbody = document.querySelector("#historyTable tbody");
    tbody.innerHTML = "";
    state.summary.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.month}</td>
        <td class="num">${fmtFBU(r.revenue)}</td>
        <td class="num">${fmtFBU(r.grossProfit)}</td>
        <td class="num">${r.grossMargin.toFixed(1)}%</td>
        <td class="num">${fmtFBU(r.netProfit)}</td>
        <td class="num">${r.netMargin.toFixed(1)}%</td>
        <td class="num">${fmtFBU(r.receivables)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ================= MONTHLY DETAIL TAB =================
  function renderSubtabBar() {
    const bar = document.getElementById("subtabBar");
    bar.innerHTML = "";
    state.summary.forEach((r, i) => {
      const btn = document.createElement("button");
      btn.className = "subtab-btn" + (i === state.monthlyIndex ? " active" : "");
      btn.textContent = r.month;
      btn.addEventListener("click", () => {
        state.monthlyIndex = i;
        renderMonthlyDetail();
      });
      bar.appendChild(btn);
    });
  }

  function renderMonthlyDetail() {
    if (!state.summary.length) return;
    if (state.monthlyIndex < 0) state.monthlyIndex = state.summary.length - 1;
    renderSubtabBar();
    const row = state.summary[state.monthlyIndex];
    const prev = state.monthlyIndex > 0 ? state.summary[state.monthlyIndex - 1] : null;
    const month = row.month;

    const kpiRow = document.getElementById("mKpiRow");
    kpiRow.innerHTML = "";
    function kpiCard(label, valueFbu, deltaPctVsPrev, warn) {
      const div = document.createElement("div");
      div.className = "kpi" + (warn ? " warn" : "");
      let deltaHtml = "";
      if (deltaPctVsPrev !== null && isFinite(deltaPctVsPrev)) {
        const cls = deltaPctVsPrev >= 0 ? "up" : "down";
        deltaHtml = `<div class="delta ${cls}">${pct(deltaPctVsPrev)} ${t("vsPrevious")}</div>`;
      }
      div.innerHTML = `<div class="label">${label}</div><div class="value">${fmtFBU(valueFbu)}</div><div class="usd">${dualUsd(valueFbu)}</div>${deltaHtml}`;
      kpiRow.appendChild(div);
    }
    const revDelta = prev && prev.revenue ? ((row.revenue - prev.revenue) / prev.revenue) * 100 : null;
    const gpDelta = prev && prev.grossProfit ? ((row.grossProfit - prev.grossProfit) / Math.abs(prev.grossProfit)) * 100 : null;
    const npDelta = prev && prev.netProfit ? ((row.netProfit - prev.netProfit) / Math.abs(prev.netProfit)) * 100 : null;
    kpiCard(t("kpiRevenueMonth"), row.revenue, revDelta);
    kpiCard(`${t("kpiGrossProfitMonth")} (${t("marginLabel", row.grossMargin.toFixed(1))})`, row.grossProfit, gpDelta);
    kpiCard(`${t("kpiNetProfitMonth")} (${t("marginLabel", row.netMargin.toFixed(1))})`, row.netProfit, npDelta, row.netProfit < 0);
    kpiCard(t("kpiReceivables"), row.receivables, null, row.receivables > 0);

    document.getElementById("mProductsTitle").textContent = t("topProductsTitleMonth", month);
    const monthProducts = aggregateProducts(state.products.filter((p) => p.month === month)).sort((a, b) => b.profit - a.profit).slice(0, 8);
    renderProductsList("#mProductsTable", monthProducts);

    document.getElementById("mExpenseTitle").textContent = t("expenseTitleMonth", month);
    const monthExpenses = state.expenses.filter((e) => e.month === month).sort((a, b) => b.amount - a.amount);
    renderExpenseList("mExpenseList", "mReconcileWarning", monthExpenses, row.operating_expenses);

    document.getElementById("mPlTitle").textContent = t("plTitleMonth", month);
    renderPLStatement("#mPlTable", row, monthExpenses, false);

    const noteRow = state.notes.find((n) => n.month === month);
    function fillList(id, items) {
      const ul = document.getElementById(id);
      ul.innerHTML = "";
      if (!items || items.length === 0) { ul.innerHTML = `<div class="empty-state">${t("noNotes")}</div>`; return; }
      items.forEach((item) => { const li = document.createElement("li"); li.textContent = item; ul.appendChild(li); });
    }
    fillList("workedList", noteRow && noteRow.worked);
    fillList("notWorkedList", noteRow && noteRow.notWorked);
    fillList("actionsList", noteRow && noteRow.actions);
  }

  // ================= TRENDS TAB =================
  function renderTrendsTab() {
    if (state.activeTab !== "trends" || !state.summary.length) return;
    const labels = state.summary.map((r) => r.month);
    const ctx = document.getElementById("trendsBigChart").getContext("2d");
    if (state.trendsBigChart) state.trendsBigChart.destroy();
    state.trendsBigChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [
        { label: t("legendRevenue"), data: state.summary.map((r) => r.revenue), borderColor: "#1F4B3D", backgroundColor: "#1F4B3D", tension: 0.25, pointRadius: 3 },
        { label: t("legendCogs"), data: state.summary.map((r) => r.cogs), borderColor: "#8A8360", backgroundColor: "#8A8360", tension: 0.25, pointRadius: 3 },
        { label: t("legendOpex"), data: state.summary.map((r) => r.operating_expenses), borderColor: "#A64B3B", backgroundColor: "#A64B3B", tension: 0.25, pointRadius: 3 },
        { label: t("legendGrossProfit"), data: state.summary.map((r) => r.grossProfit), borderColor: "#2C5282", backgroundColor: "#2C5282", tension: 0.25, pointRadius: 3 },
        { label: t("legendNetProfit"), data: state.summary.map((r) => r.netProfit), borderColor: "#B87E1F", backgroundColor: "#B87E1F", tension: 0.25, pointRadius: 3, borderWidth: 3 },
      ]},
      options: {
        responsive: true, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" }, boxWidth: 12 } }, tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${fmtFBU(item.parsed.y)}` } } },
        scales: {
          y: { ticks: { callback: (v) => (v / 1000000).toFixed(1) + "M", font: { family: "IBM Plex Mono", size: 11 } }, grid: { color: "#DDDACA" } },
          x: { ticks: { font: { family: "Inter", size: 11 } }, grid: { display: false } },
        },
      },
    });

    const marginCtx = document.getElementById("marginChart").getContext("2d");
    if (state.marginChart) state.marginChart.destroy();
    state.marginChart = new Chart(marginCtx, {
      type: "line",
      data: { labels, datasets: [
        { label: t("legendGrossMargin"), data: state.summary.map((r) => r.grossMargin), borderColor: "#2C5282", backgroundColor: "#2C5282", tension: 0.25, pointRadius: 3 },
        { label: t("legendNetMargin"), data: state.summary.map((r) => r.netMargin), borderColor: "#B87E1F", backgroundColor: "#B87E1F", tension: 0.25, pointRadius: 3 },
      ]},
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" }, boxWidth: 12 } }, tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(1)}%` } } },
        scales: {
          y: { ticks: { callback: (v) => v + "%", font: { family: "IBM Plex Mono", size: 11 } }, grid: { color: "#DDDACA" } },
          x: { ticks: { font: { family: "Inter", size: 11 } }, grid: { display: false } },
        },
      },
    });

    const categories = [...new Set(state.expenses.map((e) => e.category))];
    const palette = ["#1F4B3D", "#A64B3B", "#B87E1F", "#2C5282", "#8A8360", "#6B4A17", "#4A7767"];
    const expenseDatasets = categories.map((cat, i) => ({
      label: renderTranslated(translateProductName(cat)).replace(/<[^>]+>/g, ""),
      data: state.summary.map((r) => { const row = state.expenses.find((e) => e.month === r.month && e.category === cat); return row ? row.amount : 0; }),
      backgroundColor: palette[i % palette.length],
    }));
    const expenseCtx = document.getElementById("expenseTrendChart").getContext("2d");
    if (state.expenseTrendChart) state.expenseTrendChart.destroy();
    state.expenseTrendChart = new Chart(expenseCtx, {
      type: "bar",
      data: { labels, datasets: expenseDatasets },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" }, boxWidth: 12 } }, tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${fmtFBU(item.parsed.y)}` } } },
        scales: {
          x: { stacked: true, ticks: { font: { family: "Inter", size: 11 } }, grid: { display: false } },
          y: { stacked: true, ticks: { callback: (v) => (v / 1000).toFixed(0) + "k", font: { family: "IBM Plex Mono", size: 11 } }, grid: { color: "#DDDACA" } },
        },
      },
    });

    const tbody = document.querySelector("#growthTable tbody");
    tbody.innerHTML = "";
    state.summary.forEach((r, i) => {
      const prev = i > 0 ? state.summary[i - 1] : null;
      const growth = (curr, prevVal) => (prev && prevVal ? pct(((curr - prevVal) / Math.abs(prevVal)) * 100) : t("firstMonthDash"));
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.month}</td>
        <td class="num">${fmtFBU(r.revenue)}</td><td class="num">${growth(r.revenue, prev && prev.revenue)}</td>
        <td class="num">${fmtFBU(r.grossProfit)}</td><td class="num">${growth(r.grossProfit, prev && prev.grossProfit)}</td>
        <td class="num">${fmtFBU(r.netProfit)}</td><td class="num">${growth(r.netProfit, prev && prev.netProfit)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ================= INVESTMENT TAB =================
  function renderInvestmentTab() {
    if (state.activeTab !== "investment" || !state.summary.length) return;
    renderRecoveryCard("recoveryPctBig", "recoveryBarFillBig", "recoveryInvestedBig", "recoveryRecoveredBig", "recoveryRemainingBig", "recoveryEtaBig");

    const invested = state.config.investment.totalInitialInvestmentFbu;
    const labels = state.summary.map((r) => r.month);
    const cumData = state.summary.map((r) => r.cumulativeNetProfit);
    const investmentLine = labels.map(() => invested);
    const ctx = document.getElementById("cumulativeChart").getContext("2d");
    if (state.cumulativeChart) state.cumulativeChart.destroy();
    state.cumulativeChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [
        { label: t("legendCumulative"), data: cumData, borderColor: "#1F4B3D", backgroundColor: "rgba(31,75,61,0.15)", fill: true, tension: 0.25, pointRadius: 3 },
        { label: t("legendInvestmentLine"), data: investmentLine, borderColor: "#A64B3B", borderDash: [6, 4], pointRadius: 0, fill: false },
      ]},
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" }, boxWidth: 12 } }, tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${fmtFBU(item.parsed.y)}` } } },
        scales: {
          y: { ticks: { callback: (v) => (v / 1000000).toFixed(1) + "M", font: { family: "IBM Plex Mono", size: 11 } }, grid: { color: "#DDDACA" } },
          x: { ticks: { font: { family: "Inter", size: 11 } }, grid: { display: false } },
        },
      },
    });

    const tbody = document.querySelector("#recoveryTable tbody");
    tbody.innerHTML = "";
    state.summary.forEach((r) => {
      const p = invested > 0 ? Math.min(100, (Math.max(0, r.cumulativeNetProfit) / invested) * 100) : 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.month}</td><td class="num">${fmtFBU(r.netProfit)}</td><td class="num">${fmtFBU(r.cumulativeNetProfit)}</td><td class="num">${p.toFixed(1)}%</td>`;
      tbody.appendChild(tr);
    });

    const breakdown = state.config.investment.equipmentBreakdown || [];
    const ebTbody = document.querySelector("#equipmentBreakdownTable tbody");
    ebTbody.innerHTML = "";
    breakdown.forEach((item) => {
      const tr = document.createElement("tr");
      const label = state.lang === "fr" ? item.fr : item.en;
      tr.innerHTML = `<td>${label}</td><td class="num">${fmtFBU(item.amount)}</td>`;
      ebTbody.appendChild(tr);
    });
    if (breakdown.length) {
      const totalTr = document.createElement("tr");
      const equipTotal = breakdown.reduce((a, i) => a + i.amount, 0);
      totalTr.innerHTML = `<td><strong>${state.lang === "fr" ? "Total équipement" : "Total equipment"}</strong></td><td class="num"><strong>${fmtFBU(equipTotal)}</strong></td>`;
      ebTbody.appendChild(totalTr);
    }
    const notesEl = document.getElementById("investmentNotesText");
    if (notesEl) notesEl.textContent = state.lang === "fr" ? (state.config.investment.notesFr || "") : (state.config.investment.notes || "");
  }

  // ================= PRODUCTS TAB (all-time) =================
  function renderProductsTab() {
    const allTime = aggregateProducts(state.products).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const bestTbody = document.querySelector("#bestSellersTable tbody");
    bestTbody.innerHTML = "";
    if (allTime.length === 0) {
      bestTbody.innerHTML = `<tr><td colspan="6" class="empty-state">${t("noProducts")}</td></tr>`;
    } else {
      allTime.forEach((p, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="rank">${i + 1}</td><td>${renderTranslated(p.translated)}</td>
          <td class="num">${p.quantityText || t("qtyNotRecorded")}</td>
          <td class="num">${p.cost ? fmtFBU(p.cost) : "-"}</td>
          <td class="num">${p.revenue ? fmtFBU(p.revenue) : "-"}</td>
          <td class="num">${fmtFBU(p.profit)}</td>
        `;
        bestTbody.appendChild(tr);
      });
    }

    const allRows = state.products.slice().sort((a, b) => b.profit - a.profit);
    const tbody = document.querySelector("#fullProductsTable tbody");
    tbody.innerHTML = "";
    if (allRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${t("noProducts")}</td></tr>`;
    } else {
      allRows.forEach((p, i) => {
        const tr = document.createElement("tr");
        const translated = translateProductName(p.product);
        const margin = p.revenue ? (p.profit / p.revenue) * 100 : null;
        tr.innerHTML = `
          <td class="rank">${i + 1}</td>
          <td>${p.month}</td>
          <td>${renderTranslated(translated)}</td>
          <td class="num">${p.quantity || t("qtyNotRecorded")}</td>
          <td class="num">${p.cost ? fmtFBU(p.cost) : "-"}</td>
          <td class="num">${p.revenue ? fmtFBU(p.revenue) : "-"}</td>
          <td class="num">${fmtFBU(p.profit)}</td>
          <td class="num">${margin !== null ? margin.toFixed(1) + "%" : "-"}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  // ================= PROFIT & LOSS (shared renderer) =================
  function plRow(cls, label, valueFbu) {
    const valHtml = valueFbu !== null && valueFbu !== undefined
      ? `<td class="num">${fmtFBU(valueFbu)}<div class="pl-note">${dualUsd(valueFbu)}</div></td>` : `<td></td>`;
    return `<tr class="${cls}"><td>${label}</td>${valHtml}</tr>`;
  }

  function renderPLStatement(tableSel, summaryLike, expenseRows, isAllTime) {
    const invested = state.config.investment.totalInitialInvestmentFbu;
    const cumulative = isAllTime
      ? (state.summary.length ? state.summary[state.summary.length - 1].cumulativeNetProfit : 0)
      : summaryLike.cumulativeNetProfit;
    const recovered = Math.max(0, cumulative);
    const remaining = Math.max(0, invested - recovered);
    const avgNet = state.summary.length ? state.summary.reduce((a, r) => a + r.netProfit, 0) / state.summary.length : 0;
    const monthsToRecover = remaining <= 0 ? 0 : avgNet > 0 ? Math.ceil(remaining / avgNet) : null;

    let html = "";
    html += `<tr class="pl-section"><td colspan="2">${t("plRevenueSection")}</td></tr>`;
    html += plRow("pl-line", t("plShopSales"), summaryLike.revenue);
    html += plRow("pl-subtotal", t("plTotalRevenue"), summaryLike.revenue);

    html += `<tr class="pl-section"><td colspan="2">${t("plExpenseSection")}</td></tr>`;
    html += plRow("pl-line", t("plCogs"), summaryLike.cogs);
    expenseRows.forEach((e) => { html += plRow("pl-line", renderTranslated(e.translated || translateProductName(e.category)), e.amount); });
    html += plRow("pl-subtotal", t("plTotalExpenses"), summaryLike.cogs + summaryLike.operating_expenses);

    html += `<tr class="pl-section"><td colspan="2">${t("plResultsSection")}</td></tr>`;
    const gm = summaryLike.revenue ? ((summaryLike.revenue - summaryLike.cogs) / summaryLike.revenue) * 100 : 0;
    const nm = summaryLike.revenue ? ((summaryLike.revenue - summaryLike.cogs - summaryLike.operating_expenses) / summaryLike.revenue) * 100 : 0;
    html += plRow("pl-line", `${t("plGrossProfit")} (${gm.toFixed(1)}%)`, summaryLike.revenue - summaryLike.cogs);
    html += plRow("pl-highlight", `${t("plNetProfit")} (${nm.toFixed(1)}%)`, summaryLike.revenue - summaryLike.cogs - summaryLike.operating_expenses);

    html += `<tr class="pl-section"><td colspan="2">${t("plRoiSection")}</td></tr>`;
    html += plRow("pl-line", t("plInvestment"), invested);
    html += plRow("pl-line", isAllTime ? t("plNetProfitToDate") : t("plNetProfitThisMonth"), summaryLike.revenue - summaryLike.cogs - summaryLike.operating_expenses);
    html += plRow("pl-line", t("plCumulativeProfit"), recovered);
    html += `<tr class="pl-subtotal"><td>${t("plMonthsToRecover")}</td><td class="num">${monthsToRecover === null ? t("plNotApplicable") : monthsToRecover}</td></tr>`;

    document.querySelector(tableSel + " tbody").innerHTML = html;
  }

  function renderPLTab() {
    if (!state.summary.length) return;
    const agg = aggregateSummary();
    const allExpenses = aggregateExpenseCategories(state.expenses);
    const combined = { revenue: agg.totalRevenue, cogs: agg.totalCogs, operating_expenses: agg.totalOpex };
    renderPLStatement("#plTable", combined, allExpenses, true);
  }

  // ================= EXPENSES TAB =================
  function renderExpensesTab() {
    const tbody = document.querySelector("#expensesRegisterTable tbody");
    tbody.innerHTML = "";
    if (!state.expenses.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-state">${t("erNoExpenses")}</td></tr>`;
      return;
    }
    let grandTotal = 0;
    state.summary.forEach((r) => {
      const rows = state.expenses.filter((e) => e.month === r.month);
      if (rows.length === 0) return;
      rows.forEach((e) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.month}</td><td>${renderTranslated(translateProductName(e.category))}</td><td class="num">${fmtFBU(e.amount)}</td>`;
        tbody.appendChild(tr);
      });
      const total = rows.reduce((a, e) => a + e.amount, 0);
      grandTotal += total;
      const totalTr = document.createElement("tr");
      totalTr.innerHTML = `<td></td><td><strong>${t("erTotalForMonth")}</strong></td><td class="num"><strong>${fmtFBU(total)}</strong></td>`;
      tbody.appendChild(totalTr);
    });
    const grandTr = document.createElement("tr");
    grandTr.innerHTML = `<td></td><td><strong>${t("erGrandTotal")}</strong></td><td class="num"><strong>${fmtFBU(grandTotal)}</strong></td>`;
    tbody.appendChild(grandTr);
  }

  // ================= PURCHASES TAB =================
  function renderPurchasesTab() {
    const osTbody = document.querySelector("#openingStockTable tbody");
    osTbody.innerHTML = "";
    if (state.initialStock.length) {
      state.initialStock.forEach((p) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${renderTranslated(translateProductName(p.product))}</td><td class="num">${p.quantity || t("qtyNotRecorded")}</td><td class="num">${fmtFBU(p.cost)}</td>`;
        osTbody.appendChild(tr);
      });
      const totalTr = document.createElement("tr");
      const total = state.initialStock.reduce((a, p) => a + p.cost, 0);
      totalTr.innerHTML = `<td><strong>${t("osTotalLabel")}</strong></td><td></td><td class="num"><strong>${fmtFBU(total)}</strong></td>`;
      osTbody.appendChild(totalTr);
    }

    const tbody = document.querySelector("#purchasesTable tbody");
    tbody.innerHTML = "";
    if (!state.products.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${t("prNoPurchases")}</td></tr>`;
      return;
    }
    let grandTotal = 0;
    state.summary.forEach((r) => {
      const rows = state.products.filter((p) => p.month === r.month).sort((a, b) => b.cost - a.cost);
      rows.forEach((p) => {
        grandTotal += p.cost;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.month}</td><td>${renderTranslated(translateProductName(p.product))}</td><td class="num">${p.quantity || t("qtyNotRecorded")}</td><td class="num">${fmtFBU(p.cost)}</td>`;
        tbody.appendChild(tr);
      });
    });
    const grandTr = document.createElement("tr");
    grandTr.innerHTML = `<td></td><td><strong>${state.lang === "fr" ? "TOTAL GÉNÉRAL" : "GRAND TOTAL"}</strong></td><td></td><td class="num"><strong>${fmtFBU(grandTotal)}</strong></td>`;
    tbody.appendChild(grandTr);
  }

  // ================= Tabs & wiring =================
  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === "panel-" + tabName));
    renderTrendsTab();
    renderInvestmentTab();
    if (tabName === "monthly") renderMonthlyDetail();
  }

  function renderAll() {
    renderStaticUI();
    renderOverview();
    renderTrendsTab();
    renderInvestmentTab();
    renderProductsTab();
    renderPLTab();
    renderExpensesTab();
    renderPurchasesTab();
    if (state.activeTab === "monthly") renderMonthlyDetail();
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  document.getElementById("historyToggle").addEventListener("click", () => {
    document.getElementById("historyTableWrap").classList.toggle("show");
    renderStaticUI();
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lang = btn.dataset.lang;
      localStorage.setItem("dashboardLang", state.lang);
      renderAll();
    });
  });

  const origToggle = document.getElementById("showOriginalToggle");
  if (origToggle) {
    origToggle.checked = state.showOriginal;
    origToggle.addEventListener("change", () => {
      state.showOriginal = origToggle.checked;
      localStorage.setItem("dashboardShowOriginal", String(state.showOriginal));
      renderAll();
    });
  }

  loadAll()
    .then(() => {
      if (state.summary.length === 0) {
        document.querySelector(".wrap").innerHTML = `<div class="empty-state">${t("emptyNoData")}</div>`;
        return;
      }
      populateHeader();
      state.monthlyIndex = state.summary.length - 1;
      renderAll();
    })
    .catch((err) => {
      console.error(err);
      document.querySelector(".wrap").innerHTML = `<div class="empty-state">${t("errorLoad", err.message)}</div>`;
    });
})();
