# PDF kartice i odgovori hostinga

Novi PDF pregledi počinju sa zumom od **70%**. Procenat u alatnoj traci može se direktno uneti u rasponu **25–300%**; promena se primenjuje pritiskom na Enter ili izlaskom iz polja. Dugmad za uvećavanje i umanjivanje ostaju dostupna. Kartica pri ponovnom otvaranju vraća prethodno izabrani zum.

U lokalnom PDF pregledu dugme **Minimiziraj** (ikonica crte) nalazi se pre dugmeta **Zatvori**. Minimiziranje ostavlja dokument u horizontalnom baru pri dnu aplikacije. Klik na karticu ponovo otvara PDF na sačuvanoj stranici, sa istim zumom i režimom prikaza. Može se otvoriti i minimizirati više dokumenata; kartice imaju ikonice PDF-a i dugme za zatvaranje. Bar se skriva kada nema kartica. Kartice važe do ponovnog učitavanja stranice i uklanjaju se pri promeni naloga. Pri minimiziranju oslobađaju se renderovane stranice i PDF worker; pri ponovnom otvaranju original se čita sa diska.

Slanje PDF-a i priprema indeksa pokreću se kada prompt izričito upućuje na sadržaj PDF-a, dokumenta ili knjige, odnosno navodi datoteku. Obična pitanja i pitanja o spisku datoteka ne pokreću slanje. Nepromenjen PDF koristi pripremljenu kopiju i indeks. Ponovno povezivanje istog foldera čuva podatak o ranije uvezenim kopijama. Promenjen PDF priprema se kada korisnik ponovo postavi pitanje o tom dokumentu.

## HTML umesto JSON-a

Poruka `Unexpected token '<', "<!DOCTYPE" ...` znači da je odgovor koji aplikacija pokušava da pročita kao JSON zapravo HTML. Sam tekst poruke ne utvrđuje da li je uzrok pogrešna adresa/ruta, preusmeravanje, greška hostinga ili istek zahteva. Za potvrdu na objavljenoj aplikaciji potrebni su njen URL i HTTP status neuspelog zahteva.

PDF original se sada šalje direktno kao PDF bajtovi, umesto kao Base64 tekst u JSON-u. Time se zahtev smanjuje za oko četvrtinu u odnosu na raniji Base64 zahtev i izbegavaju dodatne tekstualne kopije na serveru. Postojeći JSON tok ostaje podržan radi kompatibilnosti. Limit originala ostaje 30 MB; autentifikacija i CSRF se proveravaju pre čitanja novog binarnog zahteva. Ova izmena smanjuje opterećenje, ali bez hosting logova ne potvrđuje uzrok ranijeg HTTP 502.

Aplikacija sada prikazuje razumljivu grešku sa HTTP statusom, umesto greške JSON parsera. Ako je tokom slanja PDF-a izgubljena potvrda, proverava da li je isti posao već sačuvan na serveru. Koristi otisak originala i projekat/nalog, bez ponovnog slanja originala. Praćenje postojećeg posla ograničeno ponavlja privremeno neuspele provere. HTTP 413 se ne ponavlja: hosting je odbio veličinu zahteva. Ako prihvatanje nije potvrđeno, korisnik se upućuje da proveri Biblioteku pre ponovnog uvoza.

Ova obrada ne može da popravi nedostupnu ili pogrešno objavljenu serversku rutu. Ako HTML dolazi za svako pitanje, proveriti da se aplikacija otvara sa adrese njenog Node web servisa i da hosting prosleđuje `/api/` zahteve tom servisu. Potrebno je proveriti i logove pokretanja, pristup bazi i status servisa.

## Objavljivanje i provere

Objaviti izmenjene `server.js`, `index.html`, `app.js`, `local-folder.js`, `local-pdf-client.js`, `pdf-import-client.js`, `pdf-imports.js`, `pdf-viewer.js`, `explorer.js`, `accounts.css` i `stil.css`, zatim restartovati server i ponovo učitati aplikaciju. Dodatne migracije i zavisnosti nisu potrebne; postojeće migracije do 016 ostaju potrebne.

Provere: `npm run check`, `npm run test:pdf-recovery-tabs`, `npm run test:explorer-preview` i `npm run test:local-pdf` i `npm run test:pdf-binary-upload`. Greške hostinga simuliraju se vraćanjem HTML-a nakon stvarnog prihvatanja testnog PDF-a i tokom praćenja obrade; to proverava oporavak, ali ne potvrđuje uzrok greške na korisnikovom hostingu.
