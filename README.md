# InfoPro

Interface web de prospection entreprises avec architecture multi-sources:

- provider `infonet` existant (login automatique, scraping headless, extraction multi-pages),
- provider `annuaire` officiel (API Recherche d'Entreprises),
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

Le scraping Infonet s'appuie sur tes identifiants personnels et doit rester dans le cadre d'usage prevu par le fournisseur.

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

Quand `websiteStatus=no_website`, les lignes candidates passent par une verification INPI:

- si INPI trouve un `nomDomaine`, la fiche est reclassifiee `has_website` et n'est pas persistee,
- si INPI ne trouve aucun domaine declare, la fiche reste `no_website` et peut etre persistee,
- si INPI ne peut pas conclure, la fiche passe en `unknown` / revue manuelle et n'est pas persistee.

## 5) Notes

- En cas de challenge WAF/CAPTCHA, la recherche peut echouer temporairement. Reessaye quelques secondes apres.
- Le mode live utilise une vraie session navigateur Playwright en headless.
- Si INFONET_MODE=live sans identifiants, l'app bascule en mode mock au demarrage.
- Le statut `sans site` cote Infonet est actuellement une approximation basee sur la difference entre la recherche globale et la recherche avec filtre `site web`.
- La validation INPI sert de garde-fou positif: elle confirme bien des domaines declares, mais l'absence de domaine INPI reste un `sans site probable`, pas une preuve absolue.
- L'enrichissement contacts Infonet est best-effort et peut manquer des champs selon la structure des fiches.
- Les leads `sans site` sont persistes automatiquement a la recherche dans le dossier `sans site/`.
- Interface : presets de filtres et historique des recherches (localStorage), export CSV/TXT/XLSX.
