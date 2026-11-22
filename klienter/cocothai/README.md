# cocothaiflower

Webbplatsen för Coco Thai i Borlänge. Statisk HTML, CSS och JavaScript med JPG- och WebP-bilder.

## Sidor

- `index.html` – startsida
- `meny.html` – meny
- `boka.html` – bokning
- `kontakt.html` – kontakt och karta
- `integritetspolicy.html` – integritetspolicy

## Förhandsvisning

Öppna `index.html` i en webbläsare eller servera mappen med valfri statisk webbserver. Inget byggsteg krävs.

Privat förhandsvisning: https://cocothai-mobile-preview.daugavan.chatgpt.site

## Drift

Publicera filerna i repots rot tillsammans med `webp/`. `_headers` innehåller säkerhetsheaders för kompatibla webbhotell och `.htaccess` för Apache.

Formulären öppnar besökarens e-postklient med `mailto:`. Webbplatsen har ingen server för bokningar.

## Glaseffekter

Navigationen har gröntonat glas och menyns aktiva kategori markeras av en
avbrytbar glidande kapsel. Startsidan har en lokal rubriklins med försiktig
kantbrytning och en glasvariant av den sekundära bokningsknappen.

Switchen **Glaseffekter** i sidfoten väljer glas eller solida ytor på alla fem
sidor. Valet sparas lokalt; systemets inställningar för rörelse, kontrast och
transparens respekteras. Formulär och längre läsytor behåller stabila bakgrunder.

Detta är en webbtolkning av Liquid Glass. Se [granskning och verifiering](GLASS_REVIEW.md)
för före-/efterbilder, tester, mätningar och återstående kontroller före publicering.

Utvecklingstesterna i `tests/` använder Playwright och `pngjs`; de krävs inte för
att servera webbplatsen.
