# Klientprojekt via Seedy

Robotens båda ögon i sidfoten länkar till `/klienter/`. Där väljer man klientens
webbplats; Coco Thai ligger på `/klienter/cocothai/`. Ögonen fungerar med mus,
tryck och tangentbord, och klientlistan fungerar utan JavaScript.

## Vanlig mapp i hemsidans repo

`klienter/cocothai/` innehåller en kopia av samtliga 110 versionshanterade filer
från `Daugavan/cocothaiflower`, commit `9bbc3fd61d0a264ad20eaafa3507dfd9be01d0ce`.
Git-metadata följer inte med: mappen är varken submodul, iframe eller separat Git-repo.
HTML, CSS, JavaScript, JPG, WebP, dokumentation och befintliga klienttester finns med.
De fem HTML-sidorna har fått `noindex, nofollow` för denna förhandsvisning; klientens
utseende och formulärens mailto-beteende bevaras. Originalrepot är oförändrat.

Sidorna serveras direkt av GitHub Pages från mapparna i hemsidans publiceringsgren.
Det tidigare tokenflödet används inte. Inga egna tokens eller Secrets behövs.
Kopian uppdateras när vi uttryckligen hämtar och checkar in en ny klientversion;
ändringar i originalrepot synkas inte automatiskt.

Listan och klientwebbplatserna är offentliga. `noindex, nofollow` är en önskan till
sökmotorer, ingen åtkomstspärr. Listan finns inte i huvudmenyn, sitemap eller llms.txt.
Vanlig navigering till klientlistan och Coco Thais HTML-sidor visar nu en lösenordsfråga.
Den jämförs i webbläsaren och är bara en barriär: källkod, bilder och andra statiska
filer är fortfarande offentligt åtkomliga med direkta förfrågningar. Nya klient-HTML-sidor
måste ladda `/klienter/access.js` tidigt och använda spärrens låsta sidklass; klienttestet
kontrollerar detta mot registret.

## Bygge och lokal kontroll

`clients.json` anger visningsnamn, ursprungsrepo, kopierad commit och webbplatsens
publiceringsfiler. Publiceringsskriptet läser vanliga lokala filer från `klienter/`
och bygger `site-dist/` med hela portfolion och samtliga klienters webbplatsfiler.
Dokumentation och utvecklingstester bevaras i repot men ingår inte i detta begränsade
exportpaket. GitHub Pages som serverar repots rot kan även servera dessa incheckade filer.

```powershell
node --test tests/security.test.mjs tests/repositories.test.mjs tests/clients.test.mjs
node scripts/prepare-public.mjs
node tests/clients-browser.cjs ../promptflower/.task-temp/browser-tools/node_modules/playwright
node scripts/preview.mjs
```

Förhandsvisning: `http://127.0.0.1:4173/klienter/`. Den tidigare flaggan `--clients`
accepteras för kompatibilitet men behövs inte. Testresultat och bilder lagras i
ignorerade `reports/client-publication/` inom RobotHaven. Använd befintlig Node och
Playwright; installera inga nya lokala beroenden för denna kopia.

## Uppdatera eller lägg till en klient

Hämta aktuell main från klientrepot till en ignorerad arbetskopia under projektets
`.client-sources/`. Kopiera versionshanterade filer till `klienter/<slug>/` utan `.git`.
Verifiera filerna mot källversionen och bevara tidigare material i RobotHavens
`trash/` innan något behöver tas bort. Sätt noindex på klientens HTML och uppdatera
`sourceCommit` samt publiceringslistan i `clients.json` när nya resurser tillkommer.
Kör testerna och pusha hemsidans repo. Lägg nya klienter i samma register;
klientlistans länkar byggs från `label` (eller `slug` när namn saknas).

Alla lokala källor, cachefiler och exporter ska stanna i RobotHaven. Symlänkar och
saknade eller olistade resurser stoppar exportbygget. Webbplatserna delar origin.
GitHub Pages stöder statiska webbplatser; appar med backend behöver separat server.
CocoThais `_headers` och `.htaccess` bevaras men tillämpas inte av GitHub Pages.
