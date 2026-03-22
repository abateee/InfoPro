const { chromium } = require('playwright');
const fs = require('fs');
const pathModule = require('path');
const { toCsv, boolAsFlag } = require('./utils/filters');

/** Centralized DOM selectors for Infonet pages. Update when the site structure changes. */
const SELECTORS = {
  resultsTable: 'table tbody tr',
  companyLink: 'a[href*="/entreprises/"]',
  resultCells: 'td',
  pagination: 'nav[aria-label="Pagination"] li, nav[aria-label="Pagination"] a, nav[aria-label="Pagination"] span',
  companyPage: {
    documentLinks: [
      'a[href*="/kbis"]',
      'a[href*="/extrait"]',
      'a[href*="/document"]',
      'a[href*="/statut"]',
      'a[href*="/bilan"]',
      'a[href*="/acte"]',
      'a[href*="/annonce"]',
      'a[href*="/avis-situation"]',
      'a[href$=".pdf"]',
      'a[download]'
    ]
  },
  loginEmail: [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[id*="email" i]',
    'input[placeholder*="Email" i]',
    'input[autocomplete="email"]'
  ],
  loginPassword: [
    'input[type="password"]',
    'input[name*="password" i]',
    'input[id*="password" i]',
    'input[placeholder*="Mot de passe" i]',
    'input[autocomplete="current-password"]'
  ],
  loginSubmit: [
    'button:has-text("Se connecter")',
    'button[type="submit"]',
    'input[type="submit"]'
  ]
};

const SOCIAL_HOST_PATTERNS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'tiktok.com'
];
const EXCLUDED_WEBSITE_HOST_PATTERNS = [
  'infonet.fr',
  'avis-verifies.com',
  'google.com'
];

/**
 * Maps rawCells from a result row to structured fields. Infonet table column order may vary;
 * adjust indices when the site layout is known. Typical order: company name, SIREN, NAF, city, ...
 */
function mapRawCellsToRow(row) {
  const cells = row.rawCells || [];
  const out = { ...row };

  if (cells.length >= 3) {
    const fullCompany = String(cells[2] || '').trim();
    if (fullCompany && (!out.company || fullCompany.length > String(out.company || '').trim().length)) {
      out.company = fullCompany;
    }
  }

  if (!out.nafCode) {
    const nafCandidate = cells.find((cell) => /^[0-9A-Z]{4,5}[A-Z]?$/.test(String(cell || '').trim()));
    if (nafCandidate) {
      out.nafCode = String(nafCandidate).trim();
    }
  }

  const contactCell = String(cells[5] || '').trim();
  if (contactCell && !out.phone) {
    const phoneMatch = contactCell.match(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/);
    out.phone = phoneMatch ? phoneMatch[0].trim() : '';
  }

  if (contactCell && !out.email) {
    const emailMatch = contactCell.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    out.email = emailMatch ? emailMatch[0].trim() : '';
  }

  const locationCell = String(cells[7] || '').trim();
  if (locationCell && !out.department) {
    const departmentMatch = locationCell.match(/\b(\d{2,3})\b/);
    out.department = departmentMatch ? departmentMatch[1] : '';
  }
  return out;
}

const LIVE_FORM_FIELDS = [
  'search',
  'list',
  'tag',
  'apeCodes',
  'sirens',
  'sectorCodes',
  'postalCodes',
  'departments',
  'regionCodes',
  'statuses',
  'legalForms',
  'cities',
  'quotations',
  'riskNonPaymentsNormalized',
  'minSales',
  'maxSales',
  'minNetIncome',
  'maxNetIncome',
  'minDebts',
  'maxDebts',
  'minEquity',
  'maxEquity',
  'minSharedCapital',
  'maxSharedCapital',
  'minGrossMargin',
  'maxGrossMargin',
  'minSalariesAndExternalCharges',
  'maxSalariesAndExternalCharges',
  'minWorkingCapitalRequirement',
  'maxWorkingCapitalRequirement',
  'minCustomerPaymentDelay',
  'maxCustomerPaymentDelay',
  'minSupplierPaymentDelay',
  'maxSupplierPaymentDelay',
  'minWorkingCapital',
  'maxWorkingCapital',
  'minTreasury',
  'maxTreasury',
  'minDebtAfterOneYear',
  'maxDebtAfterOneYear',
  'minEbitda',
  'maxEbitda',
  'minIncomeTaxes',
  'maxIncomeTaxes',
  'minCreationDate',
  'maxCreationDate',
  'minBankOutstanding',
  'maxBankOutstanding',
  'minInventoryWorkInProgress',
  'maxInventoryWorkInProgress',
  'minValuation',
  'maxValuation',
  'collectiveProcedure',
  'staff',
  'minOfficerAge',
  'maxOfficerAge',
  'isActive',
  'isProfitable',
  'isRespectfulOfPaymentDelays',
  'hasPhoneNumber',
  'hasLinkedin',
  'hasEmail',
  'hasTwitter',
  'hasWebsite',
  'fromCreationDate',
  'toCreationDate',
  'fromClosingDate',
  'toClosingDate',
  'fromLastFinancialClosingDate',
  'toLastFinancialClosingDate',
  'inseeCategory',
  'sortBy',
  'sortOrder',
  'customColumnName',
  'limit',
  'page'
];

class InfonetBrowserClient {
  constructor(options) {
    this.baseUrl = String(options.baseUrl || 'https://infonet.fr').replace(/\/$/, '');
    this.email = String(options.email || '').trim();
    this.password = String(options.password || '').trim();
    this.headless = options.headless !== false;
    this.userAgent =
      String(options.userAgent || '').trim() ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    this.defaultLimit = Number(options.defaultLimit || 25);
    this.defaultMaxPages = Number(options.defaultMaxPages || 3);
    this.navTimeoutMs = Number(options.navTimeoutMs || 45000);

    this.browser = null;
    this.context = null;
    this.page = null;
    this.isAuthenticated = false;
    this.queue = Promise.resolve();
  }

  withLock(task) {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async ensureBrowser(forceRestart = false) {
    if (forceRestart) {
      await this.dispose();
    }

    if (this.browser && this.context && this.page) {
      return;
    }

    this.browser = await chromium.launch({
      headless: this.headless,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: 'fr-FR',
      userAgent: this.userAgent
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.navTimeoutMs);
    this.page.setDefaultNavigationTimeout(this.navTimeoutMs);
  }

  async dispose() {
    if (this.page) {
      await this.page.close().catch(() => undefined);
    }

    if (this.context) {
      await this.context.close().catch(() => undefined);
    }

    if (this.browser) {
      await this.browser.close().catch(() => undefined);
    }

    this.browser = null;
    this.context = null;
    this.page = null;
    this.isAuthenticated = false;
  }

  async dismissCookieBanner() {
    const labels = ['Continuer sans accepter', 'Accepter tout', 'Je choisis'];

    for (const label of labels) {
      const button = this.page.getByRole('button', { name: label }).first();
      const count = await button.count().catch(() => 0);
      if (count > 0) {
        await button.click({ timeout: 1500 }).catch(() => undefined);
        break;
      }
    }
  }

  async findFirstVisible(selectors, timeoutMs = 12000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      for (const selector of selectors) {
        const locator = this.page.locator(selector).first();
        const count = await locator.count().catch(() => 0);
        if (count === 0) {
          continue;
        }

        const visible = await locator.isVisible().catch(() => false);
        if (visible) {
          return locator;
        }
      }

      await this.page.waitForTimeout(250);
    }

    return null;
  }

  async ensureLoggedIn(force = false) {
    if (!this.email || !this.password) {
      throw new Error('Missing INFONET_EMAIL or INFONET_PASSWORD for auto login.');
    }

    await this.ensureBrowser(force);

    if (!force && this.isAuthenticated) {
      return;
    }

    await this.page.goto(`${this.baseUrl}/connexion/`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('load').catch(() => undefined);
    await this.dismissCookieBanner();

    const emailInput = await this.findFirstVisible(SELECTORS.loginEmail);
    const passInput = await this.findFirstVisible(SELECTORS.loginPassword);

    if (!emailInput || !passInput) {
      const title = await this.page.title().catch(() => '');
      const bodyText = (await this.page.locator('body').innerText().catch(() => '')).slice(0, 2000);
      const looksLikeChallenge = /challenge|captcha|robot|verifier|verification|waf/i.test(`${title} ${bodyText}`);

      if (looksLikeChallenge) {
        throw new Error('Login blocked by challenge/captcha. Retry in a few seconds.');
      }

      throw new Error('Login form not found on Infonet page.');
    }

    await emailInput.fill(this.email);
    await passInput.fill(this.password);

    const submit = await this.findFirstVisible(SELECTORS.loginSubmit);

    if (!submit) {
      throw new Error('Submit button not found on login form.');
    }

    await Promise.all([
      this.page.waitForLoadState('domcontentloaded').catch(() => undefined),
      submit.click()
    ]);

    await this.page.waitForTimeout(1500);

    const url = this.page.url();
    if (url.includes('/connexion')) {
      const bodyText = (await this.page.locator('body').innerText().catch(() => '')).slice(0, 2000);
      const looksLikeChallenge = /challenge|captcha|robot|verifier|verification|waf/i.test(bodyText);
      if (looksLikeChallenge) {
        throw new Error('Login blocked by challenge/captcha. Retry in a few seconds.');
      }

      throw new Error('Login failed. Check credentials.');
    }

    this.isAuthenticated = true;
  }

  buildPayload(filters) {
    const payload = {};

    for (const field of LIVE_FORM_FIELDS) {
      payload[field] = '';
    }

    const setValue = (key, value) => {
      const text = String(value || '').trim();
      if (text.length > 0) {
        payload[key] = text;
      }
    };

    setValue('search', filters.query);
    setValue('tag', toCsv(filters.tags));
    setValue('apeCodes', toCsv((filters.apeCodes || []).length ? filters.apeCodes : filters.nafCodes));
    setValue('sectorCodes', toCsv(filters.sectorCodes));
    setValue('postalCodes', toCsv(filters.postalCodes));
    setValue('departments', toCsv(filters.departments));
    setValue('regionCodes', toCsv(filters.regionCodes));
    setValue('statuses', toCsv(filters.statuses));
    setValue('legalForms', toCsv(filters.legalForms));
    setValue('cities', toCsv(filters.cities));
    setValue('sirens', toCsv(filters.sirens));
    setValue('staff', filters.staff);

    setValue('minSales', filters.minSales);
    setValue('maxSales', filters.maxSales);
    setValue('minNetIncome', filters.minNetIncome);
    setValue('maxNetIncome', filters.maxNetIncome);
    setValue('minOfficerAge', filters.minOfficerAge);
    setValue('maxOfficerAge', filters.maxOfficerAge);

    setValue('riskNonPaymentsNormalized', filters.riskNonPaymentsNormalized);
    setValue('quotations', filters.quotations);

    const isActive = boolAsFlag(filters.isActive);
    const isProfitable = boolAsFlag(filters.isProfitable);
    const hasWebsite = boolAsFlag(filters.hasWebsite);
    const hasEmail = boolAsFlag(filters.hasEmail);
    const hasLinkedin = boolAsFlag(filters.hasLinkedin);
    const hasPhoneNumber = boolAsFlag(filters.hasPhoneNumber);
    const hasTwitter = boolAsFlag(filters.hasTwitter);
    const isRespectful = boolAsFlag(filters.isRespectfulOfPaymentDelays);

    setValue('isActive', isActive || '1');
    setValue('isProfitable', isProfitable);
    setValue('hasWebsite', hasWebsite);
    setValue('hasEmail', hasEmail);
    setValue('hasLinkedin', hasLinkedin);
    setValue('hasPhoneNumber', hasPhoneNumber);
    setValue('hasTwitter', hasTwitter);
    setValue('isRespectfulOfPaymentDelays', isRespectful);

    setValue('fromCreationDate', filters.fromCreationDate);
    setValue('toCreationDate', filters.toCreationDate);

    const sortBy = String(filters.sortBy || 'sales').trim();
    const sortOrder = String(filters.sortOrder || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
    const customColumnName = String(filters.customColumnName || 'supplierPaymentDelay').trim();
    const limit = Number(filters.pageSize || filters.limit || this.defaultLimit);
    const page = Number(filters.page || 1);

    setValue('sortBy', sortBy);
    setValue('sortOrder', sortOrder);
    setValue('customColumnName', customColumnName || 'supplierPaymentDelay');
    setValue('limit', Number.isFinite(limit) && limit > 0 ? String(limit) : String(this.defaultLimit));
    setValue('page', Number.isFinite(page) && page > 1 ? String(page) : '');

    return payload;
  }

  async postFilters(payload) {
    await this.page.goto(`${this.baseUrl}/recherche-entreprises`, { waitUntil: 'domcontentloaded' });

    return this.page.evaluate(async (inputPayload) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(inputPayload)) {
        form.set(`company_search_engine[${key}]`, String(value || ''));
      }

      const response = await fetch('/recherche-entreprises/filters', {
        method: 'POST',
        body: form,
        credentials: 'include'
      });

      const text = await response.text();
      return {
        status: response.status,
        waf: response.headers.get('x-amzn-waf-action'),
        contentType: response.headers.get('content-type'),
        text
      };
    }, payload);
  }

  _isRetryableResponse(response) {
    if (!response) return false;
    const { status, waf } = response;
    if (status === 202 || waf === 'challenge') return true;
    if (status >= 502 && status <= 504) return true;
    return false;
  }

  async _postFiltersWithRetry(payload, maxAttempts = 3, backoffMs = 3000) {
    let lastResponse;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      lastResponse = await this.postFilters(payload);
      if (lastResponse.status >= 200 && lastResponse.status < 300) {
        return lastResponse;
      }
      if (!this._isRetryableResponse(lastResponse) || attempt === maxAttempts) {
        return lastResponse;
      }
      await this.page.waitForTimeout(backoffMs);
    }
    return lastResponse;
  }

  decodeHash(hash) {
    if (!hash) {
      return '';
    }

    try {
      return Buffer.from(hash, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }

  buildPageUrl(generatedUrl, pageNumber) {
    const full = new URL(generatedUrl, this.baseUrl);
    const parts = full.pathname.split('/').filter(Boolean);
    if (parts.length < 3) {
      return full.toString();
    }

    parts[1] = String(pageNumber);
    full.pathname = `/${parts.join('/')}`;
    return full.toString();
  }

  async scrapeResults(generatedUrl, maxPages) {
    const safeMaxPages = Number.isFinite(maxPages) && maxPages > 0 ? Math.min(maxPages, 20) : this.defaultMaxPages;
    const all = new Map();
    let totalPagesSeen = 1;

    for (let pageNumber = 1; pageNumber <= safeMaxPages; pageNumber += 1) {
      const url = this.buildPageUrl(generatedUrl, pageNumber);
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });

      if (this.page.url().includes('/connexion')) {
        throw new Error('Session expired while scraping results.');
      }

      const snapshot = await this.page.evaluate((sel) => {
        const rows = [];
        const rowNodes = Array.from(document.querySelectorAll(sel.resultsTable));

        for (const tr of rowNodes) {
          const companyLink = tr.querySelector(sel.companyLink);
          if (!companyLink) {
            continue;
          }

          const href = companyLink.getAttribute('href') || '';
          const company = (companyLink.textContent || '').replace(/\s+/g, ' ').trim();
          const siretMatch = href.match(/\/entreprises\/(\d{14})/);
          const cells = Array.from(tr.querySelectorAll(sel.resultCells)).map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());

          rows.push({
            company,
            href,
            siren: siretMatch ? String(siretMatch[1]).slice(0, 9) : '',
            siret: siretMatch ? siretMatch[1] : '',
            nafCode: '',
            city: '',
            tags: [],
            rawCells: cells
          });
        }

        const pageTexts = Array.from(document.querySelectorAll(sel.pagination))
          .map((el) => (el.textContent || '').trim())
          .map((t) => Number.parseInt(t, 10))
          .filter((n) => Number.isFinite(n));

        return {
          rows,
          totalPages: pageTexts.length ? Math.max(...pageTexts) : 1
        };
      }, {
        resultsTable: SELECTORS.resultsTable,
        companyLink: SELECTORS.companyLink,
        resultCells: SELECTORS.resultCells,
        pagination: SELECTORS.pagination
      });

      totalPagesSeen = Math.max(totalPagesSeen, snapshot.totalPages || 1);

      for (const row of snapshot.rows) {
        const href = row.href.startsWith('http') ? row.href : `${this.baseUrl}${row.href}`;
        const enriched = mapRawCellsToRow({ ...row, href });
        all.set(href, enriched);
      }

      if ((snapshot.rows || []).length === 0 || pageNumber >= totalPagesSeen) {
        break;
      }
    }

    return {
      items: Array.from(all.values()),
      scrapedPages: Math.min(safeMaxPages, totalPagesSeen),
      totalPagesSeen
    };
  }

  _isLikelyWebsiteUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
      return false;
    }

    try {
      const parsed = new URL(url);
      const host = (parsed.hostname || '').toLowerCase();
      const currentHost = new URL(this.baseUrl).hostname.toLowerCase();
      const path = (parsed.pathname || '').toLowerCase();

      if (!host || host === currentHost) {
        return false;
      }

      if (SOCIAL_HOST_PATTERNS.some((pattern) => host.includes(pattern))) {
        return false;
      }

      if (EXCLUDED_WEBSITE_HOST_PATTERNS.some((pattern) => host.includes(pattern))) {
        return false;
      }

      if (/\.(pdf|jpg|jpeg|png|webp|doc|docx|xls|xlsx)$/i.test(path)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  _extractEmail(bodyText, anchors) {
    const mailto = (anchors || []).find((anchor) => String(anchor.href || '').startsWith('mailto:'));
    if (mailto) {
      const email = String(mailto.href || '').replace(/^mailto:/i, '').trim();
      if (/@infonet\.fr$/i.test(email)) {
        return '';
      }
      return email;
    }

    const match = String(bodyText || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (!match || /@infonet\.fr$/i.test(match[0])) {
      return '';
    }
    return match[0].trim();
  }

  _extractPhone(bodyText, anchors) {
    const tel = (anchors || []).find((anchor) => String(anchor.href || '').startsWith('tel:'));
    if (tel) {
      return String(tel.href || '').replace(/^tel:/i, '').trim();
    }

    const match = String(bodyText || '').match(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/);
    return match ? match[0].trim() : '';
  }

  _extractWebsite(anchors) {
    const websiteAnchor = (anchors || []).find((anchor) => this._isLikelyWebsiteUrl(anchor.href));
    return websiteAnchor ? String(websiteAnchor.href || '').trim() : '';
  }

  _extractLabeledValue(labeledFields, labelPattern) {
    const entry = (labeledFields || []).find((field) => labelPattern.test(String(field.label || '').trim()));
    return entry ? String(entry.value || '').trim() : '';
  }

  async _collectCompanyDetails(companyUrl) {
    const fullUrl = companyUrl.startsWith('http') ? companyUrl : `${this.baseUrl}${companyUrl}`;
    await this.page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('load').catch(() => undefined);

    if (this.page.url().includes('/connexion')) {
      throw new Error('Session expired while enriching company page.');
    }

    const snapshot = await this.page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]')).map((anchor) => ({
        href: anchor.href || '',
        text: (anchor.textContent || '').replace(/\s+/g, ' ').trim()
      }));

      const labeledFields = Array.from(document.querySelectorAll('body *'))
        .map((element) => {
          const label = (element.textContent || '').replace(/\s+/g, ' ').trim();
          const next = element.nextElementSibling;
          const value = next ? (next.textContent || '').replace(/\s+/g, ' ').trim() : '';
          return { label, value };
        })
        .filter((entry) => entry.label && entry.value);

      const bodyText = (document.body && document.body.innerText)
        ? document.body.innerText.replace(/\s+/g, ' ').trim()
        : '';

      return { anchors, labeledFields, bodyText };
    });

    const labeledWebsite = this._extractLabeledValue(snapshot.labeledFields, /^site web$/i);
    const labeledEmail = this._extractLabeledValue(snapshot.labeledFields, /^email$/i);
    const website = labeledWebsite || this._extractWebsite(snapshot.anchors);
    const email = labeledEmail || this._extractEmail(snapshot.bodyText, snapshot.anchors);
    const phone = this._extractPhone(snapshot.bodyText, snapshot.anchors);

    return {
      website,
      email,
      phone,
      websiteStatus: website ? 'has_website' : 'no_website',
      confidence: website ? 'medium' : 'low'
    };
  }

  async enrichCompanyContacts(items, limit = 10) {
    return this.withLock(async () => {
      await this.ensureLoggedIn(false);

      const safeLimit = Math.max(0, Math.min(Number(limit || 0), (items || []).length));
      const enriched = [];

      for (let index = 0; index < (items || []).length; index += 1) {
        const item = items[index];

        if (!item || !item.href || index >= safeLimit) {
          enriched.push(item);
          continue;
        }

        try {
          const details = await this._collectCompanyDetails(item.href);
          enriched.push({
            ...item,
            phone: item.phone || details.phone,
            email: item.email || details.email,
            website: item.website || details.website,
            websiteStatus: details.website || item.website ? 'has_website' : (item.websiteStatus || details.websiteStatus),
            confidence: item.confidence && item.confidence !== 'low' ? item.confidence : details.confidence
          });
        } catch {
          enriched.push(item);
        }
      }

      return enriched;
    });
  }

  _sanitizeFolderName(name) {
    return String(name || 'unknown')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'unknown';
  }

  async downloadCompanyDocuments(companyUrl, companyName, siren, downloadDir) {
    return this.withLock(async () => {
      await this.ensureLoggedIn(false);

      const fullUrl = companyUrl.startsWith('http') ? companyUrl : `${this.baseUrl}${companyUrl}`;
      await this.page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
      await this.page.waitForLoadState('load').catch(() => undefined);

      if (this.page.url().includes('/connexion')) {
        throw new Error('Session expired while accessing company page.');
      }

      const docSelectors = SELECTORS.companyPage.documentLinks;
      const docLinks = await this.page.evaluate((selectors) => {
        const found = new Map();
        for (const sel of selectors) {
          const anchors = document.querySelectorAll(sel);
          for (const a of anchors) {
            const href = a.getAttribute('href');
            if (!href) continue;
            const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
            if (!found.has(href)) {
              found.set(href, text || href.split('/').pop() || 'document');
            }
          }
        }
        return Array.from(found.entries()).map(([href, label]) => ({ href, label }));
      }, docSelectors);

      if (docLinks.length === 0) {
        const fallbackLinks = await this.page.evaluate(() => {
          const found = new Map();
          const allAnchors = document.querySelectorAll('a[href]');
          const docPatterns = /kbis|extrait|document|statut|bilan|acte|annonce|avis|\.pdf/i;
          for (const a of allAnchors) {
            const href = a.getAttribute('href') || '';
            const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
            if (docPatterns.test(href) || docPatterns.test(text)) {
              if (!found.has(href)) {
                found.set(href, text || href.split('/').pop() || 'document');
              }
            }
          }
          return Array.from(found.entries()).map(([href, label]) => ({ href, label }));
        });
        docLinks.push(...fallbackLinks);
      }

      if (docLinks.length === 0) {
        return { ok: true, folder: '', count: 0, files: [], warning: 'No downloadable documents found on this company page.' };
      }

      const folderName = this._sanitizeFolderName(siren || companyName);
      const targetDir = pathModule.join(downloadDir, folderName);
      fs.mkdirSync(targetDir, { recursive: true });

      const savedFiles = [];
      for (const doc of docLinks) {
        try {
          const docUrl = doc.href.startsWith('http') ? doc.href : `${this.baseUrl}${doc.href}`;

          const linkLocator = this.page.locator(`a[href="${doc.href}"]`).first();
          const count = await linkLocator.count().catch(() => 0);

          let filePath;
          if (count > 0) {
            const [download] = await Promise.all([
              this.page.waitForEvent('download', { timeout: 30000 }),
              linkLocator.click()
            ]).catch(() => [null]);

            if (download) {
              const suggestedName = download.suggestedFilename() || this._filenameFromUrl(docUrl, doc.label);
              filePath = pathModule.join(targetDir, suggestedName);
              await download.saveAs(filePath);
              savedFiles.push(suggestedName);
              continue;
            }
          }

          const response = await this.page.request.get(docUrl);
          const contentType = response.headers()['content-type'] || '';
          const body = await response.body();

          if (body && body.length > 0 && !contentType.includes('text/html')) {
            const fileName = this._filenameFromUrl(docUrl, doc.label);
            filePath = pathModule.join(targetDir, fileName);
            fs.writeFileSync(filePath, body);
            savedFiles.push(fileName);
          }
        } catch (dlErr) {
          // skip individual failed downloads silently
        }
      }

      return {
        ok: true,
        folder: `downloads/${folderName}`,
        count: savedFiles.length,
        files: savedFiles
      };
    });
  }

  _filenameFromUrl(url, label) {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] || '';
      if (last.includes('.')) return this._sanitizeFolderName(last);
    } catch {}
    const safe = this._sanitizeFolderName(label || 'document');
    return safe.endsWith('.pdf') ? safe : safe + '.pdf';
  }

  async search(filters) {
    return this.withLock(async () => {
      await this.ensureLoggedIn(false);

      const payload = this.buildPayload(filters);

      let response = await this._postFiltersWithRetry(payload);
      const challenged = response.status === 202 || response.waf === 'challenge';

      if (challenged) {
        await this.ensureLoggedIn(true);
        response = await this._postFiltersWithRetry(payload);
      }

      if (response.status === 202 || response.waf === 'challenge') {
        throw new Error('Infonet challenge detected. Retry in a few seconds.');
      }

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Infonet filter error (${response.status}).`);
      }

      let json;
      try {
        json = JSON.parse(response.text || '{}');
      } catch {
        throw new Error('Unexpected /filters response format.');
      }

      if (!json.url) {
        throw new Error('Infonet did not return a result URL.');
      }

      const generatedUrl = new URL(json.url, this.baseUrl).toString();
      const decodedQuery = this.decodeHash(json.hash || '');
      const maxPages = Number(filters.maxPages || this.defaultMaxPages);
      const scraped = await this.scrapeResults(generatedUrl, maxPages);

      return {
        generatedUrl,
        hash: json.hash || null,
        decodedQuery,
        items: scraped.items,
        scrapedPages: scraped.scrapedPages,
        totalPagesSeen: scraped.totalPagesSeen
      };
    });
  }
}

module.exports = {
  InfonetBrowserClient
};
