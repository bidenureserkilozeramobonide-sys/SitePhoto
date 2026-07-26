# Indicateur Complet Pro — TradingView

Indicateur tout-en-un pour TradingView (Pine Script v6) : **tendance + momentum + volume**, avec signaux d'achat/vente, tableau de bord et alertes.

## Installation

1. Ouvre [TradingView](https://www.tradingview.com/chart/) et va dans l'**Éditeur Pine** (en bas du graphique).
2. Supprime le code par défaut et colle le contenu de [`indicateur-complet.pine`](indicateur-complet.pine).
3. Clique sur **« Ajouter au graphique »**.
4. (Optionnel) **« Enregistrer »** pour le retrouver dans *Indicateurs → Mes scripts*.

## Ce qu'il affiche

- **Nuage de tendance** : dégradé entre l'EMA 21 et l'EMA 55 — vert menthe en tendance haussière, rose corail en baissière. L'intensité du dégradé reflète la force de la tendance.
- **Supertrend** : ligne pointillée discrète servant de stop suiveur et de confirmation.
- **Bougies colorées** : dégradé rouge → vert selon un **score de confluence sur 100** (tendance, Supertrend, RSI, MACD, position du prix, volume).
- **Signaux** :
  - `BUY` / `SELL` — croisement des EMA confirmé par le Supertrend et le momentum (RSI + MACD).
  - `▲` / `▼` — reprises dans le sens de la tendance (retournement du Supertrend).
- **Tableau de bord** (coin du graphique) : état global, score, tendance, Supertrend, RSI et volume en temps réel.

## Alertes

Quatre conditions d'alerte sont intégrées (menu *Alertes → Condition → Complet Pro*) :

| Alerte | Déclencheur |
|---|---|
| Signal ACHAT | Croisement haussier confirmé |
| Signal VENTE | Croisement baissier confirmé |
| Reprise haussière (▲) | Retournement Supertrend dans une tendance haussière |
| Reprise baissière (▼) | Retournement Supertrend dans une tendance baissière |

## Réglages

Tous les paramètres sont ajustables dans les réglages de l'indicateur : longueurs des EMA, Supertrend, RSI/MACD, seuil de volume, ainsi que l'apparence (nuage, signaux, tableau, couleur des bougies, position du tableau).

> ⚠️ Cet indicateur est un outil d'aide à l'analyse, pas un conseil en investissement.
