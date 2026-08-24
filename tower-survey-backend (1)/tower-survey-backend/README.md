# Tower Survey Builder — Backend

API backend pour la plateforme d'audit de pylônes TELEINFRA (Node.js / Express / PostgreSQL).

## Démarrage rapide

```bash
npm install
cp .env.example .env
# éditer .env : renseigner DATABASE_URL (Railway, ou PostgreSQL local)

npm run db:init     # crée toutes les tables (schema.sql)
npm run db:seed      # crée l'organisation par défaut, un admin, et le template "Audit Pylône Standard"

npm run dev           # démarre le serveur en mode watch (nodemon)
```

Vérifier que ça tourne :
```bash
curl http://localhost:4000/api/health
```

## Identifiants admin par défaut (après `db:seed`)

- Matricule : `ADMIN001`
- Mot de passe : `ChangeMe123!`

⚠️ À changer immédiatement — pas de endpoint de changement de mot de passe en V1, à faire directement en base ou à ajouter avant la mise en prod.

## Structure du projet

```
src/
  app.js               # config Express (middlewares, routes, error handler)
  server.js             # point d'entrée
  config/db.js          # pool de connexion PostgreSQL
  db/
    schema.sql           # DDL complet
    init.js               # exécute schema.sql
    seed/audit-pylone-template.js  # seed du template d'audit
  middleware/
    auth.js               # requireAuth (JWT) + requireRole
    errorHandler.js
  controllers/           # logique métier par domaine
  routes/                 # définition des endpoints
uploads/                 # photos uploadées (V1 — disque local)
```

## Endpoints principaux

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | non | `{ matricule, password }` → `{ token, user }` |
| GET | `/api/sites?cluster=` | oui | Liste des sites (cache offline) |
| POST | `/api/sites` | admin/supervisor | Créer un site |
| GET | `/api/templates/active` | oui | Templates + sections + questions (cache offline) |
| POST | `/api/responses/sync` | oui | **Sync batch idempotente** — voir ci-dessous |
| GET | `/api/responses` | oui | Liste des audits soumis (filtres) |
| GET | `/api/responses/:id` | oui | Détail d'un audit (réponses + médias) |
| POST | `/api/responses/:id/media` | oui | Upload photo (multipart, champ `file`) |

## Point critique : `/api/responses/sync`

Chaque audit rempli offline reçoit un `client_uuid` généré **côté PWA** avant tout envoi réseau.
Cet endpoint fait un `INSERT ... ON CONFLICT (client_uuid) DO UPDATE` : si le PWA renvoie deux fois
le même audit (retry après coupure réseau), **aucun doublon n'est créé** en base.

Exemple de payload :
```json
{
  "responses": [
    {
      "client_uuid": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "template_id": "...",
      "site_id": "...",
      "started_at": "2026-08-21T07:10:00Z",
      "submitted_at": "2026-08-21T07:45:00Z",
      "gps_latitude": 9.302,
      "gps_longitude": 13.397,
      "device_id": "android-abc123",
      "answers": [
        { "question_id": "...", "value_text": "OK" },
        { "question_id": "...", "value_number": 42 }
      ]
    }
  ]
}
```

## Prochaines étapes (non couvertes par ce backend V1)

- PWA React (formulaire dynamique + IndexedDB + service worker de sync)
- Migration du stockage photo vers S3/MinIO (actuellement disque local)
- Interface admin de gestion des templates (actuellement via script de seed uniquement)
- Endpoint de changement de mot de passe / gestion complète des utilisateurs
