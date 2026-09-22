# Guide de style (CLI)

## Logs

- Format : `[ISO8601] [LEVEL] message`
- Niveaux : `INFO`, `WARN`, `ERROR`
- Messages en français, concis, orientés action utilisateur.

## Configuration

- Valeurs par défaut sûres : achat désactivé.
- Secrets uniquement dans `.env`, jamais dans `config.yaml`.

## UX terminal

- Commandes npm explicites : `login`, `inspect`, `snipe`.
- En cas d’échec : message d’erreur + indication de la commande corrective (`npm run login`).
