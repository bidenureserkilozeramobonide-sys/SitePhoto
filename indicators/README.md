# Indicateur Complet Pro — TradingView

Indicateur tout-en-un pour TradingView (Pine Script v6) : **tendance + momentum + volume**, avec signaux d'achat/vente, suivi des trades en euros, tableau de bord et alertes. Optimisé pour rester fluide même sur de longs historiques.

## Installation

1. Ouvre [TradingView](https://www.tradingview.com/chart/) et va dans l'**Éditeur Pine** (en bas du graphique).
2. Supprime le code par défaut et colle le contenu de [`indicateur-complet.pine`](indicateur-complet.pine) **en entier** (le script se termine par la ligne `alertcondition(sellPullback, …)`).
3. Clique sur **« Ajouter au graphique »** — une seule fois. Pour les mises à jour suivantes, utilise le bouton **« Mettre à jour »** de l'éditeur afin de ne pas empiler plusieurs instances.

## Ce qu'il affiche

- **Nuage de tendance** entre l'EMA 21 et l'EMA 55 — vert menthe en tendance haussière, rose corail en baissière.
- **Supertrend** : ligne pointillée discrète servant de stop suiveur et de confirmation.
- **Bougies teintées** uniquement dans les zones de conviction forte, selon un **score de confluence sur 100** (tendance, Supertrend, RSI, MACD, position du prix, volume) : vert si score ≥ 70, rose si ≤ 30, couleurs normales entre les deux.
- **Signaux** (rendu natif, sur tout l'historique) :
  - `BUY` / `SELL` — croisement des EMA confirmé par le Supertrend et le momentum (RSI + MACD).
  - `▲` / `▼` — reprises dans le sens de la tendance (retournement du Supertrend).
- **Suivi des trades hypothétiques** : chaque signal ouvre une position au prix de clôture, le signal opposé la ferme et l'inverse. Chaque trade clôturé affiche son résultat `+2.3 % (+1.15 €)` pour une mise fixe (50 € par défaut, réglable), avec les prix d'entrée/sortie en infobulle et une ligne pointillée entrée → sortie.
- **Tableau de bord** : état global, score, tendance, Supertrend, RSI, volume, position en cours avec prix d'entrée, P&L latent en % et €, nombre de trades avec taux de réussite, cumul en % et €.

## Alertes

Quatre conditions d'alerte intégrées (menu *Alertes → Condition → Complet Pro*) :

| Alerte | Déclencheur |
|---|---|
| Signal ACHAT | Croisement haussier confirmé |
| Signal VENTE | Croisement baissier confirmé |
| Reprise haussière (▲) | Retournement Supertrend dans une tendance haussière |
| Reprise baissière (▼) | Retournement Supertrend dans une tendance baissière |

## Réglages

Tous les paramètres sont ajustables : longueurs des EMA, Supertrend, RSI/MACD, seuil de volume, **mise par trade en €**, ainsi que l'apparence (nuage, signaux, résultats des trades, lignes entrée → sortie, tableau, bougies, position du tableau).

## Notes de performance

Le script privilégie les rendus natifs de TradingView (`plotshape`, couleurs stables par tendance, trois états de bougies au lieu de dégradés continus) : les objets dessinés un à un se limitent à une étiquette et une ligne par trade clôturé.

> ⚠️ Le suivi des trades est hypothétique : mise fixe, exécution au prix de clôture de la bougie du signal, sans frais, slippage ni levier. Cet indicateur est un outil d'aide à l'analyse, pas un conseil en investissement.
