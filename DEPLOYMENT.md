# Säker publicering

Projektet är en statisk webbplats utan installations- eller kompileringskrav.
Kör med en befintlig Node.js-installation:

```powershell
node --test tests/security.test.mjs
node --check app.js
node scripts/prepare-public.mjs
```

Publicera **enbart innehållet i `site-dist`**. Byggskriptet anger uttryckligen vilka filer som ingår.
Hela arbetsmappen ska inte laddas upp. Bilagor, rapporter, testscripts, oanvända
bilder och den gamla `assets/app.js` ingår inte. De bevaras lokalt.
Om destinationen redan innehåller filer måste dess publicerade filbestånd jämföras
mot paketet: en uppladdning som bara lägger till filer tar inte bort äldre exponeringar.
Byggskriptet avvisar oväntade filer och symlänkar i `site-dist` och avvisar symlänkar i källsökvägarna.

## HTTP-headers på webbhotellet

HTML innehåller CSP-metaelement, men `frame-ancestors` måste levereras som HTTP-header.
Lägg följande headers på alla HTML-svar, inklusive felsidor, om vald värdtjänst stöder det:

```http
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Den extra CSP-headern kombineras med sidornas befintliga CSP. Den ersätter inte
deras policy för scripts, styles och anslutningar. Lägg inte `frame-ancestors`
i metaelement: webbläsaren tillämpar inte direktivet där.
[Direktivets specifikation](https://w3c.github.io/webappsec-csp/#directive-frame-ancestors).

Den här lokala leveransen ändrar inga inställningar hos GitHub Pages och verifierar
inte vilka headers tjänsten redan skickar. Om nuvarande värdtjänst inte erbjuder
headerstyrning krävs en konfigurerbar proxy eller värdtjänst för dessa extra skydd.
Ingen flytt eller publicering är genomförd.

Kontrollera HTTPS och faktisk redirect från HTTP på den publicerade domänen.
Aktivera HSTS via värdtjänsten först efter kontroll av alla berörda subdomäner.
Se även över behörigheter och MFA för GitHub- och publiceringskontot.

## Verifiering efter publicering

Aktivitetsdelen ovanför sidfoten visar användarens sparade skärmbilder:
`images/github-activity.jpg` och `images/lovable-activity.jpg`.
De är märkta som ögonblicksbilder och uppdateras genom att ersätta bildfilerna
och vid behov justera deras alt-texter i `index.html` och `app.js`.
Länkarna går till respektive profil för aktuell aktivitet. GitHub-statistiken
högre upp på sidan hämtas fortfarande live. På smala skärmar kan kalendrarna
skrollas i sidled med touch eller tangentbord.

1. Kontrollera att hemsidan, integritetssidan, alla sex bilder och 404-sidan fungerar.
2. Kontrollera att nätverkspanelen inte visar anrop till Google Fonts.
3. Kontrollera CSP-konsolen och att GitHub-statistik fortfarande laddas eller visar tydlig reservtext.
4. Kontrollera svarens verkliga headers och att externa sidor inte kan rama in sidan när skyddet aktiverats.
5. Kontrollera att gamla bilagor, testfiler och oanvända filer saknas i hostingens filbestånd.
6. Kontrollera skrivbord/mobil, tangentbordsfokus och reducerad rörelse. Systemtypsnitten ersätter Google Fonts.

Valfri lokal förhandsvisning: `node scripts/preview.mjs` (127.0.0.1:4173).
Den visar endast publiceringspaketet; dess lokala headers är inte bevis för produktionsheaders.

DOM-testet använder en befintlig installation av `jsdom`:

```powershell
node tests/dom-regression.cjs ..\promptflower\node_modules\jsdom
```

Sökvägen är den installation som fanns tillgänglig vid granskningen. På en annan
dator kan valfri befintlig `jsdom`-installation anges som andra argument.
Inga beroenden har installerats eller uppdaterats för denna granskning.

## Terminalintroduktion

Startsidan visar en tre sekunder lång terminalboot en gång per fliksession.
`boot.js` körs direkt efter det dolda terminalöverlägget, före sidinnehållet,
för att undvika att hemsidan blinkar fram först. Introduktionen väntar inte
på GitHub-anrop. Hoppa över-knappen och Escape avslutar direkt; en separat
fyrasekunderstimer frigör sidan om normal avslutning uteblir.

Sessionsmarkören `daugavan_portfolio_boot_v1` lagras när introduktionen börjar.
Reducerad rörelse, ankarlänkar och historiknavigering går direkt till hemsidan.
Om lagring blockeras kan introduktionen återkomma vid omladdning. Övriga HTML-sidor
har ingen introduktion. För att se den igen kan man öppna en ny fristående flik
och skriva in adressen, eller rensa sessionsmarkören i webbläsarens utvecklarverktyg.

Efter `node scripts/prepare-public.mjs` körs webbläsarverifieringen med en befintlig
Playwright-installation och Edge. Ingen ny installation krävs:

```powershell
node --check boot.js
node tests/boot-browser.cjs ..\promptflower\.task-temp\browser-tools\node_modules\playwright
```

Testet startar en egen lokal HTTP-server för publiceringspaketet och kontrollerar
15 scenarier: desktop/mobil, sessionsbeteende, klick/Escape, svensk text,
reducerad rörelse, avstängt JavaScript, blockerat script/lagring, ankarlänkar,
historiknavigering och säkerhetstimern. Skärmbilder och webbläsarens temporära
profil placeras i projektets `reports/` och ingår inte i publiceringspaketet.

