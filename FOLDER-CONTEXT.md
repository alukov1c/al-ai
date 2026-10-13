# Pregled foldera u razgovoru

U izboru **Projekat** razgovora izaberite projekat čiji ste folder povezali u AL AI eksploreru. Zatim pošaljite, na primer: „Da li ima datoteka u folderu ovog projekta?“

Pre svakog novog slanja aplikacija očitava nazive, relativne putanje, vrste i veličine stavki povezanog foldera. Taj pregled prosleđuje modelu zajedno sa pitanjem. Pregled je vezan za projekat razgovora i nalog; izbor drugog projekta samo u eksploreru ne menja projekat razgovora. Kopije datoteka u Biblioteci prikazuju se modelu odvojeno od lokalnih stavki.

Samo povezivanje foldera šalje modelu spisak stavki. Kada postavite pitanje o sadržaju PDF-a (na primer: „Kako glase zadaci 1.12; 1.28 i 1.44 iz dokumenta u folderu ovog projekta?“), aplikacija čita izabrani lokalni PDF, šalje kopiju u Biblioteku projekta i priprema indeks stranica. Ako je u pregledu jedan PDF, koristi njega; ako navedete jedinstven naziv ili relativnu putanju, koristi taj dokument. Kod više mogućih PDF-ova prikazuje izbor. Tok čitanja, slanja i obrade prikazuje se uz razgovor. Pitanja o samom spisku datoteka ne pokreću pripremu PDF-a.

Model dobija relevantne odlomke i brojeve PDF stranica, a ne ceo tekst knjige u jednom zahtevu. Posebna pretraga podržava oznake zadataka poput 1.12, 1.28 i 1.44, uključujući razmake i zarez umesto tačke u izdvojenom tekstu. Kada oznaka nije pronađena u prosleđenim odlomcima, model dobija upozorenje da ne izmišlja njen tekst. Odlomci mogu uključivati nastavak na sledećoj stranici.

Pre ponovnog pitanja proverava se SHA-256 sadržaja lokalnog PDF-a. Nepromenjen dokument koristi postojeću kopiju i indeks; promenjen sadržaj priprema se kao nova kopija. Original na disku ostaje neizmenjen. Važe postojeći limiti: 30 MB po PDF-u, 1500 stranica, 5 miliona izdvojenih znakova, Biblioteka od 100 MB / 100 datoteka i indeks od 20 miliona znakova po nalogu. Skenirani PDF bez tekstualnog sloja zahteva OCR; ova izmena ne uvodi OCR.

Model nema mogućnost preimenovanja ili brisanja datoteka na disku. Čitanje iz foldera radi u Chat i Work režimu. Izričito priložene ili u Work režimu odabrane datoteke imaju prednost nad automatskim izborom.

Ako pregledač ponovo traži dozvolu, otvorite eksplorer i omogućite pristup povezanom folderu. Slanje pitanja ne otvara sistemski dijalog za dozvole. Model dobija informaciju kada folder nije povezan, pristup nije odobren ili očitavanje nije uspelo.

Pregled obuhvata najviše 500 stavki i tri nivoa podfoldera ispod korena. Ne ulazi u `.git`, `.svn`, `node_modules`, `.cache`, `.npm-cache` i `.pglite`. Ograničen je i veličinom podataka (najviše 64 KB nakon normalizacije na serveru). Kada je spisak skraćen, model dobija oznaku nepotpunog pregleda. Ponovljeno slanje istog zahteva koristi sačuvani pregled; novo pitanje ponovo očitava disk.

## Primena

Objaviti nove `local-pdf-client.js`, `folder-context.js`, `project-folder-client.js` i `migrations/016_folder_snapshot.sql`, zajedno sa izmenjenim `server.js`, `workspace.js`, `app.js`, `local-folder.js`, `books.js`, `index.html` i `stil.css`. Migracija se automatski primenjuje pri pokretanju servera. Za čitanje PDF-a nisu potrebne dodatne migracije preko postojeće 016, niti nove zavisnosti. Nakon objavljivanja ponovo učitati aplikaciju u pregledaču.

Centralna skrol traka razgovora koristi isti diskretan prikaz kao bočni paneli: širina 4 px u Chromium pregledačima, providna u mirovanju i vidljiva pri prelasku miša preko oblasti razgovora.

## Provere

`npm run check`, `npm run test:local-pdf`, `npm run test:books` i `npm run test:folder-context`.

Dodatno je proveren PDF od 305 stranica u povezanom testnom folderu: sva tri tražena zadatka stižu u zahtev modelu, nastavak odlomka je dostupan, ponovna pitanja ne stvaraju kopiju, izmena bajtova priprema novu kopiju, više dokumenata otvara izbor, a otkazivanje ne šalje pitanje. Testovi koriste simuliran AI odgovor. Konkretna korisnikova knjiga nije dostupna za proveru u ovom radnom folderu.

Provereni su prosleđivanje pregleda u Chat i Work zahtevima, razdvajanje projekata i naloga, očitavanje stvarnih browser filesystem handles u izolovanom testnom prostoru, promena spiska posle brisanja stavke, nedostatak dozvole i izostanak sadržaja dokumenta iz pregleda. Sistemski izbor foldera i dozvole zamenjeni su u testu, a odgovor AI servisa simuliran. Direktna provera odgovora produkcionog modela nije završena zbog neuspešnog mrežnog poziva; testovi potvrđuju podatke i uputstva koja aplikacija šalje modelu.
