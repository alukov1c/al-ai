# PDF uvoz na hostingu i AL AI eksplorer

## Prijavljena greška pri uvozu

Poruka „Uvoz traje predugo“ u prethodnom toku poticala je od roka XMLHttpRequest-a od 180 sekundi. To samo po sebi ne dokazuje da server nije sačuvao PDF. Ceo tok je čekao slanje, izdvajanje i indeksiranje u istom zahtevu, a odlomci su se upisivali pojedinačno. Konkretna korisnikova knjiga nije dostupna u radnom folderu, pa se njen sadržaj i uzrok sporog parsiranja ne mogu potvrditi iz ovih testova.

Novi tok razdvaja:

1. Slanje i atomsko čuvanje originala i posla obrade u bazi.
2. Obradu PDF-a u redu na serveru, sa sačuvanim statusom.
3. Praćenje statusa kratkim zahtevima iz pregledača.

Rok za samo slanje je 10 minuta. PDF izdvajanje ima ograničenje od 5 minuta; limit veličine je i dalje 30 MB, do 1500 stranica / 5 miliona znakova. Indeks se upisuje u grupama od najviše 100 odlomaka, umesto jednog zasebnog zahteva po odlomku. Obrada nije AI poziv i ne troši modelske tokene.

Ponovno slanje istog sadržaja, naziva i projekta na istom nalogu ponovo koristi posao i sačuvani original. Ne stvara dodatnu kopiju. Posle greške original ostaje u Biblioteci, gde su dostupni **Prati obradu PDF-a** ili **Ponovi obradu PDF-a**. Za ranije sačuvan PDF koristi se **Pripremi PDF za čitanje**, bez ponovnog slanja sa računara. Ako su kopije nastale starim tokom pre ove izmene, ne brišu se automatski.

Kod potpuno neuspešnog ili nepotvrđenog uvoza traka ne prikazuje 100%. Status obrade i broj uspešnih/preskočenih/neuspelih stavki su odvojeni. Za PDF koji se još obrađuje prikazuje se faza sa servera; ne izmišlja se procenat parsiranja pojedinačnih stranica.

Red je sačuvan u bazi. Posle prekida servera zastarela obrada može ponovo biti preuzeta nakon isteka zaštitnog roka od 10 minuta. Obrada zahteva da web servis radi; ovo nije poseban stalni hosting worker. Uspavljivanje, restart, raspoloživa memorija i CPU hostinga i dalje utiču na trajanje. Zatvaranje pregledača ne briše sačuvan posao, a ponovno otvaranje Biblioteke omogućava proveru.

### Šta uraditi sa prijavljenom knjigom

Posle objavljivanja izmena prvo proverite Biblioteku. Ako `Fizička mehanika_BNikolić-2.pdf` postoji, izaberite pripremu/praćenje/ponavljanje obrade prema njenom statusu. Ako original ne postoji, uvezite ga jednom novim tokom. Ne šaljite ga više puta dok prethodna obrada traje.

## Desni eksplorer

Ikonica **Otvori AL AI eksplorer** u gornjoj desnoj grupi otvara desni panel. Izaberite projekat, povežite folder ili koristite ranije sačuvanu vezu. Eksplorer prikazuje stvarne stavke povezanog foldera i omogućava:

- Navigaciju kroz podfoldere i povratak preko putanje.
- Kreiranje novog podfoldera.
- Preimenovanje datoteke, uz odbijanje postojećeg odredišta.
- Trajno brisanje datoteke ili celog izabranog podfoldera, tek nakon potvrde sa prikazanom putanjom.
- Preuzimanje lokalne datoteke klikom na naziv.
- Ručno osvežavanje, proveru po povratku u prozor i proveru na pet sekundi dok je panel otvoren.

Veza se čuva u pregledaču po nalogu/projektu. Potrebne su dozvole pregledača za čitanje i pisanje. Eksplorer nema pristup celom disku niti menja serverovu Biblioteku: uvezene kopije su nezavisne. Pri odjavi se prikaz i aktivne reference uklanjaju. Na desktopu panel rezerviše prostor razgovora; na manjim ekranima se otvara preko njega. Jedan prikaz foldera je ograničen na 2000 stavki, uz poruku kada je granica dostignuta.

Za preimenovanje datoteka u spoljnim folderima koristi se kopiranje u novo ime, poređenje bajtova i uklanjanje originala tek nakon provere da nije promenjen. To nije atomsko OS preimenovanje. Ako provera ne uspe, original se ne briše, a nova kopija može ostati da je korisnik pregleda. Promene van aplikacije u istom trenutku mogu prekinuti operaciju. Folderi se za sada kreiraju i brišu, ali se ne preimenuju. Ograničenja browser `move()` metode i diskovne operacije opisuje [Chrome dokumentacija za File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).

Tri dugmeta alatne trake i zatvaranje koriste zajedničko pravilo iz `accounts.css` koje koriste postojeća dugmad aplikacije: isti font, razmaci, boje i zaobljenje.

## Objavljivanje i provere

Uključiti nove `pdf-imports.js`, `pdf-import-client.js`, `explorer.js`, migraciju **015_pdf_import_jobs.sql** i izmenjene postojeće datoteke. Migracija se primenjuje automatski pri pokretanju. Postojeće migracije 009–014 ostaju potrebne. Nove zavisnosti nisu uvedene.

Provere: `npm run check`, `npm run test:import-explorer`, `npm run test:books`, `npm run test:second-package-ui`. Proveren je sintetički PDF od oko 20 MB, ponovljeno slanje, ponavljanje i oporavak posle restarta, privatnost između naloga, kao i diskovne operacije kroz stvarne browser filesystem handles u izolovanom testnom prostoru. Sistemski izbor foldera i dozvole su zamenjeni u testu. To ne potvrđuje uspešan uvoz konkretne korisnikove knjige na hostingu niti fizičko menjanje njenog foldera.
