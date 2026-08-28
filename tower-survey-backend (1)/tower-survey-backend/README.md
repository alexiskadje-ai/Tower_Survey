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

---

## Pérennité des liens photo (OBLIGATOIRE)

> **Règle absolue** : les fichiers uploadés dans `uploads/` (et les URLs `/uploads/<filename>`
> qui en découlent) constituent des **preuves d'audit** archivées. Ils sont référencés
> par URL permanente dans les exports Excel et les emails envoyés. Une fois une URL
> publiée dans un document, **elle doit rester valide indéfiniment**. Toute décision
> contraire (suppression, rotation, URL signée expirante) casserait rétroactivement
> des archives métier et juridiques.

### 1. Volume persistant Railway — OBLIGATOIRE (pas optionnel)

Sans volume persistant, **le contenu de `uploads/` est intégralement perdu à chaque
redéploiement Railway** (le système de fichiers du conteneur est éphémère). Tous les
hyperliens `https://<domaine>/uploads/xxx.jpg` contenus dans les Excel/CSV déjà
distribués deviendraient morts.

**Configuration attendue (déjà déclarée dans `railway.json`) :**

```jsonc
// railway.json
{
  "volumes": [
    { "name": "uploads", "mountPath": "/app/uploads" }
  ]
}
```

**Étapes manuelles sur Railway (à faire UNE FOIS, puis vérifier régulièrement) :**

1. Dashboard Railway → service backend → onglet **"Volumes"** → **"New Volume"**
2. Nom : `uploads`
3. Mount path : `/app/uploads` (chemin ABSOLU dans le conteneur)
4. Taille : commencer à 10 Go, ajuster selon le volume d'audits
5. Le service doit être **redéployé** pour que le montage soit actif

⚠️ **Si vous migrez vers Nixpacks avec un `Dockerfile` custom** : le `WORKDIR` doit
être `/app` et `UPLOAD_DIR` dans `.env` doit être `/app/uploads` (pas `./uploads`).

### 2. Aucun fichier upload ne doit être écrit ailleurs

Tous les uploads arrivent via `POST /api/responses/:id/media` et sont stockés par
multer dans `process.env.UPLOAD_DIR` (défaut `./uploads` en dev, `/app/uploads` en
prod sur Railway). **Aucun code n'écrit dans `/tmp`, `os.tmpdir()` pour les photos**.

Les fichiers d'export temporaires (CSV/Excel générés à la volée par les endpoints
admin `exportCsv` / `exportExcel` / `emailExport`) sont eux explicitement écrits
dans `os.tmpdir()` puis supprimés juste après téléchargement/envoi. C'est la seule
exception — et elle est volontaire pour ne pas mélanger des fichiers jetables
avec des preuves d'audit.

### 3. Règles si migration future vers S3 / MinIO

Quand le volume disque local deviendra insuffisant, le jour de la migration
vers un stockage objet, ces règles **doivent** être respectées pour préserver
la validité des liens déjà en circulation :

- **Bucket public en lecture seule** (`public-read` ACL ou policy équivalente).
  Le lien `https://<bucket>.s3.<region>.amazonaws.com/<key>` doit être
  accessible sans authentification ni URL signée.
- **JAMAIS d'URLs signées / temporaires** (pre-signed URLs, CloudFront avec
  expiration, SAS tokens, etc.). Une URL qui expire casse les archives.
- **Noms de fichiers en UUID v4** (le frontend utilise déjà `crypto.randomUUID()`
  via `client_uuid`, et multer utilise `${Date.now()}-${random}` — c'est
  acceptable mais UUID est préférable). Surtout : **ne jamais réencoder /
  renommer / déplacer un fichier existant** une fois uploadé, son chemin est
  gravé dans toutes les bases de données et tous les exports.
- **Pas de lifecycle policy** qui supprimerait automatiquement des objets
  (même une transition vers Glacier/Infrequent Access est OK tant que l'objet
  reste accessible à la même URL).
- **Region pinning** : si l'application est hébergée dans une région fixe,
  le bucket doit être dans la même région (coût + latence). Si multi-région,
  accepter la latence ou dupliquer via replication cross-region.

### 4. Aucune suppression automatique — INTERDIT

**Aucun job de nettoyage / purge / GC des fichiers `uploads/` ne doit jamais
être implémenté** :

- Pas de cron qui supprime les fichiers vieux de X jours
- Pas de script "cleanup orphan files" qui compare DB ↔ disque
- Pas de TTL sur les `media_attachments` (en DB, la ligne reste pour toujours)
- Pas de bouton admin "supprimer une photo" tant qu'il n'a pas été
  explicitement demandé par le Product Owner

**Exception unique et tracée** : la suppression du fichier sur disque est
effectuée **uniquement** quand une nouvelle photo remplace la même ligne
`(response_id, question_id, slot)` lors d'un nouvel upload (logique d'idempotence
du `uploadMedia` controller). C'est une substitution 1-pour-1, pas un nettoyage.

**Si une suppression de photo doit avoir lieu** (demande explicite, obligation
légale, etc.), elle doit :
1. Être déclenchée manuellement par un admin
2. Être tracée dans un log d'audit (qui, quand, pourquoi)
3. Conserver la ligne `media_attachments` en base avec `file_url` mis à `null`
   ou un marker spécial, pour que les exports existants ne pointent pas vers
   un 404

### 5. Vérifications à faire avant chaque mise en production

- [ ] Le volume Railway `uploads` est monté sur `/app/uploads` et `UPLOAD_DIR` pointe dessus
- [ ] `UPLOAD_DIR` dans `.env` de prod est un **chemin absolu**
- [ ] `PUBLIC_BASE_URL` dans `.env` de prod est l'URL HTTPS du service (pas localhost)
- [ ] Aucun script `cleanup*` ou `purge*` n'a été ajouté au code
- [ ] Aucun `setInterval` / cron n'a été câblé sur le dossier `uploads/`
- [ ] Les hyperliens d'un ancien export s'ouvrent toujours et affichent la photo
