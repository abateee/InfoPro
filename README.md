# InfoPro

Interface web de prospection entreprises avec architecture multi-sources:

- provider `infonet` existant (login automatique, scraping headless, extraction multi-pages),
- provider `annuaire` officiel (API Recherche d'Entreprises),
- provider `artisan` public (artisan-en-ligne.com, filtres metier/activite/departement/ville, fiches detaillees),
- normalisation des resultats dans un format commun,
- filtre tri-etat `avec site / sans site / inconnu`,
- validation `INPI` des candidats `sans site` avant persistance locale,
- stockage local des leads `sans site` dans `sans site/sans site.txt` + `sans site/leads.json`,
- fiche lead avec statut, notes et relance,
- exports CSV/TXT/XLSX.

## Contexte et autorisation

Cette application peut fonctionner avec:

- un **compte Infonet Pro** pour le provider `infonet`,
- l'API publique `Annuaire des Entreprises` pour le provider `annuaire`.
- les pages publiques `artisan-en-ligne.com` pour le provider `artisan`.

Le scraping Infonet s'appuie sur tes identifiants personnels et doit rester dans le cadre d'usage prevu par le fournisseur.
Le provider Artisan peut reveler automatiquement les telephones visibles derriere le bouton public de la fiche; ajuste les limites pour rester sur un usage raisonnable.
Les recherches Artisan avec ville + metier/activite chargent la zone complete puis filtrent localement sur la ville exacte, car les filtres combines du site source sont parfois incomplets.

## 1) Installation

```powershell
cd C:\Users\pcben\Desktop\InfoPro
npm install
npx playwright install chromium
Copy-Item .env.example .env
```

## 2) Config

Dans `.env`:

- `INFONET_MODE=live`
- `INFONET_EMAIL` et `INFONET_PASSWORD`
- `INFONET_HEADLESS=1` (execution en fond)
- `INFONET_MAX_PAGES=3` (ajuste selon besoin)
- `INFONET_ENRICH_CONTACTS_LIMIT=10` (nombre max de fiches enrichies en best-effort)
- `SEARCH_TIMEOUT_MS=120000` (timeout recherche en ms)
- `SEARCH_PROVIDERS=infonet` ou `SEARCH_PROVIDERS=annuaire,infonet`
- `SEARCH_PROVIDERS=artisan` ou `SEARCH_PROVIDERS=artisan,annuaire,infonet` pour activer Artisan par defaut
- `ARTISAN_DETAIL_LIMIT=10` pour limiter les fiches detaillees enrichies par recherche (max requete: 500)
- `ARTISAN_PHONE_LIMIT=10` et `ARTISAN_PHONE_DELAY_MS=750` pour limiter la recuperation automatique des telephones Artisan (max requete: 500)
- `ARTISAN_MAX_CONTEXTS=5` pour limiter les combinaisons departement/ville Artisan
- `RATE_LIMIT_DISABLED=1` pour desactiver le rate limit en dev
- `RATE_LIMIT_MAX=10` (requetes / minute sur `/api/search`)
- `INPI_USERNAME` et `INPI_PASSWORD` pour activer la validation des `sans site`
- `INPI_VALIDATE_LIMIT=25` pour limiter le nombre de verifications INPI par recherche
- `INPI_TIMEOUT_MS=20000` et `INPI_TOKEN_TTL_MS=2700000` pour ajuster les appels INPI

## 2.1) Tests

```powershell
npm test
```

## 3) Lancer

```powershell
npm start
```

Puis ouvrir: `http://localhost:3010`

## 4) Ce que retourne `/api/search`

- `providers`: providers utilises,
- `providerResults`: metas par provider,
- `items`: lignes extraites,
- `leadSummary`: resume de la persistance locale des leads sans site,
- `warnings`: infos de scraping.

Le provider `artisan` ajoute notamment `sourceId`, `creationDate`, `activityLabel`, `metiers`, `phoneStatus` et `phoneSource`.

Quand `websiteStatus=no_website`, les lignes candidates passent par une verification INPI:

- si INPI trouve un `nomDomaine`, la fiche est reclassifiee `has_website` et n'est pas persistee,
- si INPI ne trouve aucun domaine declare, la fiche reste `no_website` et peut etre persistee,
- si INPI ne peut pas conclure, la fiche passe en `unknown` / revue manuelle et n'est pas persistee.
- si les identifiants INPI ne sont pas configures, les resultats restent visibles mais ne sont jamais persistes automatiquement.

## 5) Notes

- En cas de challenge WAF/CAPTCHA, la recherche peut echouer temporairement. Reessaye quelques secondes apres.
- Le mode live utilise une vraie session navigateur Playwright en headless.
- Si INFONET_MODE=live sans identifiants, l'app bascule en mode mock au demarrage.
- Le statut `sans site` cote Infonet est actuellement une approximation basee sur la difference entre la recherche globale et la recherche avec filtre `site web`.
- La validation INPI sert de garde-fou positif: elle confirme bien des domaines declares, mais l'absence de domaine INPI reste un `sans site probable`, pas une preuve absolue.
- L'enrichissement contacts Infonet est best-effort et peut manquer des champs selon la structure des fiches.
- L'enrichissement Artisan est best-effort: les fiches sans site externe sont marquees `no_website` avec confiance moyenne, puis l'INPI peut reclasser si un domaine officiel existe.
- Le stockage automatique exige une validation INPI explicite `no_domain_found`; une fiche non verifiee peut toujours etre ajoutee manuellement.
- Les emails Artisan ne sont pas automatises; les telephones sont recuperes seulement depuis les boutons telephone detectes et dans les limites configurees.
- Quand la source Artisan est cochee dans l'UI, les limites passent automatiquement a 20 pages, 250 resultats affiches et 250 fiches detail pour eviter de masquer la fin d'une recherche comme `Electricien` dans le `62`.
- Les leads `sans site` sont persistes automatiquement a la recherche dans le dossier `sans site/`.
- Interface : sources par cases a cocher, panneau Artisan dedie, presets de filtres et historique des recherches (localStorage), export CSV/TXT/XLSX.
