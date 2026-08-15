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
