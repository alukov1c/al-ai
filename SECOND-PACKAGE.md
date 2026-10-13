# Drugi paket: lokalni folderi i uvoz razgovora

## Korišćenje

1. U meniju projekta izaberite **Uredi projekat i uputstva → Lokalni folder → Poveži folder**. Novi projekat prvo sačuvajte.
2. Izaberite datoteke i pritisnite **Uvezi izabrane datoteke**. Kopije se čuvaju u Biblioteci tog projekta. U Work režimu izaberite do pet datoteka za obradu.
3. Ispod Work odgovora izaberite **Sačuvaj u lokalni folder**. Dokument se čuva u novom fajlu u podfolderu `AL-AI-rezultati`, uz dozvolu pregledača za upis. Postojeći fajlovi se ne prepisuju.
4. Za uvoz razgovora otvorite **Podešavanja → Biblioteka → Uvezi razgovore iz AI aplikacije**, odaberite projekat i JSON datoteku. Pregledajte broj razgovora/poruka, pa pritisnite **Uvezi razgovore**.

## Lokalni folder

Direktan pristup zavisi od dostupnosti `showDirectoryPicker` u pregledaču i sigurnog konteksta (HTTPS ili localhost); osnovni cilj su Chrome/Edge. Veza se čuva u IndexedDB samo u tom pregledaču, po nalogu i identifikatoru projekta. Dozvole mogu zahtevati ponovno odobrenje. Server nema putanju niti direktan pristup lokalnom disku. Stranica mora biti otvorena za čitanje i čuvanje.

Pregled rekurzivno čita najviše 1000 stavki i osam nivoa podfoldera; preskače skrivene stavke, `node_modules` i `AL-AI-rezultati`. Podržani su postojeći formati priloga: PDF/DOCX/XLSX/PPTX, TXT/MD/CSV/JSON/LOG i PNG/JPG/WebP/statički GIF. Uvoz je ograničen na 20 datoteka po operaciji, 30 MB po PDF datoteci, 3 MB za ostale formate i postojeći prostor naloga (100 datoteka / 100 MB). Postojeći dokumentni moduli moraju biti uključeni.

Sadržaj se šalje serveru tek za izabrane datoteke. Work potom koristi uvezene kopije, a ne automatski najnovije stanje lokalnih originala. Za promene izaberite **Osveži datoteke** i ponovite uvoz. SHA-256 sadržaja i relativna putanja služe za preskakanje već uvezene neizmenjene datoteke, ako njena kopija još postoji u istom projektu. Promenjeni sadržaj pravi novu kopiju. Biblioteka prikazuje osnovna imena datoteka; relativne putanje vidljive su u lokalnom pregledu.

U pregledaču bez direktnog pristupa dostupan je izbor foldera za uvoz. Taj izbor važi do zatvaranja stranice i ne omogućava direktan upis rezultata; tada koristite postojeće preuzimanje dokumenta. **Odveži folder** uklanja lokalnu vezu, a kopije ostaju u Biblioteci. Brisanje projekta ne daje pristup tom folderu novom projektu, jer je veza vezana za njegov stari identifikator.

## JSON razgovori

Podržani su:

- ChatGPT `conversations.json`: aktivna grana preko `current_node` i `mapping`; ostale grane se ne spajaju.
- Claude JSON: `chat_messages`, `human`/`assistant` i tekstualni sadržaj.
- Opšti JSON: jedan razgovor, niz razgovora ili objekat sa `conversations`. Svaki razgovor ima `title` i `messages` sa `role: user/assistant` i tekstualnim `content`.

Primer opšteg formata:

```json
[{"title":"Primer","messages":[{"role":"user","content":"Pitanje"},{"role":"assistant","content":"Odgovor"}]}]
```

Iz ZIP izvoza prvo izdvojite JSON datoteku. HTML, ZIP, deljeni linkovi i proizvoljni formati drugih provajdera nisu podržani. Najviše 3 MB po JSON datoteci, 100 razgovora, 5000 poruka ukupno i 2000 po razgovoru. Za veći izvoz pripremite manje JSON celine.

Uvoz prenosi samo tekst korisnika i asistenta. Sistemske poruke i pozivi alatki se izostavljaju; prilozi, slike, originalni datumi, potrošnja tokena i izvorni model ne prenose se. Uvezene konverzacije mogu se nastaviti sa postojećim AL AI modelom. Svi razgovori iz jednog uvoza čuvaju se atomski. Ponovni uvoz istog naslova i istih poruka na istom nalogu preskače duplikat, uključujući izbor drugog projekta. Ne premesta prethodnu kopiju; ona se može premestiti postojećim menijem. Uvoz ne poziva AI model.

## Objavljivanje i provere

Uključiti nove `conversation-import.js` i `local-folder.js`, kao i izmenjene `server.js`, `files.js`, `app.js`, `index.html`, `stil.css` i `package.json`. Nove migracije i zavisnosti nisu potrebne; koristi se postojeća baza prvog paketa. `.gitignore` izuzima nove module i testove iz opšteg `*.js` pravila.

Provere: `npm run check`, `npm run test:second-package`, `npm run test:second-package-ui`, `npm run test:workspace`. Testovi koriste probnu PGlite bazu i simulirani odgovor modela. Provera pregledača koristi stvarne filesystem handles u izolovanom origin storage-u, uz zamenu sistemskog pickera/dozvola, i stvarni testni folder za rezervni uvoz. Time se ne potvrđuje ručni sistemski izbor/dozvola na korisnikovom računaru niti objavljena aplikacija.

PDF limit je 30.000.000 bajtova. Veći PDF može se uvesti i pregledati, ali izdvojeni tekst i dalje ima limit 40.000 znakova. Obrada PDF-a ima do 60 sekundi; skenirani PDF zahteva OCR koji ovaj tok ne uključuje.
