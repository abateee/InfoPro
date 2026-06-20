function toList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function boolFromCheckbox(id) {
  const el = document.getElementById(id);
  return !!(el && el.checked);
}

function selectedValues(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  return Array.from(el.selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean);
}

function setSelectedValues(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  const selected = new Set(toList(values));
  Array.from(el.options).forEach((option) => {
    option.selected = selected.has(option.value);
  });
}

function setSelectOptions(id, options, placeholder) {
  const el = document.getElementById(id);
  if (!el) return;
  const selected = selectedValues(id);
  el.innerHTML = '';
  if (placeholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    el.appendChild(opt);
  }
  (options || []).forEach((entry) => {
    const opt = document.createElement('option');
    opt.value = entry.id || entry.code || entry.value || '';
    opt.textContent = entry.label || entry.name || opt.value;
    el.appendChild(opt);
  });
  setSelectedValues(id, selected);
}

function setProviders(providers) {
  const selected = new Set(toList(providers));
  document.getElementById('providerInfonet').checked = selected.size === 0 || selected.has('infonet');
  document.getElementById('providerAnnuaire').checked = selected.has('annuaire');
  document.getElementById('providerArtisan').checked = selected.has('artisan');
}

function selectedProviders() {
  const providers = [];
  if (boolFromCheckbox('providerInfonet')) providers.push('infonet');
  if (boolFromCheckbox('providerAnnuaire')) providers.push('annuaire');
  if (boolFromCheckbox('providerArtisan')) providers.push('artisan');
  return providers;
}

function activeFiltersFromDecodedQuery(decodedQuery) {
  const text = String(decodedQuery || '').trim();
  if (!text) {
    return [];
  }

  const queryPart = text.startsWith('?') ? text.slice(1) : text;
  const params = new URLSearchParams(queryPart);
  const active = [];

  for (const [key, valueRaw] of params.entries()) {
    const value = String(valueRaw || '').trim();
    if (!value) {
      continue;
    }

    if (key === 'includeForeigners' && value === '0') {
      continue;
    }

    active.push(`${key}=${value}`);
  }

  return active;
}

function normalizeErrorMessage(error, responseStatus, serverMessage) {
  const message = String((error && error.message) || error || 'Erreur inconnue');
  const lower = message.toLowerCase();

  if (responseStatus === 408) {
    return 'La recherche a expire. Reessayez ou reduisez le nombre de pages a scraper.';
  }
  if (responseStatus === 500 || responseStatus === 502 || responseStatus === 503) {
    return 'Le serveur est indisponible. Reessayez dans quelques instants.';
  }

  if (lower.includes('networkerror') || lower.includes('failed to fetch') || lower.includes('load failed')) {
    return "Connexion au backend impossible. Ouvrez l'app sur http://localhost:3010 et verifiez que le serveur InfoPro tourne.";
  }

  if (serverMessage && responseStatus === 400) {
    return serverMessage;
  }
  return message;
}

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function buildCsv(items) {
  const headers = [
    'company',
    'siren',
    'siret',
    'sourceId',
    'nafCode',
    'creationDate',
    'activityLabel',
    'metiers',
    'city',
    'department',
    'postalCode',
    'websiteStatus',
    'websiteStatusDetail',
    'website',
    'phone',
    'phoneStatus',
    'phoneSource',
    'email',
    'confidence',
    'validationSource',
    'inpiValidationStatus',
    'inpiDomains',
    'leadStatus',
    'leadFollowUpAt',
    'sources',
    'href'
  ];
  const lines = [headers.join(',')];

  for (const item of items) {
    const row = [
      item.company || '',
      item.siren || '',
      item.siret || '',
      item.sourceId || '',
      item.nafCode || '',
      item.creationDate || '',
      item.activityLabel || '',
      Array.isArray(item.metiers) ? item.metiers.join('|') : '',
      item.city || '',
      item.department || '',
      item.postalCode || '',
      item.websiteStatus || '',
      item.websiteStatusDetail || '',
      item.website || '',
      item.phone || '',
      item.phoneStatus || '',
      item.phoneSource || '',
      item.email || '',
      item.confidence || '',
      item.validationSource || '',
      item.inpiValidationStatus || '',
      Array.isArray(item.inpiDomains) ? item.inpiDomains.join('|') : '',
      item.leadStatus || '',
      item.leadFollowUpAt || '',
      Array.isArray(item.sources) ? item.sources.join('|') : '',
      item.href || '',
    ].map(csvEscape);

    lines.push(row.join(','));
  }

  return `\uFEFF${lines.join('\n')}`;
}

function buildTxt(items) {
  const blocks = items.map((item, index) => {
    const parts = [
      `#${index + 1}`,
      `Entreprise: ${item.company || ''}`,
      `SIREN: ${item.siren || ''}`,
      `SIRET: ${item.siret || ''}`,
      `Source ID: ${item.sourceId || ''}`,
      `NAF: ${item.nafCode || ''}`,
      `Date creation: ${item.creationDate || ''}`,
      `Activite: ${item.activityLabel || ''}`,
      `Metiers: ${Array.isArray(item.metiers) ? item.metiers.join(', ') : ''}`,
      `Ville: ${item.city || ''}`,
      `Departement: ${item.department || ''}`,
      `Code postal: ${item.postalCode || ''}`,
      `Statut site: ${item.websiteStatus || ''}`,
      `Detail site: ${item.websiteStatusDetail || ''}`,
      `Site web: ${item.website || ''}`,
      `Telephone: ${item.phone || ''}`,
      `Statut telephone: ${item.phoneStatus || ''}`,
      `Source telephone: ${item.phoneSource || ''}`,
      `Email: ${item.email || ''}`,
      `Confiance: ${item.confidence || ''}`,
      `Source validation: ${item.validationSource || ''}`,
      `Statut validation INPI: ${item.inpiValidationStatus || ''}`,
      `Domaines INPI: ${Array.isArray(item.inpiDomains) ? item.inpiDomains.join(', ') : ''}`,
      `Statut lead: ${item.leadStatus || ''}`,
      `Relance: ${item.leadFollowUpAt || ''}`,
      `Sources: ${Array.isArray(item.sources) ? item.sources.join(', ') : ''}`,
      `URL: ${item.href || ''}`
    ];

    return parts.join('\n');
  });

  return blocks.join('\n\n----------------------------------------\n\n');
}

function downloadTextFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeTimestamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function renderRows(items) {
  if (!items || items.length === 0) {
    return '<p>Aucun resultat pour ces filtres.</p>';
  }

  const rows = items
    .map((item, idx) => {
      const sources = (item.sources || []).map((source) => `<span class="badge">${escapeHtml(source)}</span>`).join('');
      const link = item.href
        ? `<a href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">${escapeHtml(item.company || '')}</a>`
        : escapeHtml(item.company || '');
      const website = item.website
        ? `<a href="${escapeHtml(item.website)}" target="_blank" rel="noreferrer">${escapeHtml(item.website)}</a>`
        : '-';
      const canDownloadDocs = !!item.href && (item.sources || []).includes('infonet');
      const canOpenLead = !!item.leadKey || (item.websiteStatus === 'no_website' && item.shouldPersistNoWebsite !== false);
      const actions = [];
      const metiers = Array.isArray(item.metiers) ? item.metiers.join(', ') : '';
      const validation = [
        item.websiteStatusDetail || '',
        item.inpiValidationStatus || ''
      ].filter(Boolean).join(' | ');

      if (item.href) {
        actions.push(`<a class="button-link" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">Ouvrir source</a>`);
      }

      if (canDownloadDocs) {
        actions.push(`<button type="button" class="btn-dl-docs" data-idx="${idx}">Telecharger fichiers</button>`);
      }

      if (canOpenLead) {
        actions.push(`<button type="button" class="btn-open-lead btn-secondary" data-idx="${idx}">Fiche lead</button>`);
      }

      const actionCell = actions.length > 0
        ? `
            ${actions.join(' ')}
            <span class="dl-status" data-dl-status="${idx}"></span>
          `
        : '<span class="muted">-</span>';

      return `
        <tr>
          <td>${link}</td>
          <td>${escapeHtml(item.siren || '')}</td>
          <td>${escapeHtml(item.siret || '')}</td>
          <td>${escapeHtml(item.city || '')}</td>
          <td>${escapeHtml(item.postalCode || '')}</td>
          <td>${escapeHtml(item.nafCode || '')}</td>
          <td>${escapeHtml(item.creationDate || '') || '-'}</td>
          <td>${escapeHtml(metiers || item.activityLabel || '') || '-'}</td>
          <td>${escapeHtml(item.websiteStatus || '')}</td>
          <td>${website}</td>
          <td>${escapeHtml(item.phone || '') || '-'}</td>
          <td>${escapeHtml(item.phoneStatus || '') || '-'}</td>
          <td>${escapeHtml(item.email || '') || '-'}</td>
          <td>${escapeHtml(item.confidence || '')}</td>
          <td>${escapeHtml(validation) || '-'}</td>
          <td>${escapeHtml(item.leadStatus || '') || '-'}</td>
          <td>${sources || '-'}</td>
          <td>${actionCell}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <table class="table">
      <thead>
        <tr>
          <th>Entreprise</th>
          <th>SIREN</th>
          <th>SIRET</th>
          <th>Ville</th>
          <th>CP</th>
          <th>NAF</th>
          <th>Creation</th>
          <th>Metier / activite</th>
          <th>Site</th>
          <th>URL site</th>
          <th>Telephone</th>
          <th>Statut tel.</th>
          <th>Email</th>
          <th>Confiance</th>
          <th>Validation</th>
          <th>Lead</th>
          <th>Sources</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderMeta(data) {
  const lines = [];

  if (Array.isArray(data.providers) && data.providers.length > 0) {
    lines.push(`<p><strong>Providers:</strong> <code>${escapeHtml(data.providers.join(', '))}</code></p>`);
  }

  if (Array.isArray(data.providerResults)) {
    data.providerResults.forEach((providerResult) => {
      if (providerResult.provider === 'inpi') {
        const enabledLabel = providerResult.validationEnabled ? 'activee' : 'inactive';
        lines.push(
          `<p><strong>INPI:</strong> validation ${escapeHtml(enabledLabel)}, ${escapeHtml(providerResult.checkedCount || 0)} verifiee(s), ${escapeHtml(providerResult.reclassifiedCount || 0)} reclassifiee(s), ${escapeHtml(providerResult.confirmedNoDomainCount || 0)} sans domaine, ${escapeHtml(providerResult.manualReviewCount || 0)} en revue manuelle</p>`
        );
      }

      if (providerResult.generatedUrl) {
        const safeUrl = escapeHtml(providerResult.generatedUrl);
        lines.push(`<p><strong>${escapeHtml(providerResult.provider)} URL:</strong> <a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a></p>`);
      }

      if (providerResult.decodedQuery) {
        const activeFilters = activeFiltersFromDecodedQuery(providerResult.decodedQuery);
        lines.push(`<p><strong>${escapeHtml(providerResult.provider)} query:</strong> <code>${escapeHtml(providerResult.decodedQuery)}</code></p>`);
        lines.push(`<p><strong>${escapeHtml(providerResult.provider)} filtres:</strong> <code>${escapeHtml(activeFilters.join(' | ') || '(aucun)')}</code></p>`);
      }

      if (providerResult.provider === 'artisan') {
        lines.push(
          `<p><strong>Artisan:</strong> ${escapeHtml(providerResult.pagesRead || 0)} page(s), ${escapeHtml(providerResult.listingItemCount || 0)} fiche(s) liste, ${escapeHtml(providerResult.detailCount || 0)} detail(s), ${escapeHtml(providerResult.phoneFound || 0)}/${escapeHtml(providerResult.phoneAttempts || 0)} telephone(s)</p>`
        );
        if (providerResult.fallbackUsed) {
          lines.push(
            `<p><strong>Filtrage local Artisan:</strong> ${escapeHtml(providerResult.localMatchedCount || 0)} correspondance(s) exacte(s) sur ${escapeHtml(providerResult.fallbackListingTotal || 0)} fiche(s) de la zone.</p>`
          );
        }
      }
    });
  }

  if (Array.isArray(data.warnings) && data.warnings.length > 0) {
    lines.push(`<p><strong>Info:</strong> ${escapeHtml(data.warnings.join(' | '))}</p>`);
  }

  if (data.leadSummary) {
    const summary = data.leadSummary;
    lines.push(
      `<p><strong>Leads locaux:</strong> +${escapeHtml(summary.addedCount || 0)} nouveaux, ${escapeHtml(summary.updatedCount || 0)} maj</p>`
    );
    if (summary.textFile) {
      lines.push(`<p><strong>Fichier sans site:</strong> <code>${escapeHtml(summary.textFile)}</code></p>`);
    }
  }

  return lines.join('');
}

function setExportState(enabled) {
  exportCsvBtn.disabled = !enabled;
  exportTxtBtn.disabled = !enabled;
  if (exportXlsxBtn) exportXlsxBtn.disabled = !enabled;
}

const form = document.getElementById('search-form');
const statusEl = document.getElementById('status');
const metaEl = document.getElementById('meta');
const resultsEl = document.getElementById('results');
const exportCsvBtn = document.getElementById('export-csv');
const exportTxtBtn = document.getElementById('export-txt');
const submitBtn = document.getElementById('submit-search');
const exportXlsxBtn = document.getElementById('export-xlsx');
const leadListEl = document.getElementById('lead-list');
const leadStoreInfoEl = document.getElementById('lead-store-info');
const leadForm = document.getElementById('lead-form');
const refreshLeadsBtn = document.getElementById('refresh-leads');

let storedLeads = [];
let activeLeadKey = '';

function leadStatusLabel(status) {
  const labels = {
    new: 'Nouveau',
    to_contact: 'A contacter',
    contacted: 'Contacte',
    qualified: 'Qualifie',
    archived: 'Archive'
  };

  return labels[status] || status || 'Nouveau';
}

function toDateTimeLocal(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function serializeLeadFromItem(item) {
  return {
    leadKey: item.leadKey || '',
    sourceId: item.sourceId || '',
    company: item.company || '',
    siren: item.siren || '',
    siret: item.siret || '',
    nafCode: item.nafCode || '',
    creationDate: item.creationDate || '',
    activityLabel: item.activityLabel || '',
    metiers: Array.isArray(item.metiers) ? item.metiers : [],
    city: item.city || '',
    department: item.department || '',
    postalCode: item.postalCode || '',
    address: item.address || '',
    phone: item.phone || '',
    phoneStatus: item.phoneStatus || '',
    phoneSource: item.phoneSource || '',
    email: item.email || '',
    website: item.website || '',
    websiteStatus: item.websiteStatus || 'unknown',
    websiteStatusDetail: item.websiteStatusDetail || '',
    confidence: item.confidence || 'low',
    validationSource: item.validationSource || '',
    inpiValidationStatus: item.inpiValidationStatus || '',
    inpiDomains: Array.isArray(item.inpiDomains) ? item.inpiDomains : [],
    href: item.href || '',
    sources: Array.isArray(item.sources) ? item.sources : [],
    status: item.leadStatus || 'new',
    notes: item.leadNotes || '',
    followUpAt: item.leadFollowUpAt || ''
  };
}

function applyLeadToForm(lead) {
  if (!leadForm || !lead) {
    return;
  }

  activeLeadKey = lead.leadKey || '';
  document.getElementById('leadKey').value = lead.leadKey || '';
  document.getElementById('leadSourceId').value = lead.sourceId || '';
  document.getElementById('leadWebsiteStatus').value = lead.websiteStatus || 'unknown';
  document.getElementById('leadWebsiteStatusDetail').value = lead.websiteStatusDetail || '';
  document.getElementById('leadConfidence').value = lead.confidence || 'low';
  document.getElementById('leadValidationSource').value = lead.validationSource || '';
  document.getElementById('leadInpiValidationStatus').value = lead.inpiValidationStatus || '';
  document.getElementById('leadInpiDomains').value = Array.isArray(lead.inpiDomains) ? lead.inpiDomains.join(', ') : (lead.inpiDomains || '');
  document.getElementById('leadSources').value = Array.isArray(lead.sources) ? lead.sources.join(', ') : (lead.sources || '');
  document.getElementById('leadHref').value = lead.href || '';
  document.getElementById('leadPhoneSource').value = lead.phoneSource || '';
  document.getElementById('leadCreationDate').value = lead.creationDate || '';
  document.getElementById('leadCompany').value = lead.company || '';
  document.getElementById('leadStatus').value = lead.status || 'new';
  document.getElementById('leadSiren').value = lead.siren || '';
  document.getElementById('leadSiret').value = lead.siret || '';
  document.getElementById('leadNafCode').value = lead.nafCode || '';
  document.getElementById('leadFollowUpAt').value = toDateTimeLocal(lead.followUpAt);
  document.getElementById('leadPhone').value = lead.phone || '';
  document.getElementById('leadPhoneStatus').value = lead.phoneStatus || '';
  document.getElementById('leadEmail').value = lead.email || '';
  document.getElementById('leadWebsite').value = lead.website || '';
  document.getElementById('leadCity').value = lead.city || '';
  document.getElementById('leadPostalCode').value = lead.postalCode || '';
  document.getElementById('leadAddress').value = lead.address || '';
  document.getElementById('leadActivityLabel').value = lead.activityLabel || '';
  document.getElementById('leadMetiers').value = Array.isArray(lead.metiers) ? lead.metiers.join(', ') : (lead.metiers || '');
  document.getElementById('leadNotes').value = lead.notes || '';
}

function renderLeadList(leads) {
  if (!leadListEl) {
    return;
  }

  if (!leads || leads.length === 0) {
    leadListEl.innerHTML = '<p class="muted">Aucun lead sauvegarde pour le moment.</p>';
    return;
  }

  leadListEl.innerHTML = leads
    .map((lead) => `
      <article class="lead-card">
        <h3>${escapeHtml(lead.company || '')}</h3>
        <p><strong>Statut:</strong> ${escapeHtml(leadStatusLabel(lead.status))}</p>
        <p><strong>Ville:</strong> ${escapeHtml(lead.city || '')}</p>
        <p><strong>Site:</strong> ${escapeHtml(lead.websiteStatus || '') || '-'}</p>
        <p><strong>Telephone:</strong> ${escapeHtml(lead.phone || '') || '-'}</p>
        <p><strong>Statut tel.:</strong> ${escapeHtml(lead.phoneStatus || '') || '-'}</p>
        <p><strong>Email:</strong> ${escapeHtml(lead.email || '') || '-'}</p>
        <p><strong>Relance:</strong> ${escapeHtml(lead.followUpAt || '') || '-'}</p>
        <div class="actions">
          <button type="button" class="btn-open-stored-lead" data-lead-key="${escapeHtml(lead.leadKey || '')}">Ouvrir</button>
        </div>
      </article>
    `)
    .join('');

  const buttons = document.querySelectorAll('.btn-open-stored-lead');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const leadKey = button.getAttribute('data-lead-key');
      const lead = storedLeads.find((entry) => entry.leadKey === leadKey);
      if (lead) {
        applyLeadToForm(lead);
      }
    });
  });
}

async function loadLeads(selectLeadKey = '') {
  if (!leadListEl) {
    return;
  }

  try {
    const response = await fetch('/api/leads', { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Lead list error');
    }

    storedLeads = Array.isArray(data.items) ? data.items : [];
    renderLeadList(storedLeads);

    if (leadStoreInfoEl) {
      leadStoreInfoEl.textContent = `${storedLeads.length} lead(s) sauvegarde(s) localement.`;
    }

    if (selectLeadKey) {
      const selected = storedLeads.find((lead) => lead.leadKey === selectLeadKey);
      if (selected) {
        applyLeadToForm(selected);
      }
    }
  } catch (error) {
    if (leadStoreInfoEl) {
      leadStoreInfoEl.textContent = `Erreur chargement leads: ${error.message}`;
    }
  }
}

function syncLeadIntoLastItems(lead) {
  lastItems = lastItems.map((item) => {
    if (item.leadKey && item.leadKey === lead.leadKey) {
      return {
        ...item,
        leadStatus: lead.status,
        leadNotes: lead.notes,
        leadFollowUpAt: lead.followUpAt
      };
    }

    return item;
  });
}

function openLeadFromItem(item) {
  if (!item) {
    return;
  }

  const lead = item.leadKey
    ? storedLeads.find((entry) => entry.leadKey === item.leadKey)
    : null;

  applyLeadToForm(lead || serializeLeadFromItem(item));
}

async function saveLead(event) {
  event.preventDefault();

  const payload = {
    leadKey: document.getElementById('leadKey').value,
    sourceId: document.getElementById('leadSourceId').value,
    websiteStatus: document.getElementById('leadWebsiteStatus').value,
    websiteStatusDetail: document.getElementById('leadWebsiteStatusDetail').value,
    confidence: document.getElementById('leadConfidence').value,
    validationSource: document.getElementById('leadValidationSource').value,
    inpiValidationStatus: document.getElementById('leadInpiValidationStatus').value,
    inpiDomains: toList(document.getElementById('leadInpiDomains').value),
    sources: toList(document.getElementById('leadSources').value),
    href: document.getElementById('leadHref').value,
    phoneSource: document.getElementById('leadPhoneSource').value,
    creationDate: document.getElementById('leadCreationDate').value,
    company: document.getElementById('leadCompany').value,
    siren: document.getElementById('leadSiren').value,
    siret: document.getElementById('leadSiret').value,
    nafCode: document.getElementById('leadNafCode').value,
    phone: document.getElementById('leadPhone').value,
    phoneStatus: document.getElementById('leadPhoneStatus').value,
    email: document.getElementById('leadEmail').value,
    website: document.getElementById('leadWebsite').value,
    city: document.getElementById('leadCity').value,
    postalCode: document.getElementById('leadPostalCode').value,
    address: document.getElementById('leadAddress').value,
    activityLabel: document.getElementById('leadActivityLabel').value,
    metiers: toList(document.getElementById('leadMetiers').value),
    status: document.getElementById('leadStatus').value,
    followUpAt: fromDateTimeLocal(document.getElementById('leadFollowUpAt').value),
    notes: document.getElementById('leadNotes').value
  };

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Lead save error');
    }

    applyLeadToForm(data.lead);
    syncLeadIntoLastItems(data.lead);
    resultsEl.innerHTML = renderRows(lastItems);
    bindDownloadButtons();
    loadLeads(data.lead.leadKey);
  } catch (error) {
    statusEl.textContent = `Erreur lead: ${error.message}`;
  }
}

function getEl(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function buildSearchPayload() {
  const providers = selectedProviders();
  const useArtisan = providers.includes('artisan');
  const artisanDepartment = getEl('artisanDepartment');
  const genericDepartments = toList(getEl('departments'));
  const maxPages = useArtisan && getEl('artisanMaxPages')
    ? Number(getEl('artisanMaxPages') || 3)
    : Number(getEl('maxPages') || 3);

  return {
    query: getEl('query'),
    providers,
    apeCodes: toList(getEl('apeCodes')),
    tags: toList(getEl('tags')),
    cities: toList(getEl('cities')),
    postalCodes: toList(getEl('postalCodes')),
    departments: useArtisan && artisanDepartment
      ? Array.from(new Set([...genericDepartments, artisanDepartment]))
      : genericDepartments,
    legalForms: toList(getEl('legalForms')),
    statuses: toList(getEl('statuses')),
    sectorCodes: toList(getEl('sectorCodes')),
    artisanMetierIds: useArtisan ? selectedValues('artisanMetierIds') : [],
    artisanActivityIds: useArtisan ? selectedValues('artisanActivityIds') : [],
    artisanCityIds: useArtisan ? selectedValues('artisanCityIds') : [],
    artisanDepartments: useArtisan && artisanDepartment ? [artisanDepartment] : [],
    artisanAutoPhone: useArtisan && boolFromCheckbox('artisanAutoPhone'),
    artisanDetailLimit: useArtisan ? Number(getEl('artisanDetailLimit') || 10) : 0,
    artisanPhoneLimit: useArtisan ? Number(getEl('artisanPhoneLimit') || 10) : 0,
    staff: getEl('staff'),
    minSales: getEl('minSales'),
    maxSales: getEl('maxSales'),
    minNetIncome: getEl('minNetIncome'),
    maxNetIncome: getEl('maxNetIncome'),
    fromCreationDate: getEl('fromCreationDate'),
    toCreationDate: getEl('toCreationDate'),
    riskNonPaymentsNormalized: getEl('riskNonPaymentsNormalized'),
    websiteStatus: getEl('websiteStatus') || 'any',
    sortBy: getEl('sortBy') || 'sales',
    sortOrder: getEl('sortOrder') || 'desc',
    page: Number(getEl('page') || 1),
    pageSize: Number(getEl('pageSize') || 25),
    maxPages,
    isActive: boolFromCheckbox('isActive'),
    isProfitable: boolFromCheckbox('isProfitable'),
    hasEmail: boolFromCheckbox('hasEmail'),
    hasLinkedin: boolFromCheckbox('hasLinkedin'),
    hasPhoneNumber: boolFromCheckbox('hasPhoneNumber'),
    hasTwitter: boolFromCheckbox('hasTwitter'),
    includeContactEnrichment: boolFromCheckbox('includeContactEnrichment'),
    isRespectfulOfPaymentDelays: boolFromCheckbox('isRespectfulOfPaymentDelays')
  };
}

const PRESETS_KEY = 'infopro_presets';
const HISTORY_KEY = 'infopro_history';
const HISTORY_MAX = 20;

function getPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(presets) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn('Could not save presets', e);
  }
}

function addToHistory(payload) {
  const list = getHistory();
  const entry = { date: new Date().toISOString(), payload };
  const filtered = list.filter((h) => JSON.stringify(h.payload) !== JSON.stringify(payload));
  const next = [entry, ...filtered].slice(0, HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('Could not save history', e);
  }
  renderHistory();
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function applyPayloadToForm(payload) {
  if (!payload) return;
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value == null ? '' : value;
  };
  set('query', payload.query);
  setProviders(payload.providers);
  set('apeCodes', Array.isArray(payload.apeCodes) ? payload.apeCodes.join(', ') : payload.apeCodes);
  set('tags', Array.isArray(payload.tags) ? payload.tags.join(', ') : payload.tags);
  set('cities', Array.isArray(payload.cities) ? payload.cities.join(', ') : payload.cities);
  set('postalCodes', Array.isArray(payload.postalCodes) ? payload.postalCodes.join(', ') : payload.postalCodes);
  set('departments', Array.isArray(payload.departments) ? payload.departments.join(', ') : payload.departments);
  set('legalForms', Array.isArray(payload.legalForms) ? payload.legalForms.join(', ') : payload.legalForms);
  set('statuses', Array.isArray(payload.statuses) ? payload.statuses.join(', ') : payload.statuses);
  set('sectorCodes', Array.isArray(payload.sectorCodes) ? payload.sectorCodes.join(', ') : payload.sectorCodes);
  set('staff', payload.staff);
  set('minSales', payload.minSales);
  set('maxSales', payload.maxSales);
  set('minNetIncome', payload.minNetIncome);
  set('maxNetIncome', payload.maxNetIncome);
  set('fromCreationDate', payload.fromCreationDate);
  set('toCreationDate', payload.toCreationDate);
  set('riskNonPaymentsNormalized', payload.riskNonPaymentsNormalized);
  setSelectedValues('artisanMetierIds', payload.artisanMetierIds);
  setSelectedValues('artisanActivityIds', payload.artisanActivityIds);
  set('artisanDepartment', Array.isArray(payload.artisanDepartments) ? payload.artisanDepartments[0] : payload.artisanDepartment);
  set('artisanMaxPages', payload.maxPages);
  set('artisanDetailLimit', payload.artisanDetailLimit);
  set('artisanPhoneLimit', payload.artisanPhoneLimit);
  set('artisanAutoPhone', payload.artisanAutoPhone);
  set('websiteStatus', payload.websiteStatus);
  set('sortBy', payload.sortBy);
  set('sortOrder', payload.sortOrder);
  set('pageSize', payload.pageSize);
  set('maxPages', payload.maxPages);
  set('isActive', payload.isActive);
  set('isProfitable', payload.isProfitable);
  set('hasEmail', payload.hasEmail);
  set('hasLinkedin', payload.hasLinkedin);
  set('hasPhoneNumber', payload.hasPhoneNumber);
  set('hasTwitter', payload.hasTwitter);
  set('includeContactEnrichment', payload.includeContactEnrichment);
  set('isRespectfulOfPaymentDelays', payload.isRespectfulOfPaymentDelays);
  syncSourcePanels();
  syncSortOptions();
  loadArtisanCities(payload.artisanCityIds);
}

function renderPresetsSelect() {
  const select = document.getElementById('preset-select');
  if (!select) return;
  const presets = getPresets();
  select.innerHTML = '<option value="">-- Charger un preset --</option>';
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.name || 'Preset ' + (i + 1);
    select.appendChild(opt);
  });
}

function renderHistory() {
  const listEl = document.getElementById('history-list');
  if (!listEl) return;
  const list = getHistory();
  listEl.innerHTML = '';
  list.forEach((entry) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    const date = new Date(entry.date);
    const label = (entry.payload && entry.payload.query) || 'Sans requete';
    btn.textContent = date.toLocaleString('fr-FR') + ' - ' + label;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      applyPayloadToForm(entry.payload);
      renderPresetsSelect();
    });
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

const INFONET_SORT_OPTIONS = [
  { value: 'sales', label: "Chiffre d'affaires" },
  { value: 'netIncome', label: 'Resultat net' },
  { value: 'creationDate', label: 'Date creation' },
  { value: 'name', label: 'Nom' },
  { value: 'supplierPaymentDelay', label: 'Delai paiement fournisseur' }
];

const ARTISAN_SORT_OPTIONS = [
  { value: 'name', label: 'Nom' },
  { value: 'city', label: 'Ville' },
  { value: 'department', label: 'Departement' },
  { value: 'websiteStatus', label: 'Statut site' },
  { value: 'phoneStatus', label: 'Telephone trouve' },
  { value: 'creationDate', label: 'Date creation' }
];

function syncSourcePanels() {
  const artisanPanel = document.getElementById('artisan-panel');
  if (artisanPanel) {
    artisanPanel.hidden = !boolFromCheckbox('providerArtisan');
  }
}

function raiseNumberInput(id, minimum) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = Number(el.value || 0);
  if (!Number.isFinite(current) || current < minimum) {
    el.value = String(minimum);
  }
}

function applyArtisanBulkDefaults() {
  if (!boolFromCheckbox('providerArtisan')) return;
  raiseNumberInput('artisanMaxPages', 20);
  raiseNumberInput('pageSize', 250);
  raiseNumberInput('artisanDetailLimit', 250);
  raiseNumberInput('artisanPhoneLimit', 10);
}

function syncSortOptions() {
  const sortSelect = document.getElementById('sortBy');
  if (!sortSelect) return;
  const providers = selectedProviders();
  const current = sortSelect.value;
  const useOnlyArtisan = providers.length === 1 && providers[0] === 'artisan';
  const options = useOnlyArtisan
    ? ARTISAN_SORT_OPTIONS
    : Array.from(new Map([...INFONET_SORT_OPTIONS, ...ARTISAN_SORT_OPTIONS].map((option) => [option.value, option])).values());

  sortSelect.innerHTML = '';
  options.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    sortSelect.appendChild(option);
  });

  if (options.some((entry) => entry.value === current)) {
    sortSelect.value = current;
  } else {
    sortSelect.value = useOnlyArtisan ? 'name' : 'sales';
  }
}

async function loadArtisanOptions() {
  const status = document.getElementById('artisan-options-status');
  if (status) status.textContent = 'Chargement options...';

  try {
    const response = await fetch('/api/provider-options/artisan', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Artisan options error');
    }

    setSelectOptions('artisanMetierIds', data.metiers || []);
    setSelectOptions('artisanActivityIds', data.activities || []);
    setSelectOptions('artisanDepartment', data.departments || [], '-- Departement --');
    if (status) {
      status.textContent = `${(data.metiers || []).length} metier(s), ${(data.activities || []).length} activite(s).`;
    }
  } catch (error) {
    if (status) status.textContent = `Options Artisan indisponibles: ${error.message}`;
  }
}

async function loadArtisanCities(selectValues = []) {
  const department = getEl('artisanDepartment');
  const citySelect = document.getElementById('artisanCityIds');
  const status = document.getElementById('artisan-options-status');

  if (!citySelect) return;
  citySelect.innerHTML = '';
  citySelect.disabled = true;

  if (!department) {
    if (status) status.textContent = 'Choisis un departement pour charger les villes.';
    return;
  }

  try {
    const response = await fetch(`/api/provider-options/artisan/cities?department=${encodeURIComponent(department)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Artisan cities error');
    }

    setSelectOptions('artisanCityIds', data.items || []);
    setSelectedValues('artisanCityIds', selectValues);
    citySelect.disabled = false;
    if (status) status.textContent = `${(data.items || []).length} ville(s) chargee(s).`;
  } catch (error) {
    if (status) status.textContent = `Villes Artisan indisponibles: ${error.message}`;
  }
}

let lastItems = [];
setExportState(false);

async function updateBackendStatus() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Health check failed');
    }

    const data = await response.json();
    const providerText = Array.isArray(data.defaultProviders) ? data.defaultProviders.join(', ') : '';
    const inpiText = data.inpiConfigured ? ' | INPI: on' : ' | INPI: off';
    statusEl.textContent = `Backend OK (${data.mode})${providerText ? ' | providers: ' + providerText : ''}${inpiText}`;
  } catch (error) {
    statusEl.textContent =
      'Backend indisponible. Lance le serveur InfoPro puis recharge cette page (http://localhost:3010).';
  }
}

updateBackendStatus();
loadArtisanOptions();
syncSourcePanels();
syncSortOptions();
renderPresetsSelect();
renderHistory();
loadLeads();

['providerInfonet', 'providerAnnuaire', 'providerArtisan'].forEach((id) => {
  const checkbox = document.getElementById(id);
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      applyArtisanBulkDefaults();
      syncSourcePanels();
      syncSortOptions();
    });
  }
});

const artisanDepartmentEl = document.getElementById('artisanDepartment');
if (artisanDepartmentEl) {
  artisanDepartmentEl.addEventListener('change', () => loadArtisanCities());
}

if (refreshLeadsBtn) {
  refreshLeadsBtn.addEventListener('click', () => loadLeads(activeLeadKey));
}

if (leadForm) {
  leadForm.addEventListener('submit', saveLead);
}

const savePresetBtn = document.getElementById('save-preset');
const loadPresetBtn = document.getElementById('load-preset');
if (savePresetBtn) {
  savePresetBtn.addEventListener('click', () => {
    const nameEl = document.getElementById('preset-name');
    const name = (nameEl && nameEl.value && nameEl.value.trim()) || 'Sans nom';
    const presets = getPresets();
    presets.push({ name, payload: buildSearchPayload() });
    savePresets(presets);
    renderPresetsSelect();
    if (nameEl) nameEl.value = '';
  });
}
if (loadPresetBtn) {
  loadPresetBtn.addEventListener('click', () => {
    const select = document.getElementById('preset-select');
    const idx = select && select.value !== '' ? parseInt(select.value, 10) : -1;
    const presets = getPresets();
    if (idx >= 0 && presets[idx]) {
      applyPayloadToForm(presets[idx].payload);
    }
  });
}

exportCsvBtn.addEventListener('click', () => {
  if (!lastItems.length) {
    return;
  }

  const content = buildCsv(lastItems);
  downloadTextFile(content, `infopro-export-${makeTimestamp()}.csv`, 'text/csv;charset=utf-8');
});

exportTxtBtn.addEventListener('click', () => {
  if (!lastItems.length) {
    return;
  }

  const content = buildTxt(lastItems);
  downloadTextFile(content, 'infopro-export-' + makeTimestamp() + '.txt', 'text/plain;charset=utf-8');
});

if (exportXlsxBtn) {
  exportXlsxBtn.addEventListener('click', () => {
    if (!lastItems.length || typeof XLSX === 'undefined') return;
    const ws = XLSX.utils.json_to_sheet(
      lastItems.map((item) => ({
        company: item.company || '',
        siren: item.siren || '',
        siret: item.siret || '',
        sourceId: item.sourceId || '',
        nafCode: item.nafCode || '',
        creationDate: item.creationDate || '',
        activityLabel: item.activityLabel || '',
        metiers: Array.isArray(item.metiers) ? item.metiers.join('|') : '',
        city: item.city || '',
        department: item.department || '',
        postalCode: item.postalCode || '',
        websiteStatus: item.websiteStatus || '',
        websiteStatusDetail: item.websiteStatusDetail || '',
        website: item.website || '',
        phone: item.phone || '',
        phoneStatus: item.phoneStatus || '',
        phoneSource: item.phoneSource || '',
        email: item.email || '',
        confidence: item.confidence || '',
        validationSource: item.validationSource || '',
        inpiValidationStatus: item.inpiValidationStatus || '',
        inpiDomains: Array.isArray(item.inpiDomains) ? item.inpiDomains.join('|') : '',
        leadStatus: item.leadStatus || '',
        leadFollowUpAt: item.leadFollowUpAt || '',
        sources: Array.isArray(item.sources) ? item.sources.join('|') : '',
        href: item.href || '',
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultats');
    XLSX.writeFile(wb, 'infopro-export-' + makeTimestamp() + '.xlsx');
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = buildSearchPayload();
  if (payload.providers.length === 0) {
    statusEl.textContent = 'Erreur: selectionnez au moins une source.';
    metaEl.innerHTML = '';
    resultsEl.innerHTML = '';
    lastItems = [];
    setExportState(false);
    return;
  }

  statusEl.textContent = 'Recherche en cours (cela peut prendre 1 a 2 min en mode live)...';
  statusEl.classList.add('loading');
  submitBtn.disabled = true;
  metaEl.innerHTML = '';
  resultsEl.innerHTML = '';
  lastItems = [];
  setExportState(false);

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const serverMessage = data && data.error ? data.error : null;
      if (response.status === 408 || response.status >= 500) {
        console.warn('Search error', response.status, serverMessage || data);
      }
      throw Object.assign(new Error(serverMessage || 'Erreur serveur'), {
        status: response.status,
        serverMessage
      });
    }

    const p = data.pagination || {};
    statusEl.textContent = `Mode: ${data.mode} | ${p.total ?? 0} resultat(s)`;
    metaEl.innerHTML = renderMeta(data);
    resultsEl.innerHTML = renderRows(data.items || []);

    lastItems = Array.isArray(data.items) ? data.items : [];
    setExportState(lastItems.length > 0);
    addToHistory(payload);
    bindDownloadButtons();
    if (data.leadSummary && leadStoreInfoEl) {
      leadStoreInfoEl.textContent = `Leads locaux: +${data.leadSummary.addedCount || 0} nouveaux, ${data.leadSummary.updatedCount || 0} maj`;
    }
    loadLeads(activeLeadKey);
  } catch (error) {
    const status = error.status;
    const serverMessage = error.serverMessage;
    statusEl.textContent = `Erreur: ${normalizeErrorMessage(error, status, serverMessage)}`;
    metaEl.innerHTML = '';
    resultsEl.innerHTML = '';
    lastItems = [];
    setExportState(false);
  } finally {
    statusEl.classList.remove('loading');
    submitBtn.disabled = false;
  }
});

function bindDownloadButtons() {
  const buttons = document.querySelectorAll('.btn-dl-docs');
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const item = lastItems[idx];
      if (!item) return;

      const statusSpan = document.querySelector(`[data-dl-status="${idx}"]`);
      btn.disabled = true;
      btn.textContent = 'Telechargement...';
      if (statusSpan) statusSpan.textContent = '';

      try {
        const response = await fetch('/api/download-company-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            href: item.href || '',
            company: item.company || '',
            siren: item.siren || ''
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Erreur de telechargement');
        }

        btn.textContent = 'Telecharger fichiers';
        btn.disabled = false;

        if (data.count > 0) {
          if (statusSpan) statusSpan.textContent = `${data.count} fichier(s) dans ${data.folder}`;
        } else {
          if (statusSpan) statusSpan.textContent = data.warning || 'Aucun document trouve.';
        }
      } catch (error) {
        btn.textContent = 'Telecharger fichiers';
        btn.disabled = false;
        if (statusSpan) statusSpan.textContent = `Erreur: ${error.message}`;
      }
    });
  });

  const leadButtons = document.querySelectorAll('.btn-open-lead');
  leadButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const item = lastItems[idx];
      if (item) {
        openLeadFromItem(item);
      }
    });
  });
}
