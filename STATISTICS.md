# Automatiska aktivitetsuppgifter

GitHub Actions hämtar Daugavans offentliga GitHub- och Lovable-profiler varje dag
cirka 05:23 UTC (07:23 svensk sommartid, 06:23 vintertid). Körningen kan också
startas manuellt under Actions → Refresh public activity statistics → Run workflow.
GitHub kan fördröja schemalagda körningar.

`scripts/update-activity.mjs` läser de officiella profilernas kalenderceller och
totaler. Båda måste valideras innan `activity-snapshot.json` ersätts och sparas
i main. Om någon källa ändrar struktur eller inte går att nå misslyckas körningen
och föregående verifierade data finns kvar.

Hemsidans `activity.js` läser JSON-filen via GitHubs offentliga Contents API,
uppdaterar de två befintliga boxarna och bygger kalenderbilder av validerade
siffror. Detta fungerar även när en bot-commit inte startar en Pages-publicering.
Besökaren får en lokal cache i 30 minuter. Vid API-fel visas den senaste sparade
statistiken, eller de verifierade reservvärdena i HTML. Hämtningens datum finns
i bildens alt-text och i rubrikens tooltip. Språkbyte behåller uppdaterad data.

Inga personliga tokens, inloggningscookies eller extra GitHub-hemligheter behövs.
Workflowens kortlivade GITHUB_TOKEN har skrivbehörighet till repots innehåll.
Den sparar enbart den offentliga statistikfilen, inte sidans kod eller utseende.

Codex-profilens fem värden kräver inloggning och uppdateras därför fortfarande
med verifierade profilvärden. Dess lokala aktivitetskalender kan uppdateras med
`scripts/prepare-codex-activity.mjs`, men den lokala historiken finns inte hos
GitHub-runnern. Automatiken flyttar inte fram Codex-boxens verifieringsdatum.

Publika repos schemalagda Actions kan inaktiveras av GitHub efter 60 dagar utan
repoaktivitet. Kontrollera Actions om uppgifterna slutar uppdateras.
