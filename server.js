'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { AVAILABLE_PROVIDERS, createSearchEngine } = require('./src/searchEngine');
const { LeadStore } = require('./src/leadStore');
const { toList, toString, toCheckedOrEmpty, numberOrDefault } = require('./src/utils/filters');
const { logger } = require('./src/utils/logger');
const { validateInfonetConfig } = require('./src/utils/config');
const { validateFilters } = require('./src/utils/validateFilters');

dotenv.config();

validateInfonetConfig();

const app = express();
const port = Number(process.env.PORT || 3010);
const searchEngine = createSearchEngine();
const downloadClient = searchEngine.infonetClient;
const leadStore = new LeadStore({
  baseDir: path.join(__dirname, 'sans site')
});
const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 120000);
const isProduction = process.env.NODE_ENV === 'production';
const rateLimitDisabled = process.env.RATE_LIMIT_DISABLED === '1' || process.env.RATE_LIMIT_DISABLED === 'true';

function buildSearchFilters(body = {}) {
  return {
    query: toString(body.query),
    nafCodes: toList(body.nafCodes),
    apeCodes: toList(body.apeCodes),
    tags: toList(body.tags),
    cities: toList(body.cities),
    postalCodes: toList(body.postalCodes),
    departments: toList(body.departments),
    legalForms: toList(body.legalForms),
    statuses: toList(body.statuses),
    sectorCodes: toList(body.sectorCodes),
    artisanMetierIds: toList(body.artisanMetierIds),
    artisanActivityIds: toList(body.artisanActivityIds),
    artisanCityIds: toList(body.artisanCityIds),
    artisanDepartments: toList(body.artisanDepartments),
    staff: toString(body.staff),
    minSales: toString(body.minSales),
    maxSales: toString(body.maxSales),
    minNetIncome: toString(body.minNetIncome),
    maxNetIncome: toString(body.maxNetIncome),
    minOfficerAge: toString(body.minOfficerAge),
    maxOfficerAge: toString(body.maxOfficerAge),
    fromCreationDate: toString(body.fromCreationDate),
    toCreationDate: toString(body.toCreationDate),
    riskNonPaymentsNormalized: toString(body.riskNonPaymentsNormalized),
    quotations: toString(body.quotations),
    isActive: toCheckedOrEmpty(body.isActive),
    isProfitable: toCheckedOrEmpty(body.isProfitable),
    providers: toList(body.providers),
    artisanAutoPhone:
      body.artisanAutoPhone === undefined ? true : toCheckedOrEmpty(body.artisanAutoPhone),
    artisanDetailLimit: numberOrDefault(
      body.artisanDetailLimit,
      process.env.ARTISAN_DETAIL_LIMIT || 10
    ),
    artisanPhoneLimit: numberOrDefault(
      body.artisanPhoneLimit,
      process.env.ARTISAN_PHONE_LIMIT || 10
    ),
    websiteStatus: toString(body.websiteStatus),
    hasWebsite: toCheckedOrEmpty(body.hasWebsite),
    hasEmail: toCheckedOrEmpty(body.hasEmail),
    hasLinkedin: toCheckedOrEmpty(body.hasLinkedin),
    hasPhoneNumber: toCheckedOrEmpty(body.hasPhoneNumber),
    hasTwitter: toCheckedOrEmpty(body.hasTwitter),
    includeContactEnrichment: toCheckedOrEmpty(body.includeContactEnrichment),
    isRespectfulOfPaymentDelays: toCheckedOrEmpty(body.isRespectfulOfPaymentDelays),
    sortBy: toString(body.sortBy) || 'sales',
    sortOrder: toString(body.sortOrder) || 'desc',
    page: Number(body.page || 1),
    pageSize: Number(body.pageSize || 25),
    maxPages: Number(body.maxPages || process.env.INFONET_MAX_PAGES || 3)
  };
}

function searchRequestError(body, filters) {
  const providersProvided = Object.prototype.hasOwnProperty.call(body || {}, 'providers');
  if (providersProvided && filters.providers.length === 0) {
    return 'Select at least one provider.';
  }

  const invalidProviders = filters.providers.filter((provider) => !AVAILABLE_PROVIDERS.includes(provider));
  if (invalidProviders.length > 0) {
    return `Invalid provider(s): ${invalidProviders.join(', ')}.`;
  }

  const validation = validateFilters(filters);
  return validation.valid ? '' : validation.error;
}

app.use(express.json({ limit: '1mb' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && Object.prototype.hasOwnProperty.call(error, 'body')) {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }
  next(error);
});
app.use(express.static(path.join(__dirname, 'public')));

let searchLimiter = null;
if (!rateLimitDisabled) {
  searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 10),
    message: { error: 'Too many requests. Try again in a minute.' },
    standardHeaders: true,
    skip: (req) => {
      try {
        const filters = buildSearchFilters(req.body || {});
        return !!searchRequestError(req.body || {}, filters);
      } catch {
        return true;
      }
    }
  });
  app.use('/api/download-company-docs', rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 10),
    message: { error: 'Too many requests. Try again in a minute.' },
    standardHeaders: true
  }));
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    mode: downloadClient.mode,
    defaultProviders: searchEngine.defaultProviders,
    availableProviders: AVAILABLE_PROVIDERS,
    leadDirectory: leadStore.baseDir,
    inpiConfigured: !!(searchEngine.inpiValidator && searchEngine.inpiValidator.isConfigured)
  });
});

app.get('/api/provider-options/artisan', async (req, res) => {
  try {
    const options = await searchEngine.artisanProvider.getOptions();
    res.json({
      ok: true,
      ...options
    });
  } catch (error) {
    logger.error('Artisan options error', error);
    res.status(500).json({
      error: isProduction ? 'Artisan options unavailable.' : (error.message || 'Artisan options error')
    });
  }
});

app.get('/api/provider-options/artisan/cities', async (req, res) => {
  const department = toString(req.query.department);

  if (!department) {
    res.status(400).json({ error: 'Missing required query parameter: department' });
    return;
  }

  try {
    const cities = await searchEngine.artisanProvider.getCitiesForDepartment(department);
    res.json({
      ok: true,
      items: cities
    });
  } catch (error) {
    logger.error('Artisan cities error', error);
    res.status(500).json({
      error: isProduction ? 'Artisan cities unavailable.' : (error.message || 'Artisan cities error')
    });
  }
});

app.get('/api/leads', (req, res) => {
  try {
    const leads = leadStore.listLeads();
    res.json({
      ok: true,
      items: leads
    });
  } catch (error) {
    logger.error('Lead list error', error);
    res.status(500).json({
      error: isProduction ? 'Lead list unavailable.' : (error.message || 'Lead list error')
    });
  }
});

app.post('/api/leads', (req, res) => {
  const body = req.body || {};

  try {
    const lead = leadStore.upsertLead({
      leadKey: toString(body.leadKey),
      company: toString(body.company),
      siren: toString(body.siren),
      siret: toString(body.siret),
      nafCode: toString(body.nafCode),
      city: toString(body.city),
      department: toString(body.department),
      postalCode: toString(body.postalCode),
      address: toString(body.address),
      phone: toString(body.phone),
      email: toString(body.email),
      website: toString(body.website),
      websiteStatus: toString(body.websiteStatus),
      websiteStatusDetail: toString(body.websiteStatusDetail),
      sourceId: toString(body.sourceId),
      creationDate: toString(body.creationDate),
      activityLabel: toString(body.activityLabel),
      metiers: toList(body.metiers),
      phoneStatus: toString(body.phoneStatus),
      phoneSource: toString(body.phoneSource),
      confidence: toString(body.confidence),
      validationSource: toString(body.validationSource),
      inpiValidationStatus: toString(body.inpiValidationStatus),
      inpiDomains: toList(body.inpiDomains),
      href: toString(body.href),
      sources: toList(body.sources),
      providerData: body.providerData && typeof body.providerData === 'object' ? body.providerData : {},
      status: toString(body.status),
      notes: toString(body.notes),
      followUpAt: toString(body.followUpAt)
    });

    res.json({
      ok: true,
      lead
    });
  } catch (error) {
    logger.error('Lead save error', error);
    res.status(400).json({
      error: error.message || 'Lead save error'
    });
  }
});

app.post('/api/search', ...(searchLimiter ? [searchLimiter] : []), async (req, res) => {
  const body = req.body || {};
  let filters;

  try {
    filters = buildSearchFilters(body);
  } catch (parseErr) {
    logger.warn('Filter parse error', parseErr);
    res.status(400).json({ error: 'Invalid request body.' });
    return;
  }

  const requestError = searchRequestError(body, filters);
  if (requestError) {
    res.status(400).json({ error: requestError });
    return;
  }

  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({
        error: 'Search request timed out. Try again or reduce max pages.'
      });
    }
  }, SEARCH_TIMEOUT_MS);

  const clearTimeoutAndRespond = () => {
    clearTimeout(timeoutId);
  };

  try {
    const filterCount = [
      filters.query,
      filters.nafCodes.length,
      filters.apeCodes.length,
      filters.tags.length,
      filters.cities.length,
      filters.postalCodes.length,
      filters.departments.length,
      filters.legalForms.length,
      filters.statuses.length,
      filters.artisanMetierIds.length,
      filters.artisanActivityIds.length,
      filters.artisanCityIds.length,
      filters.staff,
      filters.minSales,
      filters.maxSales,
      filters.websiteStatus && filters.websiteStatus !== 'any'
    ].filter(Boolean).length;
    const resolvedProviders = searchEngine.resolveProviders(filters);
    logger.info('Search start', { providers: resolvedProviders, filterCount });

    const result = await searchEngine.searchCompanies(filters);
    const persistedLeads = leadStore.upsertSearchResults(result.items || []);
    result.items = persistedLeads.items;
    result.leadSummary = {
      addedCount: persistedLeads.addedCount,
      updatedCount: persistedLeads.updatedCount,
      directory: persistedLeads.directory,
      textFile: persistedLeads.textFile
    };
    clearTimeoutAndRespond();
    if (res.headersSent) return;
    logger.info('Search done', { mode: result.mode, items: (result.items || []).length });
    res.json(result);
  } catch (error) {
    clearTimeoutAndRespond();
    if (res.headersSent) return;

    const isClientError =
      error.message &&
      (
        error.message.includes('Invalid') ||
        error.message.includes('Missing') ||
        error.message.includes('required') ||
        error.message.includes('credentials')
      );

    if (isClientError) {
      res.status(400).json({
        error: error.message || 'Invalid request.'
      });
    } else {
      logger.error('Search error', error);
      res.status(500).json({
        error: isProduction
          ? 'An error occurred. Please try again later.'
          : (error.message || 'Search error')
      });
    }
  }
});

const DOWNLOAD_TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS || 90000);
const downloadDir = path.join(__dirname, 'downloads');

app.post('/api/download-company-docs', async (req, res) => {
  const body = req.body || {};
  const href = String(body.href || '').trim();
  const company = String(body.company || '').trim();
  const siren = String(body.siren || '').trim();

  if (!href) {
    res.status(400).json({ error: 'Missing required field: href' });
    return;
  }

  if (!company && !siren) {
    res.status(400).json({ error: 'Missing required field: company or siren' });
    return;
  }

  fs.mkdirSync(downloadDir, { recursive: true });

  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Download timed out. Try again later.' });
    }
  }, DOWNLOAD_TIMEOUT_MS);

  try {
    logger.info('Download start', { href, company, siren });
    const result = await downloadClient.downloadCompanyDocuments({ href, company, siren }, downloadDir);
    clearTimeout(timeoutId);
    if (res.headersSent) return;
    logger.info('Download done', { folder: result.folder, count: result.count });
    res.json(result);
  } catch (error) {
    clearTimeout(timeoutId);
    if (res.headersSent) return;
    logger.error('Download error', error);
    res.status(500).json({
      error: isProduction
        ? 'Download error. Please try again later.'
        : (error.message || 'Download error')
    });
  }
});

const server = app.listen(port, () => {
  logger.info(`InfoPro available on http://localhost:${port}`, {
    mode: downloadClient.mode,
    providers: searchEngine.defaultProviders
  });
});

async function shutdown() {
  logger.info('Shutting down');
  await searchEngine.dispose().catch(() => undefined);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
