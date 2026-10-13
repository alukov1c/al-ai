# PDF knjige i napredak uvoza

## Korišćenje

Uvezite PDF kroz Biblioteku, prilog ili lokalni folder. Original se čuva kao ranije, a tekst se izdvaja po PDF stranicama i deli na odlomke. U Biblioteci izaberite **Čitaj knjigu**. Za ranije uvezene PDF-ove izaberite **Pripremi PDF za čitanje**.

Unesite pitanje ili ključne reči. **Pronađi odlomke** prikazuje delove teksta sa rednim brojem PDF stranice. **Pitaj o knjizi** koristi pronađene odlomke i čuva odgovor u razgovoru. Na kraju odgovora navode se PDF stranice stvarno prosleđene modelu. To je spisak podloge odgovora, ne automatska potvrda da je svaka tvrdnja tačna. Štampana numeracija knjige može se razlikovati od PDF numeracije.

Za duži PDF priložen u Chat režimu ne šalje se ceo tekst. Pretražuju se odlomci relevantni za pitanje. Prvo pitanje i naredne poruke u tom razgovoru koriste povezanu knjigu. Pretraga je po rečima/prefiksima, nije semantička pretraga ili automatski prevod; koristite pojmove i pismo iz knjige. Pitanje poput „sažmi celu knjigu“ u običnom Chat/Work toku koristi odlomke i nije obrada svih strana. Za ceo sadržaj koristite posebnu opciju za sažetak.

**Započni / nastavi sažetak** obrađuje sve indeksirane odlomke u grupama do oko 28.000 znakova, a zatim objedinjuje delimične sažetke u parovima do konačnog rezultata. Svaki deo je poseban AI poziv; tokeni se beleže postojećim mehanizmom. Tok zahteva otvorenu stranicu. **Zaustavi posle ovog dela** prekida sledeće pozive, dok završeni delovi ostaju u bazi. Ponovno otvaranje knjige omogućava nastavak istog posla, sa identifikatorima zahteva koji sprečavaju ponavljanje završenog AI poziva. Sažeci su sažimanje, a ne potpuna zamena za originalnu knjigu.

Work može koristiti do pet izabranih datoteka kao ranije. Za indeksirane PDF-ove bira odlomke na osnovu zadatka, unutar postojećeg ukupnog limita Work ulaza. Ceo original se ne šalje uz svaki zadatak.

## Limiti i ponašanje

- PDF: do 30.000.000 bajtova, 1500 PDF stranica i 5 miliona izdvojenih znakova po datoteci.
- Indeksi PDF-ova: do 20 miliona znakova po nalogu. Originali i dalje dele postojeći prostor Biblioteke (100 datoteka / 100 MB).
- Do dva paralelna procesa izdvajanja priloga; izdvajanje PDF-a traje najviše 300 sekundi. Memorija radnog procesa ostaje ograničena.
- Drugi formati zadržavaju 3 MB i postojeći limit izdvojenog teksta 40.000 znakova.
- Za pitanje se bira do osam odlomaka, ukupno do 22.000 znakova. Ne šalje se ceo indeks. Model dobija i postojeći ograničeni kontekst razgovora.
- Skenirani PDF se može sačuvati, ali prazne/slikovne stranice nemaju tekst za pretragu. Za njih je potreban OCR, koji nije uključen. Delimično čitljiv dokument prikazuje broj čitljivih stranica; sažetak obuhvata samo njihov tekst.
- PDF modul i vlasništvo proveravaju se za pristup knjizi, pretragu i sažimanje. Brisanje originala briše njegov indeks i poslove sažimanja. Vraćanje arhiviranog projekta omogućava ponovno korišćenje.

## Traka napretka lokalnog uvoza

Posle **Uvezi izabrane datoteke** prikazuju se traka i procenat od 0% do 100%, uz fazu čitanja, slanja i obrade. Čitanje koristi FileReader događaje, slanje koristi XMLHttpRequest upload događaje. Deo opsega rezervisan je za odgovor servera; procenat nije procena preostalog vremena. Dok server obrađuje poslednju datoteku, prikaz ne prelazi na 100%.

Kod više datoteka svaka ima jednak deo ukupne trake, a za kraj se računa i završena provera preskočenih/neuspelih stavki. **100% označava završetak pokušaja obrade svih izabranih stavki**; broj uspešno uvezenih, preskočenih i grešaka prikazan je zasebno. Veza sa nalogom se proverava pri ažuriranju prikaza.

## Objavljivanje i provere

Uključite `books.js`, `books-ui.js`, `migrations/014_pdf_books.sql` i izmenjene postojeće module. Migracija se automatski primenjuje pri startu. Ne uvode se nove spoljne usluge niti zavisnosti. Stari PDF-ovi se indeksiraju tek kada korisnik izabere pripremu za čitanje; migracija ne obrađuje njihove originale.

Provere: `npm run check`, `npm run test:books`, `npm run test:second-package-ui`, `npm run test:workspace`, `npm run test:pdf-limit` i postojeći testovi priloga. Probna knjiga ima 305 programatski napravljenih stranica. Testovi koriste PGlite i simulirane odgovore modela; potvrđuju tok, pokrivenost izvornim delovima, privatnost i nastavak, a ne kvalitet sažetka stvarne knjige ili ponašanje objavljene aplikacije.

Za aktuelni uvoz na hostingu, sačuvane poslove, migraciju 015 i desni diskovni eksplorer pogledajte EXPLORER-IMPORT.md.
