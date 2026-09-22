# Règles métier

## Domaine Vinted (.fr, .be, …)

La session Playwright est **liée au domaine** : pour une annonce sur [vinted.be](https://www.vinted.be), lancez `npm run login` avec `vinted.base_url: https://www.vinted.be` (cookies `.fr` ≠ `.be`).

## Compte à rebours Dressing (Vinted)

Source officielle : [Aide Vinted — Compte à rebours du Dressing](https://www.vinted.fr/help/1081).

- Pendant le compte à rebours, le bouton **Acheter** est **désactivé**.
- À la fin, l’article redevient achetable ; la concurrence est simultanée.
- Ce mécanisme est distinct de la **réservation** vendeur (5 jours max, initiée par le vendeur).

## Signaux techniques utilisés

Sur la page item, le plugin sidebar `buy` expose notamment :

- `closet_countdown_end_date` : `null` si achetable immédiatement, sinon date ISO de fin.
- Le bot considère la fenêtre ouverte si `Date.now() >= closet_countdown_end_date` **ou** si la date est déjà `null`.

## Garde-fous

| Règle | Comportement |
|--------|----------------|
| `enable_purchase` | Doit être `true` pour cliquer sur Acheter |
| `max_price_eur` | Si défini, blocage si prix affiché > plafond |
| Mode burst | Rafraîchissements rapides limités à `burst_duration_ms` après la fin prévue |
| Paiement | Jamais automatisé au-delà de l’ouverture checkout ; 3DS manuel |

## Calculs de timing

- **Fin prévue** : `closet_countdown_end_date` (UTC, parsée par `Date.parse`).
- **Tir** : `fin - fire_early_ms` (compensation latence réseau / clic).
- **Préchargement** : rechargement page à `preload_ms` avant la fin.

## Plusieurs annonces (drop multi)

- **`snipe.item_urls`** : liste d’URLs (prioritaire sur `item_url` / `ITEM_URL`).
- **`ITEM_URLS`** (`.env`) : URLs séparées par des virgules.
- Le bot lit le compte à rebours sur **la première URL** (même horaire dressing habituel).
- À l’heure H : **un onglet par annonce**, burst en parallèle (Acheter → relais → Payer → Revolut).
- **`multi_stop_on_first_success: false`** (drop Inoxtag) : tente l’achat sur **chaque** annonce (jusqu’à 4 validations Revolut). `true` : arrêt dès le premier succès.

## Attente discrète (`smart_wait`)

Objectif : **ne pas marteler Vinted** des heures avant le drop (Cloudflare, risque compte).

| Paramètre | Rôle |
|-----------|------|
| `smart_wait: true` | Active veille + polling adaptatif (défaut) |
| `poll_start_before_ms` | Aucune requête HTTP avant cette fenêtre (ex. 900000 = 15 min) |
| `poll_jitter_ratio` | Variation aléatoire ±12 % sur les pauses |
| `multi_tab_open_gap_ms` | Délai entre ouverture des onglets multi-annonces |

Comportement :

1. **Une** lecture de la page pour lire `closet_countdown_end_date`.
2. **Veille** : sommeil local jusqu’à `poll_start_before_ms` avant la fin (0 requête).
3. **Resync** : intervalles qui se resserrent (30 min → 5 min → 15 s) avec jitter.
4. **Préload** : dernière seconde avant H, puis burst agressif au drop.
5. **Multi-URLs** : les onglets supplémentaires s’ouvrent **juste avant H**, pas au lancement du bot.

Désactiver : `smart_wait: false` (ancien polling plus fréquent — déconseillé longue attente).

## Parcours d'achat (session connectée, observé sur vinted.be)

1. **Fiche article** — compte à rebours : pas de bouton **Acheter** (timer + **Abonné** / Suivre). Annonce normale : bouton **Acheter** actif.
2. **Clic Acheter** — redirection vers `/checkout?purchase_id=…&order_id=…&order_type=transaction`.
3. **API** (réseau) — `POST /api/v2/purchases/checkout/build`, puis `PUT /api/v2/purchases/{purchase_id}/checkout`.
4. **Page Paiement** — adresse enregistrée, **Choisir un point relais** si aucun relais par défaut, moyen **Carte bancaire**, bouton **Payer** (3-D Secure ensuite).
5. **Téléphone** — si Vinted affiche « Ajouter numéro de téléphone », le bot peut le remplir depuis `VINTED_PHONE` dans `.env` (fichier local, jamais commité).
6. **Paiement** — clic **Payer** puis **validation Revolut / 3-D Secure sur le téléphone** (seule étape humaine).


L’utilisateur doit respecter les CGU Vinted et les lois applicables. L’outil est fourni pour un usage personnel et transparent.
