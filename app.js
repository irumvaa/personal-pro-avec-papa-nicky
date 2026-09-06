(function () {
  "use strict";

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
    ]).then(([config, summaryRaw, expensesRaw, productsRaw]) => {
      state.config = config;

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
      tr.innerHTML = `
        <td class="rank">${i + 1}</td>
        <td>${p.product}</td>
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
        div.innerHTML = `
          <div class="cat">${r.category}</div>
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
