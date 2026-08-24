# Tower Survey Builder — Frontend (PWA)

Application terrain (React + Vite) pour la collecte offline-first des audits de pylônes.
Se connecte au [backend](../tower-survey-backend) via les endpoints `/api/*`.

## Démarrage rapide

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:5173, proxy /api -> http://localhost:4000
```

```bash
npm run build           # génère dist/ (app + service worker + manifest PWA)
npm run preview          # sert le build de prod localement pour tester
```

Pour tester le mode offline réel : `npm run build && npm run preview`, ouvrir dans Chrome,
DevTools → Application → Service Workers → cocher "Offline", puis naviguer dans l'app.

## Ce qui est livré

- **Authentification** JWT (`/login`) avec session persistée (`localStorage`)
- **Cache offline des sites et du template actif** — au premier login en ligne, ils sont
  copiés dans IndexedDB (via Dexie) et deviennent utilisables sans réseau ensuite
- **Formulaire d'audit dynamique** — généré à partir du template renvoyé par
  `/api/templates/active` (aucun formulaire n'est codé en dur ; ajouter une question
  en base suffit à la faire apparaître)
- **Navigation "rail treillis"** — élément signature : la progression dans les sections
  de l'audit est représentée comme une ascension de pylône, cohérent avec le métier
  et le pictogramme du logo TeleInfra
- **Capture photo géolocalisée** inline, mise en queue locale jusqu'à upload
- **Sync engine** (`SyncContext`) : queue Dexie → `POST /api/responses/sync` (idempotent
  par `client_uuid`), déclenchée automatiquement au retour réseau + toutes les 60s +
  manuellement depuis l'écran Sync
- **Écran Sync** : visibilité complète sur les audits en brouillon / en attente / synchronisés,
  avec les erreurs serveur affichées le cas échéant
- **PWA installable** (manifest + service worker via `vite-plugin-pwa`), icônes générées
  depuis le logo TeleInfra fourni

## Structure

```
src/
  api/client.js           # wrapper fetch centralisé (JWT auto-attaché)
  db/db.js                  # schéma Dexie (IndexedDB)
  context/
    AuthContext.jsx           # session utilisateur
    SyncContext.jsx            # queue offline -> sync serveur
  hooks/useOnlineStatus.js
  components/
    TowerRail.jsx + .css        # navigation section (élément signature)
    QuestionField.jsx + .css     # rendu dynamique par question_type
    StatusBar.jsx / TopBar.jsx / BottomNav.jsx
    ProtectedRoute.jsx
  pages/
    LoginPage.jsx
    SitesPage.jsx               # liste + recherche + cache offline
    SurveyPage.jsx                # cœur de l'app : formulaire dynamique
    SyncStatusPage.jsx             # queue de sync visible
  styles/tokens.css, global.css   # design tokens (couleurs de marque, typo, espacements)
public/
  logo-mark.png, logo-full.png    # logo fourni
  icons/icon-192.png, icon-512.png # icônes PWA générées depuis le logo
```

## Design system

Couleurs extraites directement du logo TeleInfra (`#1A888E` teal, `#4A4B4A` charbon),
complétées par des couleurs de statut terrain (OK / NOK / en attente / hors ligne).
Typo : **Space Grotesk** (titres, technique/géométrique) + **IBM Plex Sans** (texte) +
**IBM Plex Mono** (codes site, GPS, matricules — lecture précise des données terrain).
Cibles tactiles ≥ 48px partout (usage terrain, parfois avec gants).
Tous les tokens sont dans `src/styles/tokens.css` — à ajuster librement.

## Ce qui reste à brancher / affiner (pour toi en tant que Senior Frontend)

- **Types de questions non encore rendus** : `gps` (auto-remplissage bouton) et
  `signature` (canvas de signature) ont un fallback texte simple dans `QuestionField.jsx`
  — à enrichir si le template les utilise
- **Résilience upload photo** : actuellement les blobs restent en `queuedMedia` (IndexedDB)
  jusqu'à upload réussi ; à surveiller si beaucoup de photos haute résolution (limite 5MB/clé
  IndexedDB en pratique confortable, mais à tester en conditions réelles)
- **Détail d'un audit synchronisé** (lecture seule) : pas encore d'écran dédié, l'API
  `/api/responses/:id` est prête côté backend
- **Fine-tuning visuel libre** : tokens centralisés, aucune valeur de couleur/espacement
  codée en dur dans les composants — modifiables sans toucher à la logique
