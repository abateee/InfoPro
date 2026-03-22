'use strict';

const fs = require('fs');
const path = require('path');
const { companyKey } = require('./utils/searchModel');

function safeIsoTimestamp(date = new Date()) {
  return date.toISOString();
}

function createLeadKey(item) {
  const rawKey = companyKey(item);
  if (!rawKey) {
    return '';
  }

  return Buffer.from(rawKey, 'utf8').toString('base64url');
}

function formatLeadBlock(lead) {
  const lines = [
    `[${lead.firstSeenAt}]`,
    `Entreprise: ${lead.company || ''}`,
    `SIREN: ${lead.siren || ''}`,
    `SIRET: ${lead.siret || ''}`,
    `NAF: ${lead.nafCode || ''}`,
    `Ville: ${lead.city || ''}`,
    `Departement: ${lead.department || ''}`,
    `Code postal: ${lead.postalCode || ''}`,
    `Adresse: ${lead.address || ''}`,
    `Telephone: ${lead.phone || ''}`,
    `Email: ${lead.email || ''}`,
    `Site web: ${lead.website || ''}`,
    `Statut site: ${lead.websiteStatus || ''}`,
    `Detail site: ${lead.websiteStatusDetail || ''}`,
    `Source validation: ${lead.validationSource || ''}`,
    `Statut validation INPI: ${lead.inpiValidationStatus || ''}`,
    `Domaines INPI: ${Array.isArray(lead.inpiDomains) ? lead.inpiDomains.join(', ') : ''}`,
    `Sources: ${Array.isArray(lead.sources) ? lead.sources.join(', ') : ''}`,
    `Lead key: ${lead.leadKey || ''}`,
    '----------------------------------------'
  ];

  return `${lines.join('\n')}\n`;
}

class LeadStore {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(process.cwd(), 'sans site');
    this.textFile = options.textFile || path.join(this.baseDir, 'sans site.txt');
    this.jsonFile = options.jsonFile || path.join(this.baseDir, 'leads.json');
  }

  _ensureStorage() {
    fs.mkdirSync(this.baseDir, { recursive: true });

    if (!fs.existsSync(this.textFile)) {
      fs.writeFileSync(this.textFile, '', 'utf8');
    }

    if (!fs.existsSync(this.jsonFile)) {
      fs.writeFileSync(this.jsonFile, '[]', 'utf8');
    }
  }

  _readLeads() {
    this._ensureStorage();

    try {
      const raw = fs.readFileSync(this.jsonFile, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  _writeLeads(leads) {
    this._ensureStorage();
    fs.writeFileSync(this.jsonFile, JSON.stringify(leads, null, 2), 'utf8');
  }

  _appendTextBlocks(blocks) {
    if (!blocks || blocks.length === 0) {
      return;
    }

    this._ensureStorage();
    fs.appendFileSync(this.textFile, blocks.join('\n'), 'utf8');
  }

  _buildLeadFromItem(item, existing, now) {
    return {
      leadKey: existing && existing.leadKey ? existing.leadKey : createLeadKey(item),
      company: item.company || (existing && existing.company) || '',
      siren: item.siren || (existing && existing.siren) || '',
      siret: item.siret || (existing && existing.siret) || '',
      nafCode: item.nafCode || (existing && existing.nafCode) || '',
      city: item.city || (existing && existing.city) || '',
      department: item.department || (existing && existing.department) || '',
      postalCode: item.postalCode || (existing && existing.postalCode) || '',
      address: item.address || (existing && existing.address) || '',
      phone: item.phone || (existing && existing.phone) || '',
      email: item.email || (existing && existing.email) || '',
      website: item.website || (existing && existing.website) || '',
      websiteStatus: item.websiteStatus || (existing && existing.websiteStatus) || 'unknown',
      websiteStatusDetail: item.websiteStatusDetail || (existing && existing.websiteStatusDetail) || '',
      confidence: item.confidence || (existing && existing.confidence) || 'low',
      validationSource: item.validationSource || (existing && existing.validationSource) || '',
      inpiValidationStatus: item.inpiValidationStatus || (existing && existing.inpiValidationStatus) || '',
      inpiDomains: Array.isArray(item.inpiDomains)
        ? item.inpiDomains.slice()
        : ((existing && existing.inpiDomains) || []),
      href: item.href || (existing && existing.href) || '',
      sources: Array.isArray(item.sources) && item.sources.length > 0
        ? item.sources.slice()
        : ((existing && existing.sources) || []),
      status: existing && existing.status ? existing.status : 'new',
      notes: existing && existing.notes ? existing.notes : '',
      followUpAt: existing && existing.followUpAt ? existing.followUpAt : '',
      firstSeenAt: existing && existing.firstSeenAt ? existing.firstSeenAt : now,
      lastSeenAt: now,
      updatedAt: now
    };
  }

  listLeads() {
    return this._readLeads()
      .slice()
      .sort((left, right) => String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || '')));
  }

  getLead(leadKey) {
    return this._readLeads().find((lead) => lead.leadKey === leadKey) || null;
  }

  upsertSearchResults(items) {
    const now = safeIsoTimestamp();
    const leads = this._readLeads();
    const index = new Map(leads.map((lead) => [lead.leadKey, lead]));
    const blocks = [];
    let addedCount = 0;
    let updatedCount = 0;

    const decoratedItems = (items || []).map((item) => {
      const leadKey = createLeadKey(item);
      const existing = leadKey ? index.get(leadKey) : null;
      const shouldPersist =
        item.websiteStatus === 'no_website' &&
        item.shouldPersistNoWebsite !== false;

      if (!leadKey || !shouldPersist) {
        return existing
          ? {
              ...item,
              leadKey: existing.leadKey,
              leadStatus: existing.status,
              leadNotes: existing.notes,
              leadFollowUpAt: existing.followUpAt
            }
          : item;
      }

      const lead = this._buildLeadFromItem(item, existing, now);

      if (!existing) {
        leads.push(lead);
        index.set(lead.leadKey, lead);
        blocks.push(formatLeadBlock(lead));
        addedCount += 1;
      } else {
        Object.assign(existing, lead);
        updatedCount += 1;
      }

      return {
        ...item,
        leadKey: lead.leadKey,
        leadStatus: lead.status,
        leadNotes: lead.notes,
        leadFollowUpAt: lead.followUpAt
      };
    });

    if (addedCount > 0 || updatedCount > 0) {
      this._writeLeads(leads);
    }

    if (blocks.length > 0) {
      this._appendTextBlocks(blocks);
    }

    return {
      items: decoratedItems,
      addedCount,
      updatedCount,
      directory: this.baseDir,
      textFile: this.textFile
    };
  }

  upsertLead(input) {
    const now = safeIsoTimestamp();
    const leads = this._readLeads();
    const leadKey = input.leadKey || createLeadKey(input);

    if (!leadKey) {
      throw new Error('Missing lead key.');
    }

    const existing = leads.find((lead) => lead.leadKey === leadKey);
    const next = {
      ...(existing || {
        leadKey,
        firstSeenAt: now
      }),
      company: input.company || (existing && existing.company) || '',
      siren: input.siren || (existing && existing.siren) || '',
      siret: input.siret || (existing && existing.siret) || '',
      nafCode: input.nafCode || (existing && existing.nafCode) || '',
      city: input.city || (existing && existing.city) || '',
      department: input.department || (existing && existing.department) || '',
      postalCode: input.postalCode || (existing && existing.postalCode) || '',
      address: input.address || (existing && existing.address) || '',
      phone: input.phone || (existing && existing.phone) || '',
      email: input.email || (existing && existing.email) || '',
      website: input.website || (existing && existing.website) || '',
      websiteStatus: input.websiteStatus || (existing && existing.websiteStatus) || 'unknown',
      websiteStatusDetail: input.websiteStatusDetail || (existing && existing.websiteStatusDetail) || '',
      confidence: input.confidence || (existing && existing.confidence) || 'low',
      validationSource: input.validationSource || (existing && existing.validationSource) || '',
      inpiValidationStatus: input.inpiValidationStatus || (existing && existing.inpiValidationStatus) || '',
      inpiDomains: Array.isArray(input.inpiDomains)
        ? input.inpiDomains.slice()
        : ((existing && existing.inpiDomains) || []),
      href: input.href || (existing && existing.href) || '',
      sources: Array.isArray(input.sources)
        ? input.sources.slice()
        : ((existing && existing.sources) || []),
      status: input.status || (existing && existing.status) || 'new',
      notes: input.notes != null ? String(input.notes) : ((existing && existing.notes) || ''),
      followUpAt: input.followUpAt != null ? String(input.followUpAt) : ((existing && existing.followUpAt) || ''),
      lastSeenAt: (existing && existing.lastSeenAt) || now,
      updatedAt: now
    };

    if (existing) {
      Object.assign(existing, next);
    } else {
      leads.push(next);
      this._appendTextBlocks([formatLeadBlock(next)]);
    }

    this._writeLeads(leads);
    return next;
  }
}

module.exports = {
  LeadStore,
  createLeadKey
};
