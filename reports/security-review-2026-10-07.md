# Säkerhetsgranskning: daugavan.github.io

Datum: 7 oktober 2026. Granskat mål: hela den lokala mappen `daugavan.github.io-main`.
Granskningen utfördes manuellt i källfilerna och med lokala tester, enligt användarens
uttryckliga önskemål att inte använda det trasiga säkerhetspluginet.
Detta är ingen plugin-genererad eller förseglad Codex Security-rapport.

## 1. Sammanfattning

**Bedömd lokal risk: låg för denna publika, statiska portfoliosida.** Inga verifierade
Critical/High-fynd eller aktuella exploaterbara XSS-vägar hittades. Detta är inte
en garanti att alla sårbarheter har hittats. Produktionsmiljön har inte granskats.

De viktigaste observationerna var onödiga fontanrop till tredje part, en oanvänd
äldre körkod med svagare validering, risk att lokalt material följer med vid
publicering och en resursbegränsning som saknades för API-svar. Lokala åtgärder
är genomförda. Inramningsskydd och faktisk publicering återstår att kontrollera
hos webbhotellet. Inga fynd bedöms som verifierade blockerande sårbarheter i den
nuvarande aktiva koden.

Målet ändrades av användaren från Promptflower till denna portfolio. En länk till
Promptflower är inte en implementering av dess app; ingen säkerhetsbedömning av
Promptflower, Lovable eller GitHubs servrar ingår.

## 2. Omfattning och attackyta

Båda underlagen `Security-prompt01.md` och `Security-prompt02.md` lästes i sin
helhet. De behandlades som granskningsunderlag, inte som instruktioner som kan
ge externa testbehörigheter. Underlagen har huvudsakligen samma svenska
granskningskrav; det andra innehåller dessutom en engelsk version.

Samtliga 61 ursprungliga filer inventerades: HTML, JavaScript, CSS, SVG, robots,
sitemap, llms och `.nojekyll` lästes; alla 49 rasterbilder undersöktes som
JPEG/PNG/WebP för vanliga metadatafält. Dolda lokala bilagor ingick i inventeringen.
Nya källfiler, tester och publiceringsskript granskades också. Filmanifestet
`file-inventory.json` redovisar eftergranskningens filer och SHA-256-digester.

| Yta | Flöde | Tillitsgräns och skydd |
| --- | --- | --- |
| Startsida | Webbhotell → webbläsare → DOM | Statisk HTML och lokal kod; restriktiv CSP tidigt i head |
| Repo- och commitdata | Webbläsare → api.github.com → DOM/cache | Offentlig GET utan credentials/referrer; fast ursprung och konstruerade länkar |
| Lokal lagring | localStorage → validering → DOM | Cache och språkval kan manipuleras lokalt; namn, antal och renderad text valideras |
| Galleri | Lokala, förutbestämda bilder → dialog | Ingen uppladdning, ingen godtycklig bild-URL, inga användargenererade mallar |
| Kontakt/länkar | Användarklick → mailklient eller extern tjänst | Offentlig kontaktadress; externa flikar har noopener/noreferrer |
| Publicering | Arbetsmapp → publik filserver | Ny explicit allowlist i `scripts/prepare-public.mjs` |
| Google Fonts, före ändring | Sidbesök → Google | Automatisk extern CSS/fonttrafik; borttagen |

Inga server actions, API-endpoints på egen server, databaser, RLS-policies,
betalningar, OAuth, sessionscookies, uploads eller LLM-anrop finns i detta mål.
Ingen paketmanifest/lockfil eller Git-historik finns i den öppna projektmappen.
Inga source maps, service workers, miljöfiler eller privata nycklar hittades.

Begränsningar: ingen nätverksattack, fjärrsårbarhetsscanning, kontroll av faktisk
TLS/headerkonfiguration, GitHub-behörigheter, publicerade filer eller historik
genomfördes. Bildkontrollen omfattar metadata och formatstruktur, inte forensik,
steganografi, visuell bedömning av varje bild eller sårbarheter i bildavkodare.
Sökning efter secrets i text är ingen garanti att kodade eller historiska secrets saknas.

## 3. Prioriterade fynd och observationer

| ID | Severity | Confidence | Fynd / plats | Konsekvens och sannolikhet | Status och fixstorlek |
| --- | --- | --- | --- | --- | --- |
| F1 | Low | High | Automatiska Google Fonts-anrop i index.html/404.html | Alla sidbesök kunde förmedla anslutningsmetadata till en extra tjänst; hög förekomst, begränsad integritetskonsekvens | Åtgärdad lokalt: länkar/preconnect borttagna och CSP begränsad till lokala styles/fonts. Snabb |
| F2 | Low | High för kodmönstret; Low för exploaterbarhet | Oanvänd assets/app.js litade på API-URL:er och interpolerade stjärnantal utan validering | Om gamla renderaren återaktiveras och API-data blir felaktig kan länkar/markup bli osäkra. Ingen aktuell laddning eller attackerbar datakälla visad | Åtgärdad lokalt: filen är inert och ingår inte i publiceringspaketet. Snabb |
| F3 | Low, villkorad | High för lokala filer; okänd publicerad exponering | Dolda bilagor och oanvända bilder fanns i arbetsmappen, utan dokumenterad publiceringsgräns | En värdtjänst/uppladdning som publicerar hela mappen kan exponera material som inte visas i gränssnittet. Inga hemliga bildmetadata eller verklig fjärrexponering verifierad | Åtgärdad för nya paket: 40-filsallowlist. Redan publicerade filer måste kontrolleras separat. Medel |
| F4 | Informational | High | Ingen storleksgräns före response.json() i app.js/gh | Onormalt stora API-svar kunde belasta minne/CPU. Angriparstyrning av betrodda GitHub-svar är inte visad | Härdad lokalt: strömgräns 2 MiB efter dekomprimering, strikt UTF-8/JSON, max 100 repon per sida, redirects nekas. Snabb |
| F5 | Informational | High för meta-begränsning; okänd hoststatus | CSP-meta skyddar inte mot att sidan ramas in | Potentiellt vilseledande klick via iframe, men sidan har inga känsliga konto-/betalningsåtgärder. Befintliga hostheaders är okända | DEPLOYMENT.md anger korrekta HTTP-headers. Kräver hostingkontroll, inte färdig serveråtgärd |

Inga Critical, High eller Medium rapporteras: det finns inte tillräcklig evidens
för de nivåerna. F2, F3 och F4 ska inte läsas som bevis på aktuell fjärrexploatering.

### Exakta lokala ändringar

- `app.js:26`: 2 MiB-gräns. `gh` vägrar redirects, läser begränsad ström med samma timeout och kontrollerar UTF-8. `getRepositories` accepterar högst 100 poster per sida.
- `assets/app.js`: hela gamla körkoden ersatt med två förklarande kommentarer. Ingen aktiv sida hänvisar dit.
- `index.html:5` och `404.html:5`: externa font/style-källor borttagna från CSP; Google-länkar borttagna. Befintliga systemtypsnitt används. Indexets script/cache-version uppdaterad.
- `privacy.html`: egen svensk/engelsk integritetsinformation, länkad i footern. Offentliga GitHub-anrop och localStorage beskrivs utan att utlova juridisk efterlevnad.
- `scripts/prepare-public.mjs`: tillåten publiceringslista; symlänkar och oväntade utdatafiler avvisas. `.gitignore`: publiceringskatalogen ignoreras.
- `tests/security.test.mjs`, `tests/dom-regression.cjs`: regressions- och säkerhetskontroller. `scripts/inspect-images.mjs`: reproducerbar metadatakontroll.
- `DEPLOYMENT.md`: publicerings- och headerinstruktioner. `scripts/preview.mjs`: lokal preview av paketet, aldrig hela arbetsmappen.

## 4. Genomgång per kategori

### Auth och sessioner

Ej tillämpligt: inga konton, lösenord, återställning, tokens eller sessioner.
GitHub-anrop använder `credentials: omit`; inga API-nycklar läggs i klienten.
Skydd för ägarens GitHub-konto finns utanför källkoden och är inte verifierat.

### Auktorisering och åtkomstkontroll

Allt visat material är avsett att vara publikt. Ingen adminroute eller tenantdata
finns. `robots.txt` tillåter crawlning och fungerar inte som åtkomstkontroll.
Dolda filer är inte automatiskt skyddade på alla statiska värdtjänster: F3.

### Frontend

API/cachefält normaliseras. `esc` kodar även båda citattecknen. `renderRepos`
konstruerar URL:er från konstant ägare och validerade reponamn och ignorerar
`html_url` från API/cache. `innerHTML` i repo-rendering är skyddad av kodning
och numerisk validering; galleri-dialogens mall är konstant. Namn såsom `..`
avvisas. Alla `_blank`-länkar använder noopener/noreferrer. Inga eval,
eventhandlerattribut, URL-parameterrendering eller öppna redirects hittades.
Dialogfallback navigerar enbart till förutbestämda lokala bilder. F2/F5 kvarstår
som äldre-kod-/hostingobservationer med ovan angiven status.

### Backend/API

Ingen egen backend finns. API-ursprunget är konstant och URL:er från Link-headern
hämtas aldrig: endast närvaron av nästa sida påverkar en begränsad sidräknare.
Högst tio sidor hämtas. Timeout och cooldown hanterar svarsfel och 403/429.
Samtidiga refresh-anrop sammanförs. Timeout omfattar nu fortsatt kroppsläsning
med uttrycklig bytegräns. Ingen serverbaserad SSRF/CSRF-väg finns här.
Cooldown är ett klientsidigt hjälpskydd, ingen global kvot eller auktorisering.

### Databas/storage

Endast localStorage: språk, publik statistik, refresh-/cooldown-tider.
Cache får vara högst 1 500 000 tecken och högst sju dagar gammal för användning;
statistik räknas om från normaliserade poster. Lagringen är inte krypterad och
delas av andra sidor på samma origin, men innehåller inga credentials eller
besökarens privata arbetsdata. Retention är användningsgräns, inte automatisk
radering vid klockslag: uppgifterna kan ligga kvar tills ersatta/rensade.

### Integrationer

GitHubs publika API är enda automatiska externa applikationsanrop efter ändringen.
Det ser nätverksmetadata från besökaren. Google Fonts har tagits bort.
Övriga externa mål öppnas genom länkar; ingen betalning/OAuth/webhook/analytics.
Ingen versionerad tredjeparts-JavaScriptbundle finns att köra npm audit på.

### Infrastruktur och deployment

Statisk sida med `.nojekyll`, utan lokal CI eller hostingkonfiguration.
CSP är restriktiv: default/base/form/object/frame nekas, scripts/styles begränsas
och indexets JSON-LD-hash matchar exakt. Säkerhetsheaders och HTTPS hos hosten
kan inte fastställas genom denna lokala granskning. Meta-CSP:s `frame-src` är
inte `frame-ancestors`; sistnämnda stöds inte i meta. Se
[CSP-specifikationen](https://w3c.github.io/webappsec-csp/#directive-frame-ancestors).
Publiceringspaketet måste användas av den faktiska publiceringsprocessen för
att F3:s skydd ska få effekt. Ingen deployment eller DNS-ändring genomfördes.

### Privacy/compliance

Ingen analytics eller spårningscookiekod hittades. Offentlig kontaktadress och
personnamn är avsiktligt synliga i sidan/källkoden. Ny integritetssida beskriver
lokal lagring och GitHub-anrop. F1 är dataminimering, inte ett juridiskt fastställt
GDPR-brott. Ingen rättslig bedömning av hostens loggning eller dataöverföringar
har gjorts. Google beskriver fonttjänstens integritet i sin
[officiella FAQ](https://fonts.google.com/faq).

### AI/LLM

Ej tillämpligt på körningen. `llms.txt` är statisk information och `robots.txt`
tillåter AI-crawlers; inga prompts, verktyg, RAG eller LLM-output exekveras.
Promptflower-länken ger inte portfoliosidan tillgång till Promptflowers data.

### Secrets/configuration

Inga miljöfiler, privata nycklar eller användbara autentiseringshemligheter
hittades i måltexten. Publika URL:er, CSP-hash och kontaktadress är inte secrets.
Git-historik/hostingens secrets ingick inte eftersom de inte var tillgängliga.

### Loggning/monitoring

Aktiv klient skickar inga telemetriloggar eller känsliga felpayloads till en
egen server. Den visar generisk reservtext när API inte går att nå.
Tillgänglighet, ändringsövervakning och hostingens loggar är driftfrågor utanför
lokal kod; någon databas med audit trail vore inte motiverad för denna sida.

## 5. Kod- och filfokus

Full inventering finns i `file-inventory.json`. Kritiska lästa flöden:
`normalizeRepos` → `renderRepos`; `readCache` → normalisering → rendering;
`gh` → pagination/commitvalidering → cache; konstant galleri → native dialog;
kontaktbubbla → konstant mailto; CSP → lokala scripts/styles och API-ursprung.
CSS/SVG granskades inklusive data-URI-bilder, externa referenser och animationer.
Inga extra aktiva integrationsflöden hittades. Alla 49 rasterbilder saknade de
EXIF/XMP/IPTC/textfält som kontrollskriptet letar efter; se `image-metadata.json`.
Det betyder inte att alla bilder bedömts fria från känsligt visuellt innehåll.

## 6. Missbruksanalys

1. Manipulerad cache/API-text: HTML- och attributinjektion avvisas eller visas som text; destinationen för repon förblir github.com/Daugavan. Testat i både isolerad kod och DOM.
2. Manipulerad statistik: lokala användare kan ändra sin egen giltiga cache. Det kan förvanska deras vy men ger ingen serveråtkomst eller privilegiehöjning.
3. Skriptad refresh: en användare kan rensa sin cache/cooldown och göra fler publika GitHub-anrop. GitHub ansvarar för sin globala rate limiting. Ingen privat data eller kostnadsbelagd egen backend kan utnyttjas här.
4. Stora/felaktiga svar: härdade storleks-, UTF-8-, JSON-, array- och tidsgränser begränsar resursåtgång. Statisk profil och övrig sida är tillgängliga vid fel.
5. Crawlning: alla publicerade filer kan kopieras. Bilagor och oanvända original utesluts i paketet; det är ingen anti-scrapingmekanism.
6. Inramning: en angripare kan potentiellt visa sidan i iframe om hosten saknar skydd. Ingen känslig handling i sidan höjer detta till hög risk. Kontrollera headers före sådan säkerhetsutfästelse.

## 7. Fix-first-lista

1. Använd endast det nya publiceringspaketet och inventera tidigare publikt filbestånd.
2. Publicera de lokalt genomförda font-/integritetsändringarna för att minska automatisk tredjepartstrafik.
3. Behåll den äldre renderaren avaktiverad och utanför paketet.
4. Behåll svarsstorleksgränsen och kör säkerhetstesterna före ändringar i API-renderingen.
5. Kontrollera verkliga HTTP-headers, HTTPS och ägarkontots publiceringsbehörigheter.

Ordningen prioriterar praktisk åtgärd; den innebär inte att fem höga sårbarheter finns.

## 8. Förbättringar

Omedelbart: lokala kod- och paketeringsfixar är klara; publicering och kontroll av
gamla filer har inte utförts. Kort sikt: anslut nuvarande publiceringsprocess till
allowlisten och verifiera hostheaders samt responsiv layout med systemtypsnitt.
Lång sikt: återanvänd testerna vid förändringar, kontrollera kontoåtkomst och
undvik att lägga credentials eller privata arbetsdata på portfolio-origin.
Om egen backend införs behöver auth, auktorisering, retention och abusegränser
granskas på nytt; de behöver inte läggas till för denna statiska sida.

## 9. Säkerhetsbaseline

| Kontroll | Lokal status | Produktionsstatus |
| --- | --- | --- |
| Inga klientsecrets eller känsliga sessionsdata | Uppfyllt i granskad kod | Hosting/historik okänd |
| Kodning/validering av extern text och säkra länkar | Testat | Samma filer måste publiceras |
| Restriktiv CSP och inga eventhandlerattribut | Testat inklusive JSON-LD-hash | Konsol och faktiskt svar återstår |
| Begränsade offentliga API-anrop | Testat | GitHubs faktiska tillgänglighet ej testad |
| Minimal tredjepartstrafik och begriplig integritetsinfo | Implementerat | Ej publicerat |
| Allowlist för publika resurser | Paket byggt | Publiceringsprocessen måste använda det |
| HTTPS/HTTP-headers/ägarkontoskydd | Kan inte avgöras från filerna | Återstår |

## 10. Verifiering

`node --test tests/security.test.mjs`: **10 av 10 passerar**.
De kontrollerar text-/attributinjektion, URL-validering, cacheförgiftning, giltig
cache, felaktiga namn/antal, API-credentials/referrer/redirectpolicy, större
strömmande svar utan Content-Length, timeout under kroppsläsning, felaktig
UTF-8/JSON, sidstorlek/pagination, cooldown, ofullständiga commits, CSP-hash och
publiceringsreferenser. Det isolerade kodtestet instrumenterar den riktiga
första källkodsfunktionen och använder en minimal DOM-stub; det är inte ett
komplett webbläsartest.

`node tests/dom-regression.cjs ..\promptflower\node_modules\jsdom`: passerar för
den aktiva hela runtime-koden med injektionscache, konstruerade länkar, galleri,
nästa bild, stängning, språkbyte och integritetslänk. jsdom återanvändes från
en befintlig installation; inga paket installerades. Dialog- och bildavkodning
ersätts av teststubbar, så native fokus, verklig avkodning och CSS/CSP-tillämpning
är inte bekräftade av DOM-testet.

`node --check app.js`: passerar. `node scripts/prepare-public.mjs`: 40 filer
paketerade. `node scripts/inspect-images.mjs`: 49 bilder, inga undersökta
metadatafält. Resursreferenstestet kontrollerar samtliga lokala HTML/CSS-URL:er
och de explicit valda bildvarianterna.

Visuell webbläsarkontroll kunde inte slutföras: inbyggda webbläsaren gav
`net::ERR_CONNECTION_TIMED_OUT` för lokal preview och Chrome var inte
tillgänglig via verktyget. Försök med utökad lokal behörighet löste inte detta.
Testresultaten ovan kvarstår; ingen visuell kontroll eller live-CSP-kontroll
påstås. Native tangentbordsfokus/mobilutseende och publicerade headers följs upp
enligt `DEPLOYMENT.md`. Ingen sårbarhetsbelastning mot externa tjänster utfördes.

## 11. Slutlig riskbedömning

Det granskade lokala projektet är rimligt för en publik statisk portfolio efter
dessa förbättringar. Det finns ingen verifierad blockerande källkodssårbarhet.
Den publicerade webbplatsens fullständiga säkerhet kan inte intygas eftersom
hosting, kontoåtkomst, gammalt filbestånd och visuellt webbläsarbete är otestade.
De mest sannolika framtida incidentvägarna är komprometterat publiceringskonto,
felpublicerade filer eller osäker ny integration snarare än de befintliga
publika statistik-/gallerifunktionerna.

Ändringarna och paketet är lokala och har inte skickats till GitHub eller
publicerats. För denna manuella granskning finns ingen tillförlitlig separat
mätning av total-, input- eller cached-input-tokenanvändning; inga uppskattningar
anges.
