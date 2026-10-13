# Pregled foldera u razgovoru

U izboru **Projekat** razgovora izaberite projekat čiji ste folder povezali u AL AI eksploreru. Zatim pošaljite, na primer: „Da li ima datoteka u folderu ovog projekta?“

Pre svakog novog slanja aplikacija očitava nazive, relativne putanje, vrste i veličine stavki povezanog foldera. Taj pregled prosleđuje modelu zajedno sa pitanjem. Pregled je vezan za projekat razgovora i nalog; izbor drugog projekta samo u eksploreru ne menja projekat razgovora. Kopije datoteka u Biblioteci prikazuju se modelu odvojeno od lokalnih stavki.

Sadržaj dokumenata se ne šalje automatski povezivanjem foldera. Za pitanja o tekstu PDF-a koristite uvoz i izbor dokumenta. Model kroz ovaj pregled nema mogućnost preimenovanja ili brisanja datoteka na disku.

Ako pregledač ponovo traži dozvolu, otvorite eksplorer i omogućite pristup povezanom folderu. Slanje pitanja ne otvara sistemski dijalog za dozvole. Model dobija informaciju kada folder nije povezan, pristup nije odobren ili očitavanje nije uspelo.

Pregled obuhvata najviše 500 stavki i tri nivoa podfoldera ispod korena. Ne ulazi u `.git`, `.svn`, `node_modules`, `.cache`, `.npm-cache` i `.pglite`. Ograničen je i veličinom podataka (najviše 64 KB nakon normalizacije na serveru). Kada je spisak skraćen, model dobija oznaku nepotpunog pregleda. Ponovljeno slanje istog zahteva koristi sačuvani pregled; novo pitanje ponovo očitava disk.

## Primena

Objaviti nove `folder-context.js`, `project-folder-client.js` i `migrations/016_folder_snapshot.sql`, zajedno sa izmenjenim `server.js`, `workspace.js`, `app.js`, `index.html` i `stil.css`. Migracija se automatski primenjuje pri pokretanju servera. Nove zavisnosti nisu potrebne. Nakon objavljivanja ponovo učitati aplikaciju u pregledaču.

Centralna skrol traka razgovora koristi isti diskretan prikaz kao bočni paneli: širina 4 px u Chromium pregledačima, providna u mirovanju i vidljiva pri prelasku miša preko oblasti razgovora.

## Provere

`npm run check`, `npm run test:folder-context` i `npm run test:workspace`.

Provereni su prosleđivanje pregleda u Chat i Work zahtevima, razdvajanje projekata i naloga, očitavanje stvarnih browser filesystem handles u izolovanom testnom prostoru, promena spiska posle brisanja stavke, nedostatak dozvole i izostanak sadržaja dokumenta iz pregleda. Sistemski izbor foldera i dozvole zamenjeni su u testu, a odgovor AI servisa simuliran. Direktna provera odgovora produkcionog modela nije završena zbog neuspešnog mrežnog poziva; testovi potvrđuju podatke i uputstva koja aplikacija šalje modelu.
