# Automatiska aktivitetsuppgifter

GitHub Actions hämtar Daugavans offentliga GitHub- och Lovable-profiler varje dag
cirka 05:23 UTC (07:23 svensk sommartid, 06:23 vintertid). Körningen kan också
startas manuellt under Actions → Refresh public activity statistics → Run workflow.
GitHub kan fördröja schemalagda körningar.

`scripts/update-activity.mjs` läser de officiella profilernas kalenderceller och
totaler. Båda måste valideras innan `activity-snapshot.json` ersätts och sparas
i main. Om någon källa ändrar struktur eller inte går att nå misslyckas körningen
och föregående verifierade data finns kvar.

Besökarens webbläsare gör inga GitHub API-anrop. `statistics-data.js` innehåller
verifierad publik repo- och aktivitetsstatistik och levereras som en vanlig statisk
fil från GitHub Pages. `app.js` och `activity.js` läser samma publicerade data.
Omladdningar och delade IP-adresser förbrukar därför ingen GitHub API-kvot.
Datumet visar när uppgifterna faktiskt hämtades; språkbyte bevarar uppgifterna.

`Refresh public repository statistics` körs ungefär en gång i timmen (minut 43).
`scripts/update-repositories.mjs` hämtar bara publika repos med workflowens
kortlivade GITHUB_TOKEN, högst tio sidor per körning, utan automatiska återförsök.
Det validerar hela svaret innan `repositories-snapshot.json` och
`statistics-data.js` skrivs. Kalenderhämtningen körs fortsatt dagligen.
Båda workflowen bygger samma statistikfil och delar en concurrency-grupp så att
de inte skriver över varandras commits. De begär uttryckligen en Pages-build
efter push, eftersom en GITHUB_TOKEN-commit inte själv startar publiceringen.

Om en hämtning, validering eller publicering misslyckas ligger föregående
publicerade statistik kvar. Sidbesök eller upprepade omladdningar startar aldrig
nya bakgrundshämtningar. Statistik kan ligga efter det planerade schemat om
GitHub fördröjer en körning; dess verkliga hämtningsdatum flyttas aldrig fram.
Ingen besöksbegränsning, personlig token i sidan eller ny server behövs.

Alla tre aktivitetskalendrar startar vid den senaste veckan, till höger, när
innehållet är bredare än rutan. Läget behålls när bilder laddas och skärmbredden
ändras. När besökaren börjar skrolla manuellt upphör den automatiska placeringen,
så att språkbyte och nya statistikbilder inte flyttar tillbaka kalendern.

Inga personliga tokens, inloggningscookies eller extra GitHub-hemligheter behövs.
Workflowens kortlivade GITHUB_TOKEN har skrivbehörighet till repots innehåll.
Den sparar enbart den offentliga statistikfilen, inte sidans kod eller utseende.

Codex-profilens fem värden kräver inloggning och uppdateras därför fortfarande
med verifierade profilvärden. Dess lokala aktivitetskalender kan uppdateras med
`scripts/prepare-codex-activity.mjs`, men den lokala historiken finns inte hos
GitHub-runnern. Automatiken flyttar inte fram Codex-boxens verifieringsdatum.

Publika repos schemalagda Actions kan inaktiveras av GitHub efter 60 dagar utan
repoaktivitet. Kontrollera Actions om uppgifterna slutar uppdateras.
