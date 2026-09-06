(function () {
  "use strict";

  // ---------- FR/Kirundi -> English glossary matching ----------
  const glossary = {
    dict: null, // loaded from data/dictionary.json
    cache: new Map(),
  };

  function stripDiacritics(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function baseKey(raw) {
    let s = stripDiacritics(String(raw).toUpperCase());
    s = s.replace(/[^A-Z0-9 ]+/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/(\d+)$/, "").trim(); // strip trailing qty/size digits
    return s;
  }

  // Detects a trailing size token (Grand/Petit or G/P/PT) and strips it separately,
  // so "KANDI PT" and "OMO DOFI G" still hit the base dictionary entry.
  function splitSize(key) {
    const tokens = key.split(" ");
    const last = tokens[tokens.length - 1];
    if (["GRAND", "G"].includes(last) && tokens.length > 1) {
      return { base: tokens.slice(0, -1).join(" "), size: "large" };
    }
    if (["PETIT", "P", "PT"].includes(last) && tokens.length > 1) {
      return { base: tokens.slice(0, -1).join(" "), size: "small" };
    }
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
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  function fuzzyLookup(key) {
    if (!glossary.dict) return null;
    let best = null;
    let bestDist = Infinity;
    for (const dictKey of Object.keys(glossary.dict)) {
      const threshold = dictKey.length <= 5 ? 1 : 2;
      const dist = levenshtein(key, dictKey);
      if (dist <= threshold && dist < bestDist) {
        best = dictKey;
        bestDist = dist;
      }
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

  // Returns { text, confidence: 'high'|'brand'|'medium'|'low'|'none', original }
  function translateProductName(raw) {
    const original = String(raw).trim();
    if (glossary.cache.has(original)) return glossary.cache.get(original);

    const key = baseKey(original);
    const { base, size } = splitSize(key);
    const sizeSuffix = size === "large" ? " (large)" : size === "small" ? " (small)" : "";

    // Build an ordered list of candidate keys to try: the size-stripped base,
    // the raw key, and both of those again with a leading EAU/JUS stripped.
    const candidates = [base, key];
    const strippedBase = stripKnownPrefix(base);
    const strippedKey = stripKnownPrefix(key);
    if (strippedBase) candidates.push(strippedBase);
    if (strippedKey) candidates.push(strippedKey);

    let result = null;
    for (const cand of candidates) {
      if (glossary.dict && glossary.dict[cand]) {
        const [en, confidence] = glossary.dict[cand];
        result = { text: en + (confidence === "brand" || confidence === "high" ? sizeSuffix : ""), confidence, original };
        break;
      }
    }

    if (!result) {
      let fuzzyKey = null;
      for (const cand of candidates) {
        fuzzyKey = fuzzyLookup(cand);
        if (fuzzyKey) break;
      }
      if (fuzzyKey) {
        const [en, confidence] = glossary.dict[fuzzyKey];
        const downgraded = confidence === "high" || confidence === "brand" ? "medium" : confidence;
        result = { text: en + sizeSuffix, confidence: downgraded, original };
      } else {
        result = { text: original, confidence: "none", original };
      }
    }
    glossary.cache.set(original, result);
    return result;
  }

  function renderTranslated(t) {
    const isUncertain = t.confidence === "medium" || t.confidence === "low" || t.confidence === "none";
    const cls = isUncertain ? ' class="uncertain-term"' : "";
    const titleAttr = isUncertain
      ? ` title="${t.confidence === "none" ? "Not recognized — showing original text" : "Approximate translation, original: " + t.original}"`
      : "";
    const showOriginal = state.showOriginal && t.text !== t.original;
    const suffix = showOriginal ? ` <span class="orig-suffix">(${t.original})</span>` : "";
    return `<span${cls}${titleAttr}>${t.text}</span>${suffix}`;
  }


  const TRANSLATIONS = {
    en: {
      month: "Month",
      editLink: "Update this month's data",
      demoBanner: "You're looking at example data. Edit the files in data/ and add your real months — see README.md.",
      kpiRevenue: "Revenue",
      kpiGrossProfit: "Gross profit",
      kpiNetProfit: "Net profit",
      kpiReceivables: "Outstanding receivables",
      marginLabel: (pct) => `${pct}% margin`,
      vsPrevious: "vs previous month",
      trendTitle: "Revenue, expenses and profit over time",
      legendRevenue: "Revenue",
      legendExpenses: "Total expenses",
      legendNetProfit: "Net profit",
      recoveryTitle: "Investment recovery",
      invested: "Invested",
      recoveredSoFar: "Recovered so far",
      remaining: "Remaining",
      etaRecovered: "Investment fully recovered as of this month.",
      etaProjection: (avg, months) =>
        `At the average net profit so far (${avg}/month), about ${months} more month${months === 1 ? "" : "s"} to fully recover the investment.`,
      etaNoProgress: "Average net profit so far is zero or negative, so payback can't be projected yet.",
      topProductsTitle: (month) => `Top products — ${month}`,
      colProduct: "Product",
      colRevenue: "Revenue",
      colProfit: "Profit",
      noProducts: "No products logged for this month yet.",
      expenseTitle: (month) => `Expense breakdown — ${month}`,
      noExpenses: "No expense categories logged for this month yet.",
      reconcileWarning: (sum, stated) =>
        `Heads up: these categories add up to ${sum}, but summary.csv lists operating expenses as ${stated} for this month. Worth checking for a typo.`,
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
      footerNote: (bank, black) =>
        `Figures in Burundian Francs (FBU). USD estimates use a bank rate of ${bank} FBU/$ and a black market rate of ${black} FBU/$.`,
      emptyNoData: "No monthly data yet. Add a row to data/summary.csv to get started (see README.md).",
      errorLoad: (msg) => `Could not load the dashboard data. ${msg}`,
      bank: "bank",
      blackMarket: "black market",
      showOriginalLabel: "Show original names",
    },
    fr: {
      month: "Mois",
      editLink: "Mettre à jour les données du mois",
      demoBanner: "Vous voyez des données d'exemple. Modifiez les fichiers dans data/ et ajoutez vos vrais mois — voir README.md.",
      kpiRevenue: "Chiffre d'affaires",
      kpiGrossProfit: "Bénéfice brut",
      kpiNetProfit: "Bénéfice net",
      kpiReceivables: "Créances à recouvrir",
      marginLabel: (pct) => `marge de ${pct}%`,
      vsPrevious: "vs mois précédent",
      trendTitle: "Chiffre d'affaires, dépenses et bénéfice dans le temps",
      legendRevenue: "Chiffre d'affaires",
      legendExpenses: "Dépenses totales",
      legendNetProfit: "Bénéfice net",
      recoveryTitle: "Récupération de l'investissement",
      invested: "Investi",
      recoveredSoFar: "Récupéré jusqu'à présent",
      remaining: "Restant",
      etaRecovered: "Investissement entièrement récupéré à ce mois-ci.",
      etaProjection: (avg, months) =>
        `Au rythme du bénéfice net moyen actuel (${avg}/mois), encore environ ${months} mois pour récupérer entièrement l'investissement.`,
      etaNoProgress: "Le bénéfice net moyen actuel est nul ou négatif ; la récupération ne peut pas encore être estimée.",
      topProductsTitle: (month) => `Meilleurs produits — ${month}`,
      colProduct: "Produit",
      colRevenue: "Chiffre d'affaires",
      colProfit: "Bénéfice",
      noProducts: "Aucun produit enregistré pour ce mois pour l'instant.",
      expenseTitle: (month) => `Répartition des dépenses — ${month}`,
      noExpenses: "Aucune catégorie de dépense enregistrée pour ce mois pour l'instant.",
      reconcileWarning: (sum, stated) =>
        `Attention : ces catégories totalisent ${sum}, mais summary.csv indique ${stated} pour les dépenses d'exploitation de ce mois. Vérifiez s'il y a une erreur de saisie.`,
      historyTitle: "Historique complet",
      historyHint: "Tous les mois que vous avez saisis, côte à côte",
      showAllMonths: "Afficher tous les mois",
      hideAllMonths: "Masquer tous les mois",
      colMonth: "Mois",
      colGrossProfit: "Bénéfice brut",
      colGrossMargin: "Marge brute",
      colNetProfit: "Bénéfice net",
      colNetMargin: "Marge nette",
      colReceivables: "Créances",
      footerNote: (bank, black) =>
        `Montants en Francs Burundais (FBU). Estimations en USD au taux bancaire de ${bank} FBU/$ et au taux du marché parallèle de ${black} FBU/$.`,
      emptyNoData: "Pas encore de données mensuelles. Ajoutez une ligne à data/summary.csv pour commencer (voir README.md).",
      errorLoad: (msg) => `Impossible de charger les données du tableau de bord. ${msg}`,
      bank: "banque",
      blackMarket: "marché parallèle",
      showOriginalLabel: "Afficher les noms d'origine",
    },
  };

  const state = {
    config: null,
    summary: [],
    expenses: [],
    products: [],
    selectedIndex: -1,
    chart: null,
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

  function fmtFBU(n) {
    return Math.round(n).toLocaleString("en-US") + " FBU";
  }
  function fmtUSD(n, rate) {
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.round(Math.abs(n) / rate).toLocaleString("en-US");
  }
  function dualUsd(n) {
    const r = state.config.exchangeRates;
    return `${fmtUSD(n, r.bankRateFbuPerUsd)} ${t("bank")} / ${fmtUSD(n, r.blackMarketRateFbuPerUsd)} ${t("blackMarket")}`;
  }
  function pct(n, digits = 1) {
    return (n >= 0 ? "+" : "") + n.toFixed(digits) + "%";
  }

  function fetchText(url) {
    return fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("Could not load " + url);
      return r.text();
    });
  }

  function parseCsv(text) {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    return result.data;
  }

  function loadAll() {
    return Promise.all([
      fetchText("data/config.json").then((t) => JSON.parse(t)),
      fetchText("data/summary.csv").then(parseCsv),
      fetchText("data/expenses.csv").then(parseCsv),
      fetchText("data/products.csv").then(parseCsv),
      fetchText("data/dictionary.json").then((t) => JSON.parse(t)).catch(() => ({})),
    ]).then(([config, summaryRaw, expensesRaw, productsRaw, dictionary]) => {
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
            month: r.month.trim(),
            revenue,
            cogs,
            operating_expenses: opex,
            receivables: num(r.receivables),
            notes: r.notes || "",
            grossProfit,
            grossMargin: revenue ? (grossProfit / revenue) * 100 : 0,
            netProfit,
            netMargin: revenue ? (netProfit / revenue) * 100 : 0,
          };
        });

      let cum = 0;
      state.summary.forEach((row) => {
        cum += row.netProfit;
        row.cumulativeNetProfit = cum;
      });

      state.expenses = expensesRaw
        .filter((r) => r.month && r.category)
        .map((r) => ({ month: r.month.trim(), category: r.category.trim(), amount: num(r.amount) }));

      state.products = productsRaw
        .filter((r) => r.month && r.product)
        .map((r) => ({
          month: r.month.trim(),
          product: r.product.trim(),
          revenue: num(r.revenue),
          profit: num(r.profit),
        }));
    });
  }

  function isDemoMonth(m) {
    return /demo/i.test(m);
  }

  function renderStaticUI() {
    document.getElementById("monthLabel").textContent = t("month");
    document.getElementById("editLink").textContent = t("editLink");
    document.getElementById("demoBanner").textContent = t("demoBanner");
    document.getElementById("trendPanelTitle").textContent = t("trendTitle");
    document.getElementById("recoveryPanelTitle").textContent = t("recoveryTitle");
    document.getElementById("recoveryInvestedLabel").textContent = t("invested") + ":";
    document.getElementById("recoveryRecoveredLabel").textContent = t("recoveredSoFar") + ":";
    document.getElementById("recoveryRemainingLabel").textContent = t("remaining") + ":";
    document.getElementById("colProductHead").textContent = t("colProduct");
    document.getElementById("colRevenueHead").textContent = t("colRevenue");
    document.getElementById("colProfitHead").textContent = t("colProfit");
    document.getElementById("historyTitle").textContent = t("historyTitle");
    document.getElementById("historyHint").textContent = t("historyHint");
    document.getElementById("historyToggle").textContent = document
      .getElementById("historyTableWrap")
      .classList.contains("show")
      ? t("hideAllMonths")
      : t("showAllMonths");
    document.getElementById("hMonth").textContent = t("colMonth");
    document.getElementById("hRevenue").textContent = t("colRevenue");
    document.getElementById("hGrossProfit").textContent = t("colGrossProfit");
    document.getElementById("hGrossMargin").textContent = t("colGrossMargin");
    document.getElementById("hNetProfit").textContent = t("colNetProfit");
    document.getElementById("hNetMargin").textContent = t("colNetMargin");
    document.getElementById("hReceivables").textContent = t("colReceivables");

    if (state.config) {
      const rate = state.config.exchangeRates;
      document.getElementById("footerNote").textContent = t(
        "footerNote",
        rate.bankRateFbuPerUsd.toLocaleString("en-US"),
        rate.blackMarketRateFbuPerUsd.toLocaleString("en-US")
      );
    }

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === state.lang);
    });
    document.documentElement.lang = state.lang;

    const origLabel = document.getElementById("showOriginalLabel");
    if (origLabel) origLabel.textContent = t("showOriginalLabel");
  }

  function populateHeader() {
    document.getElementById("businessName").textContent = state.config.businessName;
    const anyDemo = state.summary.some((r) => isDemoMonth(r.month));
    document.getElementById("demoBanner").classList.toggle("show", anyDemo);
  }

  function populateMonthSelect() {
    const sel = document.getElementById("monthSelect");
    const prevValue = sel.value;
    sel.innerHTML = "";
    state.summary.forEach((row, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = row.month;
      sel.appendChild(opt);
    });
    if (state.selectedIndex === -1) state.selectedIndex = state.summary.length - 1;
    sel.value = state.selectedIndex;
  }

  function updateEditLink() {
    const base = state.config.githubEditBaseUrl || "";
    document.getElementById("editLink").href = base ? base + "summary.csv" : "#";
  }

  function renderKpis() {
    const row = state.summary[state.selectedIndex];
    const prev = state.selectedIndex > 0 ? state.summary[state.selectedIndex - 1] : null;
    const kpiRow = document.getElementById("kpiRow");
    kpiRow.innerHTML = "";

    function kpiCard(label, valueFbu, deltaPctVsPrev, warn) {
      const div = document.createElement("div");
      div.className = "kpi" + (warn ? " warn" : "");
      let deltaHtml = "";
      if (deltaPctVsPrev !== null && isFinite(deltaPctVsPrev)) {
        const cls = deltaPctVsPrev >= 0 ? "up" : "down";
        deltaHtml = `<div class="delta ${cls}">${pct(deltaPctVsPrev)} ${t("vsPrevious")}</div>`;
      }
      div.innerHTML = `
        <div class="label">${label}</div>
        <div class="value">${fmtFBU(valueFbu)}</div>
        <div class="usd">${dualUsd(valueFbu)}</div>
        ${deltaHtml}
      `;
      kpiRow.appendChild(div);
    }

    const revDelta = prev && prev.revenue ? ((row.revenue - prev.revenue) / prev.revenue) * 100 : null;
    const gpDelta = prev && prev.grossProfit ? ((row.grossProfit - prev.grossProfit) / Math.abs(prev.grossProfit)) * 100 : null;
    const npDelta = prev && prev.netProfit ? ((row.netProfit - prev.netProfit) / Math.abs(prev.netProfit)) * 100 : null;

    kpiCard(t("kpiRevenue"), row.revenue, revDelta);
    kpiCard(`${t("kpiGrossProfit")} (${t("marginLabel", row.grossMargin.toFixed(1))})`, row.grossProfit, gpDelta);
    kpiCard(`${t("kpiNetProfit")} (${t("marginLabel", row.netMargin.toFixed(1))})`, row.netProfit, npDelta, row.netProfit < 0);
    kpiCard(t("kpiReceivables"), row.receivables, null, row.receivables > 0);
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
      data: {
        labels,
        datasets: [
          { label: t("legendRevenue"), data: revenue, borderColor: "#1F4B3D", backgroundColor: "#1F4B3D", tension: 0.25, pointRadius: 3 },
          { label: t("legendExpenses"), data: expenses, borderColor: "#A64B3B", backgroundColor: "#A64B3B", tension: 0.25, pointRadius: 3 },
          { label: t("legendNetProfit"), data: netProfit, borderColor: "#B87E1F", backgroundColor: "#B87E1F", tension: 0.25, pointRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { font: { family: "Inter" }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${fmtFBU(item.parsed.y)}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (v) => (v / 1000000).toFixed(1) + "M",
              font: { family: "IBM Plex Mono", size: 11 },
            },
            grid: { color: "#DDDACA" },
          },
          x: { ticks: { font: { family: "Inter", size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  function renderRecovery() {
    const row = state.summary[state.selectedIndex];
    const invested = state.config.investment.totalInitialInvestmentFbu;
    const recovered = Math.max(0, row.cumulativeNetProfit);
    const pctVal = invested > 0 ? Math.min(100, (recovered / invested) * 100) : 0;
    const remaining = Math.max(0, invested - recovered);

    document.getElementById("recoveryPct").textContent = pctVal.toFixed(1) + "%";
    document.getElementById("recoveryBarFill").style.width = pctVal + "%";
    document.getElementById("recoveryInvested").textContent = fmtFBU(invested);
    document.getElementById("recoveryRecovered").textContent = fmtFBU(recovered);
    document.getElementById("recoveryRemaining").textContent = fmtFBU(remaining);

    const monthsSoFar = state.summary.slice(0, state.selectedIndex + 1);
    const avgNet = monthsSoFar.reduce((a, r) => a + r.netProfit, 0) / monthsSoFar.length;
    const etaEl = document.getElementById("recoveryEta");
    if (remaining <= 0) {
      etaEl.textContent = t("etaRecovered");
    } else if (avgNet > 0) {
      const months = Math.ceil(remaining / avgNet);
      etaEl.textContent = t("etaProjection", fmtFBU(avgNet), months);
    } else {
      etaEl.textContent = t("etaNoProgress");
    }
  }

  function renderProducts() {
    const month = state.summary[state.selectedIndex].month;
    document.getElementById("productsTitle").textContent = t("topProductsTitle", month);
    const rows = state.products.filter((p) => p.month === month).sort((a, b) => b.profit - a.profit).slice(0, 8);
    const tbody = document.querySelector("#productsTable tbody");
    tbody.innerHTML = "";
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${t("noProducts")}</td></tr>`;
      return;
    }
    rows.forEach((p, i) => {
      const tr = document.createElement("tr");
      const translated = translateProductName(p.product);
      tr.innerHTML = `
        <td class="rank">${i + 1}</td>
        <td>${renderTranslated(translated)}</td>
        <td class="num">${p.revenue ? fmtFBU(p.revenue) : "-"}</td>
        <td class="num">${fmtFBU(p.profit)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderExpenses() {
    const row = state.summary[state.selectedIndex];
    const month = row.month;
    document.getElementById("expenseTitle").textContent = t("expenseTitle", month);
    const rows = state.expenses.filter((e) => e.month === month).sort((a, b) => b.amount - a.amount);
    const list = document.getElementById("expenseList");
    list.innerHTML = "";

    if (rows.length === 0) {
      list.innerHTML = `<div class="empty-state">${t("noExpenses")}</div>`;
    } else {
      const max = Math.max(...rows.map((r) => r.amount), 1);
      rows.forEach((r) => {
        const div = document.createElement("div");
        div.className = "expense-row";
        const translated = translateProductName(r.category);
        div.innerHTML = `
          <div class="cat">${renderTranslated(translated)}</div>
          <div class="expense-bar-track"><div class="expense-bar-fill" style="width:${(r.amount / max) * 100}%"></div></div>
          <div class="amt">${fmtFBU(r.amount)}</div>
        `;
        list.appendChild(div);
      });
    }

    const sum = rows.reduce((a, r) => a + r.amount, 0);
    const warnEl = document.getElementById("reconcileWarning");
    if (rows.length > 0 && Math.abs(sum - row.operating_expenses) > 1) {
      warnEl.style.display = "block";
      warnEl.textContent = t("reconcileWarning", fmtFBU(sum), fmtFBU(row.operating_expenses));
    } else {
      warnEl.style.display = "none";
    }
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

  function renderAll() {
    renderStaticUI();
    renderKpis();
    renderTrendChart();
    renderRecovery();
    renderProducts();
    renderExpenses();
    renderHistory();
  }

  document.getElementById("monthSelect").addEventListener("change", (e) => {
    state.selectedIndex = parseInt(e.target.value, 10);
    renderAll();
  });

  document.getElementById("historyToggle").addEventListener("click", () => {
    const wrap = document.getElementById("historyTableWrap");
    wrap.classList.toggle("show");
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
      populateMonthSelect();
      updateEditLink();
      renderAll();
    })
    .catch((err) => {
      console.error(err);
      document.querySelector(".wrap").innerHTML = `<div class="empty-state">${t("errorLoad", err.message)}</div>`;
    });
})();
