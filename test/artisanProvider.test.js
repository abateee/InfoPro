'use strict';

const { ArtisanProvider } = require('../src/providers/artisanProvider');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || 'Expected equal') + ': ' + sa + ' !== ' + sb);
}

function response(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return text;
    }
  };
}

const metadataHtml = `
  <form id="form-annuaire">
    <select name="departement">
      <option value=""></option>
      <option value="69">69 - Rhone</option>
    </select>
    <input type="checkbox" name="metier[]" id="metier-141" value="141" checked />
    <label for="metier-141">Plombier-Chauffagiste</label>
    <input type="checkbox" name="activite[]" id="activite-40" value="40" />
    <label for="activite-40">Travaux de construction specialises</label>
  </form>
`;

const listingHtml = `
  <main>
    <p>11 artisans</p>
    <div id="colonne-droite">
      <div class="relativeads">
        <div class="ads box-light">
          <h2><a href="/artisan-sarl-pearson-devillard-1091688">SARL PEARSON DEVILLARD</a></h2>
          SARL PEARSON DEVILLARD Varennes-sur-loire, Maine et Loire (49) Electricien, Plombier-Chauffagiste
        </div>
      </div>
    </div>
    <a href="/annuaire/plombier-chauffagiste?p=2">Page suivante &rsaquo;</a>
  </main>
`;

const emptyListingWithRecommendationsHtml = `
  <main>
    <div id="colonne-droite">
      <p>0 artisans</p>
      <p class="blue">
        Suite a votre recherche, aucun professionnel n'a ete trouvee.
        Retrouvez ci-dessous les derniers artisans susceptibles de vous interesser.
      </p>
      <div class="third">
        <div class="ads box-light">
          <h2><a href="/artisan-recommandation-hors-sujet-123456">RECOMMANDATION HORS SUJET</a></h2>
          RECOMMANDATION HORS SUJET Toulouse (31)
        </div>
      </div>
    </div>
  </main>
`;

const fallbackCityListingHtml = `
  <main>
    <p>3 artisans</p>
    <div id="colonne-droite">
      <div class="relativeads">
        <div class="ads box-light">
          <h2><a href="/artisan-varlet-plomberie-1068402">Varlet-plomberie</a></h2>
          <p><strong>Boulogne-sur-mer, Pas-de-Calais (62)</strong><br />
          Electricien, Plombier<br />Travaux de construction specialises</p>
        </div>
      </div>
      <div class="relativeads">
        <div class="ads box-light">
          <h2><a href="/artisan-peintre-hors-filtre-654321">Peintre hors filtre</a></h2>
          <p><strong>Boulogne-sur-mer, Pas-de-Calais (62)</strong><br />
          Peintre<br />Travaux de construction specialises</p>
        </div>
      </div>
      <div class="relativeads">
        <div class="ads box-light">
          <h2><a href="/artisan-plombier-ville-voisine-777777">Plombier ville voisine</a></h2>
          <p><strong>Outreau, Pas-de-Calais (62)</strong><br />
          Plombier<br />Travaux de construction specialises</p>
        </div>
      </div>
    </div>
  </main>
`;

const detailHtml = `
  <h1>SARL PEARSON DEVILLARD : Electricien, Plombier Chauffagiste a Varennes-sur-loire (49)</h1>
  <div id="coordanchor">
    <p><strong>SARL PEARSON DEVILLARD</strong><br />21 place de jeu de Paume<br />Varennes-sur-loire 49730</p>
    <ul>
      <li><a href="https://www.pearsondevillard.fr"><img alt="Site Internet" /></a></li>
      <li><a href="https://www.facebook.com/example"><img alt="Facebook" /></a></li>
    </ul>
    <a href="#" class="button-blue appeler" data-for="643193" data-type="fixe">Telephone fixe</a>
    <a href="#" class="button-blue email" data-for="643193">Envoyer un email</a>
  </div>
  <p>
    SARL PEARSON DEVILLARD Services relatifs aux batiments et amenagement paysager
    - Date de cr&eacute;ation : 08/11/2022 - Siren : 848359873 - Siret : 84835987300011
    - Forme juridique : SARL - Code APE : 43.22A
    Activites, services & savoir-faire Electricien
    Principales activit&eacute;s Services relatifs aux batiments et amenagement paysager
    Corps de métier / Expertise Electricien Plombier-Chauffagiste
    Localisation & lieux d'intervention
  </p>
  <a href="/annuaire/services-relatifs-aux-batiments-et-amenagement-paysager">Services relatifs aux batiments et amenagement paysager</a>
  <a href="/annuaire/electricien">Electricien</a>
  <a href="/annuaire/plombier-chauffagiste">Plombier-Chauffagiste</a>
`;

async function run() {
  const provider = new ArtisanProvider({
    fetchImpl: async () => response(''),
    sleep: async () => undefined,
    phoneDelayMs: 0
  });

  const metadata = provider.parseMetadata(metadataHtml);
  assertEqual(metadata.departments, [{ id: '69', code: '69', label: '69 - Rhone' }], 'departments should parse');
  assertEqual(metadata.metiers[0], { id: '141', label: 'Plombier-Chauffagiste', selected: true }, 'metiers should parse');
  assertEqual(metadata.activities[0], { id: '40', label: 'Travaux de construction specialises', selected: false }, 'activities should parse');

  assertEqual(provider.parseCitiesResponse('594|Amplepuis|;2|Lyon|;'), [
    { id: '594', label: 'Amplepuis' },
    { id: '2', label: 'Lyon' }
  ], 'cities should parse');

  const url = provider.buildSearchUrl(
    { artisanMetierIds: ['141'], artisanActivityIds: ['40'] },
    { department: '69', cityId: '2' },
    2
  );
  assert(url.includes('departement=69'), 'search url should include department');
  assert(url.includes('ville=2'), 'search url should include city');
  assert(url.includes('metier%5B%5D=141'), 'search url should include metier');
  assert(url.includes('activite%5B%5D=40'), 'search url should include activity');
  assert(url.includes('p=2'), 'search url should include page');

  const listing = provider.parseListingPage(listingHtml, 'https://www.artisan-en-ligne.com/annuaire?departement=69');
  assert(listing.items.length === 1, 'listing should parse one item');
  assert(listing.items[0].company === 'SARL PEARSON DEVILLARD', 'listing should parse company');
  assert(listing.items[0].department === '49', 'listing should parse department');
  assert(listing.hasNextPage === true, 'listing should detect next page');

  const emptyListing = provider.parseListingPage(
    emptyListingWithRecommendationsHtml,
    'https://www.artisan-en-ligne.com/annuaire?departement=62&ville=58&metier%5B%5D=141'
  );
  assert(emptyListing.totalSeen === 0, 'empty listing should preserve zero result count');
  assert(emptyListing.items.length === 0, 'empty listing should ignore fallback recommendations');
  assert(emptyListing.hasNextPage === false, 'empty listing should not paginate recommendations');

  const detail = provider.parseDetailPage(
    detailHtml,
    'https://www.artisan-en-ligne.com/artisan-sarl-pearson-devillard-1091688'
  );
  assert(detail.siren === '848359873', 'detail should parse siren');
  assert(detail.siret === '84835987300011', 'detail should parse siret');
  assert(detail.nafCode === '43.22A', 'detail should parse APE');
  assert(detail.creationDate === '2022-11-08', 'detail should normalize creation date');
  assert(detail.website === 'https://www.pearsondevillard.fr/', 'detail should parse external website');
  assert(detail.phoneStatus === 'revealable', 'detail should mark phone revealable');
  assert(detail.providerData.emailRevealable === true, 'detail should mark email revealable');
  assert(detail.metiers.includes('Electricien'), 'detail should parse metiers');

  assert(provider.parsePhoneResponse('0241532317') === '02 41 53 23 17', 'phone response should parse');

  const fetchImpl = async (requestUrl) => {
    if (String(requestUrl).includes('appeler.php')) return response('0241532317');
    if (String(requestUrl).includes('/artisan-sarl-pearson-devillard-1091688')) return response(detailHtml);
    return response(listingHtml);
  };

  const liveProvider = new ArtisanProvider({
    fetchImpl,
    sleep: async () => undefined,
    phoneDelayMs: 0,
    detailLimit: 1,
    phoneLimit: 1
  });
  const result = await liveProvider.search({
    providers: ['artisan'],
    departments: ['69'],
    artisanMetierIds: ['141'],
    artisanAutoPhone: true,
    artisanDetailLimit: 1,
    artisanPhoneLimit: 1,
    maxPages: 1,
    websiteStatus: 'any'
  });

  assert(result.items.length === 1, 'search should return one item');
  assert(result.items[0].phone === '02 41 53 23 17', 'search should enrich phone');
  assert(result.meta.phoneAttempts === 1, 'search should count phone attempts');
  assert(result.meta.phoneFound === 1, 'search should count found phone');

  const fallbackRequests = [];
  const emptyProvider = new ArtisanProvider({
    fetchImpl: async (requestUrl) => {
      const url = String(requestUrl);
      fallbackRequests.push(url);
      if (url === 'https://www.artisan-en-ligne.com/annuaire') {
        return response(metadataHtml);
      }
      if (url.includes('option-aire-urbaine.php')) {
        return response('58|Boulogne-sur-mer|;');
      }
      if (url.includes('departement=62') && url.includes('ville=58') && !url.includes('metier%5B%5D')) {
        return response(fallbackCityListingHtml);
      }
      return response(emptyListingWithRecommendationsHtml);
    },
    sleep: async () => undefined,
    phoneDelayMs: 0,
    detailLimit: 10,
    phoneLimit: 10
  });
  const emptyResult = await emptyProvider.search({
    providers: ['artisan'],
    artisanDepartments: ['62'],
    artisanCityIds: ['58'],
    artisanMetierIds: ['141'],
    artisanAutoPhone: true,
    artisanDetailLimit: 0,
    artisanPhoneLimit: 0,
    maxPages: 20,
    websiteStatus: 'any'
  });

  assert(emptyResult.items.length === 1, 'search should recover matching city results locally');
  assert(emptyResult.items[0].company === 'Varlet-plomberie', 'fallback should keep only matching trades');
  assert(emptyResult.meta.listingItemCount === 1, 'search should report one locally matched listing item');
  assert(emptyResult.meta.fallbackUsed === true, 'search should report local fallback usage');
  assert(emptyResult.meta.fallbackListingTotal === 3, 'fallback should report the unfiltered area total');
  assert(emptyResult.meta.localMatchedCount === 1, 'fallback should report the locally matched total');
  assert(emptyResult.meta.detailCount === 0, 'search should not enrich fallback recommendations');
  assert(emptyResult.meta.phoneAttempts === 0, 'search should not request phones for fallback recommendations');
  assert(fallbackRequests.length === 3, 'fallback should fetch metadata, city labels and city listing');
  assert(!emptyResult.items.some((item) => item.company === 'RECOMMANDATION HORS SUJET'), 'fallback should ignore recommendations');
  assert(!emptyResult.items.some((item) => item.company === 'Plombier ville voisine'), 'fallback should keep the selected city exact');

  console.log('artisanProvider.test.js: all passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
