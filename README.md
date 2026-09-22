# Vinted Achat — bot compte à rebours

Outil local pour surveiller une annonce Vinted en **compte à rebours Dressing** (influenceur) et tenter d’appuyer sur **Acheter** dès la fin du minuteur.

## Prérequis

- Node.js 20+
- Compte Vinted valide (moyen de paiement configuré)

## Installation

```bash
cp config.example.yaml config.yaml
cp .env.example .env
npm install
npx playwright install chromium
```

## Configuration

1. **`config.yaml`** — URL de l’annonce, timings, plafond de prix.
2. **`.env`** — secrets et overrides (`ENABLE_PURCHASE`, `ITEM_URL`, etc.).

Exemple :

```yaml
snipe:
  item_url: "https://www.vinted.fr/items/1234567890-..."
safety:
  enable_purchase: false
  max_price_eur: 50
```

## Utilisation

### 1. Enregistrer la session

```bash
npm run login
```

Connectez-vous dans la fenêtre Chromium, puis **Entrée** dans le terminal. La session est stockée dans `data/auth-state.json` (ne jamais committer).

### 2. Vérifier le compte à rebours

```bash
npm run inspect
```

Affiche le titre, le prix extrait et `closet_countdown_end_date` lu dans la page.

### 3. Lancer le snipe

```bash
npm run snipe
```

Par défaut **observation seule** : le bot attend la fin du compte à rebours mais ne clique pas tant que `safety.enable_purchase` / `ENABLE_PURCHASE=true` n’est pas activé.

Après le clic sur Acheter, **le paiement 3-D Secure reste manuel** dans le navigateur.

## Avertissements

- L’automatisation peut **contredire les CGU Vinted** — vous restez responsable de votre compte.
- Vinted utilise Cloudflare : évitez de multiplier les requêtes inutiles.
- Aucune garantie d’être le premier acheteur ; la concurrence est forte sur les drops influenceurs.

## Scripts

| Commande        | Rôle                                      |
|----------------|-------------------------------------------|
| `npm run login`   | Sauvegarde cookies / session Playwright   |
| `npm run inspect` | Diagnostic sur une annonce                |
| `npm run snipe`   | Attente + tentative d’achat               |

## Documentation

Voir le dossier [`docs/`](docs/), notamment :

- [`docs/deployment-other-pc.md`](docs/deployment-other-pc.md) — installer le bot sur un autre ordinateur
- [`docs/business-rules.md`](docs/business-rules.md) — compte à rebours, `smart_wait`, multi-annonces
