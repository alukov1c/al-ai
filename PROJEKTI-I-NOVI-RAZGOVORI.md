# Projekat razgovora

Izbor **Projekat razgovora** dostupan je i pre prve poruke. Podrazumevani izbor je **Bez projekta**, sa tekstom **Projekat nije izabran**. Izbor postojećeg projekta prikazuje njegov naziv i koristi ga pri slanju prve poruke. Prazan nacrt ne stvara sačuvan razgovor.

Kod postojećeg razgovora promena izbora menja projekat tog razgovora. Prikaz naziva prati projekat razgovora, nezavisno od ranijeg filtera u bočnom panelu. Arhivirani razgovori i projekti ostaju zaključani za promene.

Na kraju liste je podebljana opcija **Kreiraj novi projekat**. Ona otvara postojeći prozor za naziv i uputstva. Posle čuvanja novi projekat postaje izbor nacrta; ako je otvoren postojeći razgovor, pridružuje se novom projektu. Otkazivanje vraća prethodni izbor.

## Novi razgovor u projektu

Komanda **Novi razgovor**, sa ikonicom, dostupna je u meniju ⋯ projekta, u meniju zakačenog projekta i u meniju zakačenog razgovora. U poslednjem slučaju koristi projekat tog razgovora; ako ga nema, otvara nacrt bez projekta.

U prozoru **Uredi projekat i uputstva** dugme **Novi razgovor** nalazi se ispod **Lokalni folder**. Ono zatvara prozor i otvara prazan nacrt u sačuvanom projektu. Prva poslata poruka čuva novi razgovor u tom projektu.

## Primena i provere

Za ove komande objaviti `app.js`, `index.html`, `local-folder.js` i `stil.css`, pa ponovo učitati aplikaciju. Nove migracije i zavisnosti nisu potrebne. Za direktno slanje PDF-a objaviti i odgovarajuće serverske izmene navedene u `PDF-PREGLED-I-OPORAVAK.md`.

Provere: `npm run test:project-conversation-ui`, `npm run test:workspace` i `npm run check`. Provereni su nacrti bez projekta i sa projektom, prva poruka, komande na svim navedenim mestima, kreiranje i otkazivanje projekta, kao i promena projekta postojećeg razgovora. Biblioteka prihvata samo poslednji rezultat pri brzoj promeni filtera. U sporijem lokalnom testnom okruženju Work provera koristi duži rok čekanja; vremenski limiti aplikacije nisu povećani.
