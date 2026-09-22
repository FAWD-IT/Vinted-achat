# Architecture

## Stack

| Couche | Choix |
|--------|--------|
| Runtime | Node.js 20+, TypeScript |
| Automatisation | Playwright (Chromium) |
| Config | `config.yaml` + `.env` (dotenv) |
| Validation | Zod |

## Flux principal (`npm run snipe`)

```mermaid
sequenceDiagram
  participant CLI as snipe CLI
  participant PW as Playwright
  participant V as vinted.fr

  CLI->>PW: Charger storageState
  loop Jusqu'à preload
    PW->>V: GET item URL
    V-->>PW: HTML
    PW-->>CLI: Parse closet_countdown_end_date
  end
  CLI->>CLI: sleep jusqu'à fin - fire_early_ms
  loop burst_duration
    PW->>V: reload item
    CLI->>CLI: isPurchaseWindowOpen?
    alt ouvert et enable_purchase
      PW->>V: Clic Acheter
    end
  end
```

## Modules

- `src/config.ts` — fusion YAML / env.
- `src/vinted/itemPageState.ts` — extraction HTML du plugin `buy`.
- `src/vinted/purchase.ts` — clic Acheter + contrôles prix.
- `src/snipe/runSnipe.ts` — boucle temporisation et burst.

## Données sensibles

- `data/auth-state.json` : cookies de session — **gitignore**, chmod 600 recommandé.
- Ne jamais committer `.env`.

## Limites connues

- API `/api/v2/items/:id` souvent bloquée (403) sans session navigateur → parsing HTML uniquement.
- Structure HTML Vinted susceptible de changer → parser défensif + regex de secours.
- Pas d’API d’achat publique ; checkout et SCA restent côté navigateur.
