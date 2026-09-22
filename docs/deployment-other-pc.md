# Déploiement sur un autre PC

Guide pour lancer le bot Vinted-achat sur une **deuxième machine** (PC fixe dédié au drop, MacBook, etc.) sans exposer ta session sur GitHub.

## Ce qu’il faut copier

| Élément | Où | Secret ? |
|--------|-----|----------|
| Code du projet | Git clone ou clé USB | Non |
| `config.yaml` | Racine du repo | Non (URLs, timings) |
| `.env` | Racine | **Oui** — téléphone, flags achat |
| `data/auth-state.json` | Session Vinted | **Oui** — équivalent cookies connectés |

**Ne jamais** committer `.env` ni `data/auth-state.json`.

## Option A — Recommandée : nouveau login sur l’autre PC

1. Installer Node.js **20+** et Git.
2. Cloner ou copier le dossier `Vinted-achat`.
3. Dans le terminal :

```bash
cd Vinted-achat
cp config.example.yaml config.yaml   # si pas déjà fait
cp .env.example .env
npm install
npx playwright install chromium
```

4. Éditer `config.yaml` (URLs Inoxtag, `vinted.base_url: https://www.vinted.be`).
5. Éditer `.env` :

```env
VINTED_BASE_URL=https://www.vinted.be
ENABLE_PURCHASE=true
CLICK_PAY=true
MAX_PRICE_EUR=12
VINTED_PHONE=+32...
```

6. Enregistrer la session **sur cette machine** :

```bash
npm run login
```

Connecte-toi à Vinted.be dans Chromium, valide 2FA si besoin, puis Entrée dans le terminal.

7. Vérifier :

```bash
npm run inspect
```

8. Au moment du drop :

```bash
npm run snipe
```

Garde le **téléphone** à portée (Revolut / 3-D Secure).

## Option B — Copier la session depuis ton Mac actuel

Utile si tu ne peux pas te reconnecter (2FA compliquée).

1. Sur le Mac : copier **en privé** (AirDrop chiffré, clé USB, fichier zip mot de passe) :
   - `data/auth-state.json`
   - `.env`
2. Sur l’autre PC : même installation npm + Playwright que ci-dessus.
3. Coller les fichiers aux **mêmes chemins**.
4. Même domaine Vinted (`.be` vs `.fr`) que lors de l’export des cookies.

Les cookies expirent : si le bot redirige vers la connexion, refaire `npm run login` sur le PC cible.

## Bonnes pratiques machine dédiée

- **Horloge système** synchronisée (NTP) — le drop se base sur `closet_countdown_end_date`.
- **Réseau stable** (Ethernet de préférence).
- **Un seul** `npm run snipe` à la fois sur le compte.
- Ne pas lancer le snipe des **heures** avant si tu peux : avec `smart_wait`, le bot peut dormir sans requêtes (voir `business-rules.md`).
- Fermer autres onglets Vinted sur la même session pour limiter les conflits.

## Dépôt Git (équipe FAWD-IT)

Pour synchroniser le **code** entre machines :

```bash
git clone git@github.com:FAWD-IT/Vinted-achat.git   # accès org FAWD-IT requis
```

Ne pousser que le code + `config.example.yaml`. Session et `.env` restent locaux sur chaque PC.

## Dépannage rapide

| Symptôme | Action |
|----------|--------|
| « Session absente » | `npm run login` |
| Cloudflare / captcha | Moins de requêtes (`smart_wait: true`), relancer login |
| Page « Se connecter » | Session expirée — refaire login sur ce PC |
| Bot ne clique pas | `ENABLE_PURCHASE=true` dans `.env` |
