# Olänkade klientförhandsvisningar

Klienternas webbplatser visas direkt under `https://daugavan.github.io/klienter/<slug>/`.
Första klienten är `cocothai`, från det privata repot `Daugavan/cocothaiflower`.
Sidorna är offentliga och kan delas. Avsaknad av länkar och `noindex, nofollow` är
ingen åtkomstspärr. HTML, JavaScript, CSS och bilder är alltid läsbara för besökare.

## Publiceringsflöde

`clients.json` anger varje klients adressnamn, källrepo, gren och exakta publiceringsfiler.
`scripts/fetch-client-sources.mjs` hämtar senaste `main` som en låst commit och verifierar
varje fil mot dess Git-blobhash. Endast listade filer hämtas till ignorerade
`.client-sources/<slug>/`. Koden i klientrepot exekveras inte under hämtning eller bygge.

`node scripts/prepare-public.mjs --clients` bygger hela webbplatsen i `site-dist/`.
Klienternas HTML får `noindex, nofollow` i publiceringskopian. Källrepot ändras inte.
Interna länkar och resurser kontrolleras mot klientens fillista. Relativa URL:er krävs
för lokala resurser; absoluta externa länkar fungerar som i originalet.
Portfolions befintliga filer kopieras utan innehållsändringar. Rotens robots.txt
tillåter läsning så sökmotorer kan upptäcka sidornas noindex-instruktion.
Klienterna läggs inte till i portfolions navigation, sitemap eller llms.txt.

Workflow `deploy-pages.yml` bygger och testar hela webbplatsen före en gemensam
Pages-publicering. Ett fel lämnar föregående driftsatta version kvar. Klientkoden
committas inte till det publika portfoliorepot. Pages-artefakten innehåller endast
det som besökare får läsa och har en dags lagringstid. Privata källfiler, testresultat
och interna dokument laddas inte upp som artefakter. Loggar ska aldrig skriva tokens
eller privata filinnehåll.

## Engångskonfiguration på GitHub

1. Skapa en fine-grained PAT med åtkomst endast till `Daugavan/cocothaiflower`,
   **Contents: Read-only** och automatisk Metadata-läsning. Spara den som
   **CLIENT_REPO_READ_TOKEN** i portfoliorepots Actions Secrets.
2. Skapa en separat fine-grained PAT för endast `Daugavan/daugavan.github.io`,
   **Actions: Read and write**. Spara den som **PORTFOLIO_DISPATCH_TOKEN**
   i klientrepots Actions Secrets. Välj ett utgångsdatum och förnya innan dess.
   Tokens ska anges direkt i GitHubs Secrets-UI, aldrig i chatt, Git eller filer.
3. Installera `config/client-notify.yml` som
   `.github/workflows/notify-portfolio.yml` i klientrepot.
4. I portfoliorepot, välj **Settings → Pages → Build and deployment → Source:
   GitHub Actions**. Kontrollera att miljön `github-pages` tillåter `main` och
   att befintliga miljökrav inte blockerar automatisk publicering.
5. Kör **Publish portfolio and client previews** manuellt på `main` första gången.
   Kontrollera både portfolions startsida och alla fem sidor under
   `/klienter/cocothai/` innan migreringen bedöms klar.
6. Starta klientrepots notifieringsworkflow manuellt för att verifiera kopplingen.
   Därefter startar push till klientens `main` publiceringen automatiskt.

Statistikflödena startar samma publiceringsworkflow efter sina uppdateringar.
Alla publiceringar delar lås och hämtar aktuell portfolio-main efter att låset erhållits.
GitHub kan slå ihop väntande körningar; den senaste begäran bygger aktuell main.
Ingen bestämd publiceringstid garanteras vid köer eller driftstörningar hos GitHub.

## Lokal kontroll

Alla lokala källor, temporära filer och rapporter ska ligga i denna verkliga
projektkatalog under RobotHaven. Kör från projektroten med en befintlig Node-installation:

```powershell
node --test tests/security.test.mjs tests/repositories.test.mjs tests/clients.test.mjs
node scripts/fetch-client-sources.mjs
node scripts/prepare-public.mjs --clients
node tests/clients-browser.cjs ../promptflower/.task-temp/browser-tools/node_modules/playwright
node scripts/preview.mjs --clients
```

Hämtningskommandot behöver `CLIENT_REPO_READ_TOKEN` i processmiljön via en säker
credentialmekanism. En redan verifierad källkopia kan användas i `.client-sources/`
för lokal kontroll utan token. Webbläsartestet använder en befintlig Playwright-modul
och Edge på Windows; CI installerar Chromium. Testerna lagrar resultat och bilder
i ignorerade `reports/client-publication/`. Symlink- och loopbacktester kan behöva
tillstånd från den lokala sandboxen. Ingen ny programinstallation krävs lokalt.

Förhandsvisningen svarar på `http://127.0.0.1:4173`. Utan `--clients` byggs endast
portfolion, vilket bevarar tidigare kommandons beteende. Ett befintligt `site-dist/`
med oväntade eller inaktuella filer avvisas; flytta den gamla mappen till RobotHavens
`trash/` innan ett rent bygge. Befintligt material hårdraderas aldrig.

## Lägg till en klient

Lägg till en post i `clients.json` med ett unikt gemenerat `slug`, repo, `branch: main`
och en uttrycklig lista över alla HTML-, CSS-, JavaScript-, bild- och typsnittsfiler
som behövs. Indexfilen måste heta `index.html`. Inkludera inga interna dokument,
tester, miljöfiler eller backendfiler. Kontrollera att lokala länkar fungerar under
undermappen och att klienten kan serveras statiskt; backend kräver separat drift.

Ge lästoken åtkomst till det nya privata repot och installera notifieringsworkflow
med dess egen dispatch-secret där. Kör publiceringstesterna och verifiera resultatet.
Notifieringen skickar inga filvägar eller repo-val: publiceraren använder endast sitt
versionshanterade register. Webbplatserna delar origin och är inte säkerhetsisolerade
från varandra. Lägg därför endast betrodd klientkod på denna adress.

## Återställ en klientversion

Kör portfolions **Publish portfolio and client previews** manuellt på `main`, med
`client: cocothai` och `ref` satt till önskad fullständig 40-teckens commit-SHA.
Övriga klienter och portfolion byggs från aktuell main. Revisionerna visas i byggloggen.
En sådan återställning gäller denna publicering; nästa automatiska körning använder
main igen. För en bestående återställning, återställ ändringen i klientens main.
Ändra inga skyddade säkerhetskopior. Vid tokenfel eller testfel: rätta orsaken och
kör workflow igen. Gör ingen reservpublicering som utelämnar klienterna.

GitHub Pages kan inte tillämpa CocoThais `_headers` eller `.htaccess`. Sidornas CSP
i HTML bevaras; denna lösning lovar inga extra HTTP-headers på GitHub Pages.
