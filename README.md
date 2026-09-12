# AL AI — DeepSeek veb asistent

Veb čat aplikacija napravljena u HTML-u, CSS-u i JavaScript-u. Lokalni Node.js server bez dodatnih paketa bezbedno prosleđuje zahteve DeepSeek API-ju, tako da API ključ nije izložen u browseru.

## Struktura

```text
AL-AI/
├── index.html
├── stil.css
├── stil-a.css
├── app.js
├── server.js
├── package.json
├── api.txt
└── stil.css
```

## Pokretanje

Potreban je Node.js 18 ili noviji. Server prvo koristi promenljivu `DEEPSEEK_API_KEY`, a zatim lokalni fajl `api.txt`.

```powershell
npm start
```

Otvoriti `http://localhost:3000`.

## Provera JavaScript sintakse

```powershell
npm run check
```

`api.txt` je isključen iz verzionisanja i ne treba ga premeštati u javno dostupan frontend folder.

## DeepSeek API — provera 12.09.2026.

Koristi se DeepSeek V4.1 Flash, objavljen 10.09.2026, preko modela `deepseek-flash`.
Chat isključuje thinking, a Thinking ga uključuje uz `reasoning_effort: high`.
Temperatura 0.7 šalje se samo za Chat. Oznaka `deepseek-flash-thinking` je lokalni izbor režima, a ne naziv API modela.
Stari razgovori sa oznakama `deepseek-chat` i `deepseek-reasoner` automatski se učitavaju u odgovarajućem novom režimu; poruke ostaju sačuvane.
Adresa `https://api.deepseek.com/chat/completions` ostaje podržana. Prelazak na Responses API ili instaliranje SDK-a nisu potrebni za postojeći tekstualni čat.
Podrška modela za slike ne znači da ova aplikacija već omogućava njihovo slanje.

Izvori:
- https://api-docs.deepseek.com/updates/
- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/guides/thinking_mode/
