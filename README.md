# Code de la route – entraînement

Site d'entraînement à l'examen du code de la route français (ETG) : comptes, examens blancs de 40 questions en conditions réelles, entraînement par thème avec corrections expliquées, révision des erreurs, statistiques.

## Lancer

Prérequis : [Node.js](https://nodejs.org) 22.13 ou plus récent (aucune dépendance à installer).

```
npm start
```

Puis ouvrir http://localhost:3000 . Sur un téléphone du même Wi-Fi : `http://<ip-du-pc>:3000`.

Vérifier la banque de questions et l'API : `npm test`.

## Contenu

- `data/questions/*.json` : les questions (un fichier par thème + photos). Format :
  `{ id, theme, q, a: [2 à 4 réponses], ok: [indices des bonnes réponses], exp, img?, scene?, sub? }`
  - `img` : `signs/<code>.svg` (panneaux) ou `photos/<fichier>.jpg`
  - `scene` : situation dessinée vue du conducteur (`road`, `time`, `weather`, `signs`, `ahead`, `left`, `oncoming`, `line`, `crosswalk`, `pedestrian`, `intersection`, voir `public/scene.js` et `test.js`)
  - `sub` : question double façon examen (A/B pour la 1re, C/D pour la 2de)
- `data/app.db` : comptes et progression (SQLite, créé au premier lancement). Mots de passe hachés (scrypt).
- `data/photos-credits.json` : auteurs et licences des photos (affichés dans « Crédits »).

## Mise en ligne

1. **Compléter les mentions légales** (obligatoire, LCEN art. 6 III) : objet `LEGAL` en haut de la section « Pages légales » de `public/app.js` (éditeur, adresse, contact, directeur de publication, hébergeur).
2. Le serveur écoute sur `PORT` (défaut 3000). Le placer derrière un proxy HTTPS (nginx, Caddy…) :
   - le cookie de session passe en `Secure` grâce à l'en-tête `X-Forwarded-Proto` ;
   - définir `TRUST_PROXY=1` pour que la limite de débit par IP lise `X-Forwarded-For` ;
   - ajouter HSTS et une limite globale côté proxy, par ex. nginx :
     ```
     add_header Strict-Transport-Security "max-age=31536000" always;
     limit_req_zone $binary_remote_addr zone=api:10m rate=5r/s;
     location /api/ { limit_req zone=api burst=20 nodelay; proxy_pass http://127.0.0.1:3000; }
     ```
3. Sauvegarder régulièrement `data/app.db` (comptes et progression).

Sécurité déjà en place : mots de passe scrypt, sessions aléatoires 256 bits stockées hachées, cookie HttpOnly/SameSite, POST en JSON uniquement (CSRF), blocage après 8 échecs de connexion, limite de débit par IP sur connexion et inscription, CSP stricte et anti-iframe, aucune ressource tierce.
Les photos et panneaux sont sous licences libres (CC BY-SA, etc.) : garder la page « Crédits » accessible.
