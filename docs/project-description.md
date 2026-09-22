# Description du projet

## Dépôt

- **GitHub (privé)** : [github.com/FAWD-IT/Vinted-achat](https://github.com/FAWD-IT/Vinted-achat)
- Clone : `git clone git@github.com:FAWD-IT/Vinted-achat.git`

Fichiers **locaux** (non versionnés) : `.env`, `data/auth-state.json`.

## Vision

Automatiser la **phase critique** d’un achat Vinted lors d’un **compte à rebours Dressing** : synchroniser l’horloge, détecter la fin du minuteur et déclencher le clic **Acheter** le plus tôt possible, tout en conservant des garde-fous (plafond de prix, activation explicite).

## Périmètre v1

- Une annonce cible (URL unique).
- Session utilisateur réelle via Playwright (`data/auth-state.json`).
- Lecture de `closet_countdown_end_date` embarquée dans la page item.
- Pas de contournement CAPTCHA / proxy / autobuy complet jusqu’au paiement.

## Hors périmère

- Surveillance multi-annonces ou catalogues entiers.
- Autobuy sans confirmation humaine sur le paiement.
- Contournement des protections anti-bot.

## Roadmap possible

- [ ] Notifications (Discord / Telegram) à T-5 min.
- [ ] Synchronisation NTP et mesure de dérive horloge.
- [ ] Étape checkout automatisée jusqu’au bouton « Payer » (sans 3DS).
- [ ] Mode « dry run » avec journal structuré JSON.
