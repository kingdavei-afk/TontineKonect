# Tontine Konect 🇨🇮

MVP de gestion de tontine pour Abidjan : créez une tontine, invitez les membres par
code, suivez les cotisations de chaque tour et relancez les retardataires sur WhatsApp.

## Fonctionnalités

- **Compte par téléphone + code secret** (4 à 6 chiffres, haché avec scrypt) — pas d'email.
- **Créer une tontine** : nom, cotisation en FCFA, fréquence (hebdo / 15 jours / mensuel), date de début.
- **Inviter** par code à 6 caractères ou par lien WhatsApp ; rejoindre avec le code.
- **Suivi des cotisations tour par tour** : le trésorier déclare chaque paiement
  (Wave, Orange Money, MTN MoMo, Moov, espèces) ; chacun voit qui a payé et qui doit.
- **Calendrier des tours** : un bénéficiaire par tour, dans l'ordre d'arrivée, avec
  échéance et pot total (cotisation × nombre de membres).
- **Versement du pot** validé par le trésorier, puis **confirmé par le bénéficiaire** :
  le tour suivant ne s'ouvre qu'après cette confirmation (le trésorier peut confirmer
  en son nom si le bénéficiaire n'a pas encore de compte). L'historique garde tous les tours.
- **Rappels WhatsApp** en un clic pour les retardataires.
- **Rappels automatiques (push PWA)** : notification à J-2, le jour de l'échéance et en
  cas de retard, envoyée une seule fois par étape à chaque membre non payé + une
  synthèse au trésorier.
- **Sortie d'argent** :
  - **Cotisation ajustable** en cours de route : elle s'applique **à partir du tour
    suivant**, le tour en cours garde son montant (historique des changements).
  - **Membres qui partent** : le trésorier marque le départ, les tours à venir sont
    réattribués aux membres actifs et les tours de trop supprimés.
  - **Remboursements** : capital versé calculé automatiquement, montant ajustable
    (pénalité/acompte) et règlement tracé (mode, date, note).
  - **Clôture** : action définitive en deux clics, la tontine reste consultable en
    lecture seule (badge « Clôturée »), les rappels automatiques s'arrêtent.
- **Journal d'audit (« qui a validé quoi »)** : chaque cotisation validée ou annulée,
  versement du pot, confirmation de réception, remboursement réglé ou annulé, départ,
  changement de cotisation, ajout de membre et clôture est tracé avec **l'auteur, la date,
  l'heure, le montant et le mode de paiement** (table `audit_logs`, 50 dernières opérations
  affichées sur la fiche tontine).
- **Recherche et filtres sur le tableau de bord** : recherche par nom et pastilles
  *Toutes / En cours / En retard / Clôturées* avec compteurs, résultat vide explicite.
- **Historique des cotisations filtrable** : sur la fiche tontine, chaque membre voit
  d'abord **ses** propres paiements (tour, bénéficiaire, montant, mode, date, qui a validé)
  et peut filtrer **par membre** (« Moi » par défaut, « Tous les membres ») et **par tour**,
  avec compteurs et bouton de réinitialisation, plus un rappel quand sa cotisation est
  encore attendue — et le récapitulatif toutes tontines sur son compte (`/compte`).
- **Export CSV par tontine** : boutons « Cotisations », « Journal d'audit », « Membres » et
  « Remboursements » pour télécharger les données au format Excel français (séparateur `;`,
  BOM UTF-8, dates en JJ/MM/AAAA) — route
  `GET /tontines/[id]/export?type=cotisations|audit|membres|remboursements`, réservée aux
  membres de la tontine.
- **PWA** : installable sur le téléphone, icône et cache des assets hors ligne.

## Stack

- Next.js 16 (App Router, Server Actions) + React 19 + TypeScript
- Tailwind CSS 4
- PostgreSQL (Neon) via `pg` — variable `DATABASE_URL`, schéma créé automatiquement
  au démarrage (`instrumentation.ts` → `ensureSchema()`)
- Sessions par cookie httpOnly, aucun service externe requis

## Lancer en local

```bash
npm install
# .env.local : DATABASE_URL (+ VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET optionnels)
npm run dev        # http://localhost:3000
```

Autres commandes : `npm run build` (build de production), `npm run lint`, `npm run start`.

## Base de données

- Le schéma est créé à chaque démarrage (`CREATE TABLE IF NOT EXISTS`, idempotent).
- Transfert one-shot depuis l'ancien SQLite local (après `npm i -D better-sqlite3`) :

```bash
node --experimental-strip-types scripts/transfer-sqlite-to-pg.ts
```

## Rappels automatiques

- Bouton 🔔 dans l&apos;en-tête : le membre autorise les notifications, son abonnement
  push est enregistré (`push_subscriptions`).
- Un planificateur démarre avec le serveur (`instrumentation.ts`) et passe en revue les
  tontines actives **toutes les 10 minutes** (`lib/reminders.ts`) — désactivé sur Vercel
  (instances éphémères), où le cron `vercel.json` déclenche `GET /api/reminders` chaque
  matin.
- Étapes : `avant` (J-2 / J-1), `jour` (échéance) , `retard` (après échéance) — chaque
  étape n&apos;envoie **qu&apos;une seule fois** par tour et par destinataire (table `reminders`,
  contrainte UNIQUE).
- Déclenchement manuel / cron externe :

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/reminders"
# ou ?secret=$CRON_SECRET — CRON_SECRET vaut "local-dev" par défaut hors production
```

- Les messages **WhatsApp** restent des liens pré-remplis (un clic) : l'envoi automatique
  passerait par l'API WhatsApp Business, non incluse dans ce MVP.
- Clés VAPID : variables `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` en production,
  sinon générées au premier lancement et stockées dans `data/vapid.json` (local).

## Règles de sortie d'argent

| Situation | Règle appliquée |
| --- | --- |
| Membre parti **avant** son tour | Remboursement du capital versé (100 %), réglé par le trésorier |
| Membre parti **après** avoir reçu le pot | Départ refusé (la caisse serait en déficit) |
| Départ pendant son propre tour de bénéficiaire | Départ refusé jusqu'à la fin du tour |
| Départ du trésorier | Refusé (transmettre d'abord le rôle) |
| Augmentation de cotisation | Appliquée au tour suivant, tour en cours inchangé |
| Pot versé | Tour suivant bloqué jusqu'à la **confirmation de réception par le bénéficiaire** |
| Clôture | Tours restants annulés, remboursements restent réglables |

## Structure

```
app/
  actions.ts        # toutes les actions serveur (auth, tontines, cotisations)
  page.tsx          # page d'accueil
  register|login    # création de compte et connexion
  tontines/page.tsx # liste de mes tontines + créer / rejoindre
  tontines/[id]/    # détail : tours, cotisations, membres, rappels, historique
  tontines/[id]/export/ # route CSV : cotisations, audit, membres, remboursements
  compte/page.tsx   # profil, statistiques, historique personnel des cotisations
components/         # formulaires (client), tableau de bord filtrant, historique filtrant, en-tête, push, PWA
lib/
  db.ts             # pool Postgres, schéma, helpers async (all/get/run/tx)
  auth.ts           # téléphone + PIN, sessions, normalisation des numéros CI
  tontine.ts        # cycles, cotisations, pot, formats FCFA, départs/clôture
  csv.ts            # génération CSV Excel FR (« ; », BOM UTF-8) et dates JJ/MM/AAAA
  reminders.ts      # VAPID, abonnements push, moteur de rappels, planificateur
  constants.ts      # constantes partagées client/serveur (modes de paiement)
instrumentation.ts   # crée le schéma + démarre le planificateur au lancement
app/api/reminders/   # route cron (Authorization: Bearer CRON_SECRET)
scripts/             # transfert one-shot SQLite → Postgres
vercel.json          # cron quotidien Vercel sur /api/reminders
public/             # manifest PWA, service worker (assets + notifications), icône
```

## Limites connues (volontaires pour un MVP)

- Les paiements sont **déclarés** par le trésorier : aucune intégration Wave / Orange Money.
- Le tour suivant s'ouvre seulement quand le bénéficiaire a confirmé la réception du pot
  (ou que le trésorier confirme en son nom, membre sans compte).
- Pas d'envoi automatique de SMS/WhatsApp : les liens de rappel restent un clic de l'utilisateur.
