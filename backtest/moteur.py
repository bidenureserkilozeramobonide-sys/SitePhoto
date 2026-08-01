#!/usr/bin/env python3
"""Moteur de backtest répliquant indicators/strategie-complet.pine.

Entrée : un export CSV de données de graphique TradingView
(« Exporter les données du graphique… ») contenant time, open, high,
low, close, volume. Les indicateurs (EMA, RSI, MACD, ATR, Supertrend)
suivent les définitions de Pine Script (moyennes RMA, amorçage SMA),
l'exécution se fait au prix de clôture de la bougie du signal
(process_orders_on_close) avec commission en % par ordre.

Usage :
    python3 moteur.py données.csv [--shorts] [--st-exit] [--mise 50]
        [--commission 0.1] [--min-score 90] [--cooldown 10]
"""
import argparse
import csv
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone


# ── Indicateurs (sémantique Pine) ──────────────────────────────────

def ema(values, length):
    out = [math.nan] * len(values)
    alpha = 2 / (length + 1)
    seed_done = False
    acc = 0.0
    for i, v in enumerate(values):
        if not seed_done:
            acc += v
            if i == length - 1:
                out[i] = acc / length
                seed_done = True
        else:
            out[i] = alpha * v + (1 - alpha) * out[i - 1]
    return out


def rma(values, length):
    out = [math.nan] * len(values)
    alpha = 1 / length
    seed_done = False
    acc = 0.0
    n = 0
    for i, v in enumerate(values):
        if math.isnan(v):
            continue
        if not seed_done:
            acc += v
            n += 1
            if n == length:
                out[i] = acc / length
                seed_done = True
        else:
            out[i] = alpha * v + (1 - alpha) * out[i - 1]
    return out


def rsi(closes, length):
    gains = [math.nan]
    losses = [math.nan]
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    ag = rma(gains, length)
    al = rma(losses, length)
    out = []
    for g, l in zip(ag, al):
        if math.isnan(g) or math.isnan(l):
            out.append(math.nan)
        elif l == 0:
            out.append(100.0)
        else:
            out.append(100 - 100 / (1 + g / l))
    return out


def sma(values, length):
    out = [math.nan] * len(values)
    s = 0.0
    for i, v in enumerate(values):
        s += v
        if i >= length:
            s -= values[i - length]
        if i >= length - 1:
            out[i] = s / length
    return out


def atr(highs, lows, closes, length):
    trs = [math.nan]
    for i in range(1, len(closes)):
        trs.append(max(highs[i] - lows[i],
                       abs(highs[i] - closes[i - 1]),
                       abs(lows[i] - closes[i - 1])))
    return rma(trs, length)


def supertrend(highs, lows, closes, factor, length):
    """Retourne (ligne, direction) ; direction -1 = haussier (comme Pine)."""
    a = atr(highs, lows, closes, length)
    n = len(closes)
    st = [math.nan] * n
    direction = [1] * n
    upper = lower = math.nan
    for i in range(n):
        if math.isnan(a[i]):
            continue
        hl2 = (highs[i] + lows[i]) / 2
        bu = hl2 + factor * a[i]
        bl = hl2 - factor * a[i]
        if math.isnan(upper):
            upper, lower = bu, bl
            direction[i] = 1 if closes[i] <= upper else -1
        else:
            upper = bu if (bu < upper or closes[i - 1] > upper) else upper
            lower = bl if (bl > lower or closes[i - 1] < lower) else lower
            prev = direction[i - 1]
            if prev == 1:  # baissier, ligne = upper
                direction[i] = -1 if closes[i] > upper else 1
            else:          # haussier, ligne = lower
                direction[i] = 1 if closes[i] < lower else -1
        st[i] = lower if direction[i] == -1 else upper
    return st, direction


# ── Chargement CSV TradingView ─────────────────────────────────────

def load_csv(path):
    """Accepte les exports TradingView et les CSV CryptoDataDownload
    (ligne de commentaire en tête, ordre décroissant, colonne unix)."""
    with open(path, encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    # certains fichiers (CryptoDataDownload) commencent par une ligne de crédit
    while rows and (len(rows[0]) < 5 or "http" in rows[0][0].lower()):
        rows.pop(0)
    header = [h.strip().lower() for h in rows[0]]

    def col(*names):
        for nm in names:
            for j, hd in enumerate(header):
                if hd == nm or hd.startswith(nm + " "):
                    return j
        return None

    it = col("unix", "time", "date", "date et heure", "timestamp")
    io = col("open", "ouv", "ouverture")
    ih = col("high", "haut")
    il = col("low", "bas")
    ic = col("close", "clôture", "cloture", "fermeture")
    iv = col("volume usd", "volume", "vol", "volume btc")
    if None in (it, io, ih, il, ic):
        sys.exit(f"Colonnes introuvables dans {header} — il faut time/open/high/low/close (+volume).")

    data = []
    for r in rows[1:]:
        if not r or len(r) <= max(it, io, ih, il, ic) or not r[io]:
            continue
        raw = r[it].strip()
        if raw.replace(".", "").isdigit():
            x = float(raw)
            if x > 1e12:            # millisecondes
                x /= 1000.0
            dt = datetime.fromtimestamp(x, tz=timezone.utc)
        else:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        vol = 0.0
        if iv is not None and len(r) > iv and r[iv] not in ("", "NaN"):
            vol = float(r[iv])
        data.append((dt, float(r[io]), float(r[ih]), float(r[il]), float(r[ic]), vol))

    data.sort(key=lambda x: x[0])   # ordre chronologique croissant garanti
    ts, o, h, l, c, v = map(list, zip(*data))
    return ts, o, h, l, c, v


def resample(ts, o, h, l, c, v, hours):
    """Agrège des bougies en périodes de N heures alignées sur l'epoch UTC."""
    out = []
    key_prev = None
    for i in range(len(ts)):
        key = int(ts[i].timestamp()) // (hours * 3600)
        if key != key_prev:
            out.append([ts[i], o[i], h[i], l[i], c[i], v[i]])
            key_prev = key
        else:
            out[-1][2] = max(out[-1][2], h[i])
            out[-1][3] = min(out[-1][3], l[i])
            out[-1][4] = c[i]
            out[-1][5] += v[i]
    ts2, o2, h2, l2, c2, v2 = map(list, zip(*out))
    return ts2, o2, h2, l2, c2, v2


# ── Backtest ───────────────────────────────────────────────────────

def run(path, mise=50.0, commission_pct=0.1, use_shorts=False, use_st_exit=False,
        min_score=90, cooldown=10, len_fast=21, len_slow=55, resample_hours=0):
    ts, o, h, l, c, v = load_csv(path)
    if resample_hours:
        ts, o, h, l, c, v = resample(ts, o, h, l, c, v, resample_hours)
    n = len(c)
    if n < 200:
        sys.exit(f"Seulement {n} bougies — il en faut au moins ~200.")

    ema_f = ema(c, len_fast)
    ema_s = ema(c, len_slow)
    rsi14 = rsi(c, 14)
    macd = [a - b if not (math.isnan(a) or math.isnan(b)) else math.nan
            for a, b in zip(ema(c, 12), ema(c, 26))]
    # signal MACD : EMA9 amorcée au premier index où macd est défini
    first = next(i for i, x in enumerate(macd) if not math.isnan(x))
    sig_tail = ema(macd[first:], 9)
    macd_sig = [math.nan] * first + sig_tail
    vol_ma = sma(v, 20)
    _, st_dir = supertrend(h, l, c, 3.0, 10)

    fee = commission_pct / 100.0
    pos = 0            # 1 long, -1 short, 0 flat
    entry_px = math.nan
    entry_i = -1
    last_entry = None
    trades = []        # dict: side, entry_time, exit_time, entry, exit, ret_pct, pnl_eur, fees_eur, bars, exit_reason

    def close_pos(i, reason):
        nonlocal pos, entry_px, entry_i
        gross = pos * (c[i] - entry_px) / entry_px          # rendement brut
        fees = fee * 2                                       # entrée + sortie, en fraction de la mise
        net = gross - fees
        trades.append(dict(side="long" if pos == 1 else "short",
                           entry_time=ts[entry_i], exit_time=ts[i],
                           entry=entry_px, exit=c[i],
                           ret_pct=net * 100, pnl_eur=mise * net,
                           fees_eur=mise * fees, bars=i - entry_i,
                           exit_reason=reason))
        pos = 0
        entry_px = math.nan
        entry_i = -1

    warm = 250
    for i in range(warm, n):
        needed = (ema_f[i], ema_s[i], ema_f[i - 1], ema_s[i - 1], rsi14[i], macd[i], macd_sig[i], vol_ma[i])
        if any(math.isnan(x) for x in needed):
            continue
        cross_up = ema_f[i - 1] <= ema_s[i - 1] and ema_f[i] > ema_s[i]
        cross_dn = ema_f[i - 1] >= ema_s[i - 1] and ema_f[i] < ema_s[i]
        st_bull = st_dir[i] == -1
        mom_bull = rsi14[i] > 50 and macd[i] > macd_sig[i]
        mom_bear = rsi14[i] < 50 and macd[i] < macd_sig[i]
        vol_fort = v[i] > vol_ma[i] * 1.2

        score = (25 if ema_f[i] > ema_s[i] else 0) + (25 if st_bull else 0) \
            + (15 if rsi14[i] > 50 else 0) + (15 if macd[i] > macd_sig[i] else 0) \
            + (10 if c[i] > ema_f[i] else 0) + (10 if vol_fort and c[i] > o[i] else 0)

        buy_sig = cross_up and st_bull and mom_bull
        sell_sig = cross_dn and not st_bull and mom_bear
        can_enter = cooldown == 0 or last_entry is None or i - last_entry >= cooldown
        long_ok = buy_sig and can_enter and score >= min_score
        short_ok = sell_sig and can_enter and (100 - score) >= min_score

        # sortie de protection Supertrend (option)
        if use_st_exit and pos != 0:
            if pos == 1 and not st_bull and st_dir[i - 1] == -1:
                close_pos(i, "Stop Supertrend")
            elif pos == -1 and st_bull and st_dir[i - 1] == 1:
                close_pos(i, "Stop Supertrend")

        # ordres (à la clôture de la bougie du signal, comme process_orders_on_close)
        if long_ok and pos <= 0:
            if pos == -1:
                close_pos(i, "Signal inverse")
            pos = 1
            entry_px = c[i]
            entry_i = i
            last_entry = i
        elif sell_sig:
            if use_shorts and short_ok and pos >= 0:
                if pos == 1:
                    close_pos(i, "Signal inverse")
                pos = -1
                entry_px = c[i]
                entry_i = i
                last_entry = i
            elif not use_shorts and pos == 1:
                close_pos(i, "Sortie SELL")

    if pos != 0:
        close_pos(n - 1, "Fin de données")

    return ts, trades


def report(ts, trades, mise, label):
    print(f"\n════ {label} ════")
    print(f"Période des données : {ts[0]:%Y-%m-%d} → {ts[-1]:%Y-%m-%d}  ({len(ts)} bougies)")
    if not trades:
        print("Aucun trade.")
        return
    wins = [t for t in trades if t["pnl_eur"] > 0]
    losses = [t for t in trades if t["pnl_eur"] <= 0]
    net = sum(t["pnl_eur"] for t in trades)
    fees = sum(t["fees_eur"] for t in trades)
    pf_den = -sum(t["pnl_eur"] for t in losses)
    pf = (sum(t["pnl_eur"] for t in wins) / pf_den) if pf_den > 0 else float("inf")
    # drawdown max sur le P&L cumulé
    cum = peak = 0.0
    dd = 0.0
    for t in trades:
        cum += t["pnl_eur"]
        peak = max(peak, cum)
        dd = min(dd, cum - peak)
    print(f"Trades : {len(trades)}   gagnants : {len(wins)} ({100*len(wins)/len(trades):.1f} %)   "
          f"facteur de profit : {pf:.2f}")
    if wins:
        print(f"Gain moyen  : {sum(t['ret_pct'] for t in wins)/len(wins):+.2f} %")
    if losses:
        print(f"Perte moyenne : {sum(t['ret_pct'] for t in losses)/len(losses):+.2f} %")
    print(f"P&L net : {net:+.2f} €   (frais : {fees:.2f} €, brut : {net+fees:+.2f} €)   "
          f"drawdown max : {dd:.2f} €")
    by_m = defaultdict(float)
    for t in trades:
        by_m[t["entry_time"].strftime("%Y-%m")] += t["pnl_eur"]
    pos_m = sum(1 for x in by_m.values() if x > 0)
    print(f"Mois positifs : {pos_m}/{len(by_m)}")
    for m in sorted(by_m):
        print(f"  {m} : {by_m[m]:+7.2f} €")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--mise", type=float, default=50.0)
    ap.add_argument("--commission", type=float, default=0.1, help="%% par ordre")
    ap.add_argument("--shorts", action="store_true")
    ap.add_argument("--st-exit", action="store_true")
    ap.add_argument("--min-score", type=int, default=90)
    ap.add_argument("--cooldown", type=int, default=10)
    ap.add_argument("--resample-hours", type=int, default=0, help="agréger les bougies en N heures (ex. 4)")
    ap.add_argument("--export", help="chemin CSV pour la liste des trades")
    args = ap.parse_args()

    ts, trades = run(args.csv, mise=args.mise, commission_pct=args.commission,
                     use_shorts=args.shorts, use_st_exit=args.st_exit,
                     min_score=args.min_score, cooldown=args.cooldown,
                     resample_hours=args.resample_hours)
    label = f"{'LONGS+SHORTS' if args.shorts else 'LONGS SEULS'}" \
            f"{', stop Supertrend' if args.st_exit else ''}, commission {args.commission} %" \
            f"{f', bougies {args.resample_hours}h' if args.resample_hours else ''}"
    report(ts, trades, args.mise, label)

    if args.export and trades:
        with open(args.export, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(trades[0].keys()))
            w.writeheader()
            w.writerows(trades)
        print(f"\nListe des trades exportée : {args.export}")


if __name__ == "__main__":
    main()
