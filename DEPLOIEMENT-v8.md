# ELEV8 DEAL AGENT v8 — Guide de déploiement

## Structure minimale si tu déploies ce dossier directement sur Vercel

```
app/
  layout.js
  page.js
  api/
    validate-code/
      route.js
    submit-deal/
      route.js
    analyze/
      route.js
    search/
      route.js
package.json
deal-agent-v8.jsx
api-validate-code.js
api-submit-deal.js
api-analyze.js
api-search.js
```

`app/page.js` is required. Without it, Vercel deploys successfully but returns `404 NOT_FOUND` at `/`.

## Variables d'environnement à ajouter dans Vercel

``` 
ANTHROPIC_API_KEY=sk-ant-...          (déjà configuré)
ZAPIER_DEAL_WEBHOOK_URL=https://...   (nouveau — voir ci-dessous)
ELEV8_ACCESS_CODES=ELEV8,BATISSEUR    (optionnel — remplace les codes par défaut)
```

## Réglages Vercel obligatoires

- Framework Preset: `Next.js`
- Root Directory: laisse le dossier de cette app uniquement
- Build Command: vide ou `next build`
- Output Directory: vide

Ne mets pas `public` comme Output Directory. Ce projet n'est pas un site statique exporté; Next.js génère et sert `.next` automatiquement sur Vercel.

## Configurer la soumission de deals (Zapier)

1. Va sur zapier.com → Create Zap
2. Trigger: Webhooks by Zapier → Catch Hook
3. Copie l'URL du webhook
4. Colle-la dans Vercel → Settings → Environment Variables
   Nom: ZAPIER_DEAL_WEBHOOK_URL
   Valeur: https://hooks.zapier.com/hooks/catch/...
5. Actions dans Zapier:
   - Envoie un email à ton adresse avec les détails
   - OU crée un contact dans GoHighLevel/Close CRM
   - OU envoie un SMS via Twilio

## Gérer les codes d'accès étudiants

Option 1: configure `ELEV8_ACCESS_CODES` dans Vercel avec une liste séparée par des virgules.

Option 2: édite le fichier `src/app/api/validate-code/route.js`:

```javascript
const DEFAULT_CODES = [
  "ELEV8",           // Code général
  "BATISSEUR",       // Étudiants Bâtisseur N1
  "DEALAGENT",       // Code de test
  "SERUJAN2025",     // Code VIP
  "PLEX2025",        // Nouveau code de cohorte
  // Ajoute ici les codes par cohorte ou par étudiant
];
```

Les codes ne sont jamais exposés dans le navigateur — ils sont validés côté serveur uniquement via `/api/validate-code`.

## Nouvelles fonctionnalités v8

1. Mobile-first — layout responsive, onglets scrollables, touch-friendly
2. Portfolio dashboard — tous les deals sauvegardés avec statuts
3. Simulateur de négociation — slider de prix en temps réel
4. Simulateur de rénovation — modélise les coûts et gains
5. Soumission de deal — leads qualifiés directement vers toi
6. Codes d'accès sécurisés côté serveur
7. Recherche d'adresse et insight IA exécutés côté serveur

## Push et déploiement

```bash
git add .
git commit -m "v8 - mobile, portfolio, nego, reno, submission"
git push
```

Vercel redéploie automatiquement en 2-3 minutes.
