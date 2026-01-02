#!/usr/bin/env python
import sys
import json


# The user said: pip install moneycontrol-api
# The actual import name is likely 'moneycontrol' (package: moneycontrol-api)
# We'll try both to be robust.
try:
    import moneycontrol  # type: ignore
except Exception:
    moneycontrol = None 

 
try:
    import moneycontrol_api  # hypothetical alt import if naming differs
except Exception:
    moneycontrol_api = None


def fail(msg):
    sys.stdout.write(json.dumps({"error": msg}))
    sys.exit(0)


def main():
    if len(sys.argv) < 2:
        return fail("Missing query")

    query = sys.argv[1].strip()
    if not query:
        return fail("Missing query")

    # Try to search and then fetch details via moneycontrol. The APIs differ across versions.
    data = None
    err = None

    # moneycontrol lib community variants expose different APIs. We'll try common patterns.
    try:
        if moneycontrol is not None:
            # Try search
            # Some versions: moneycontrol.search_stocks(query) -> list of dicts
            # Others: moneycontrol.search(query)
            results = None
            for fn in (getattr(moneycontrol, 'search_stocks', None), getattr(moneycontrol, 'search', None)):
                if callable(fn):
                    try:
                        results = fn(query)
                        break
                    except Exception as e:
                        err = str(e)
                        results = None
            if not results:
                raise RuntimeError("No results from Moneycontrol search")

            # Pick first reasonable match
            best = results[0] if isinstance(results, list) and len(results) else results

            # Fetch quote/details. Some APIs use get_stock_quote(symbol) or get_quote(mc_id)
            detail = None
            for fn_name in ('get_stock_quote', 'get_quote', 'get_stock_details'):
                fn = getattr(moneycontrol, fn_name, None)
                if callable(fn):
                    try:
                        # Try id or symbol from search result
                        sym_keys = ['symbol', 'mc_id', 'id', 'code']
                        arg = None
                        for k in sym_keys:
                            if isinstance(best, dict) and best.get(k):
                                arg = best[k]
                                break
                        # fallback to query
                        detail = fn(arg or query)
                        break
                    except Exception as e:
                        err = str(e)
                        detail = None

            if not detail:
                # Some versions: moneycontrol.quote(query)
                qf = getattr(moneycontrol, 'quote', None)
                if callable(qf):
                    try:
                        detail = qf(query)
                    except Exception as e:
                        err = str(e)

            data = detail
    except Exception as e:
        err = str(e)

    # Fallback to moneycontrol_api if present
    if data is None and moneycontrol_api is not None:
        try:
            # Hypothetical similar usage
            srch = getattr(moneycontrol_api, 'search', None)
            detail_fn = getattr(moneycontrol_api, 'get_quote', None) or getattr(moneycontrol_api, 'quote', None)
            if callable(srch):
                results = srch(query)
            else:
                results = None
            if results and isinstance(results, list):
                best = results[0]
            else:
                best = None
            if callable(detail_fn):
                arg = None
                if isinstance(best, dict):
                    for k in ['symbol', 'mc_id', 'id', 'code']:
                        if best.get(k):
                            arg = best[k]
                            break
                detail = detail_fn(arg or query)
            else:
                detail = None
            data = detail
        except Exception as e:
            err = str(e)

    if data is None:
        return fail(err or "Moneycontrol data not available")

    # Normalize output
    # Try to extract common fields; fall back conservatively.
    try:
        def pick(d, keys, default=None):
            for k in keys:
                if isinstance(d, dict) and d.get(k) is not None:
                    return d[k]
            return default

        symbol = pick(data, ['symbol', 'ticker', 'code', 'mc_id']) or query
        name = pick(data, ['name', 'longName', 'long_name', 'company']) or symbol
        price = pick(data, ['price', 'ltp', 'last_price', 'lastPrice', 'last_trade_price'])
        change_pct = pick(data, ['change_percent', 'changePercent', 'pChange', 'pct_change'])
        volume = pick(data, ['volume', 'vol', 'tradedVolume'])
        market_cap = pick(data, ['marketCap', 'market_cap'])

        out = {
            'symbol': symbol,
            'name': name,
            'price': price,
            'change': change_pct,
            'volume': volume,
            'marketCap': market_cap,
            'raw': data,
        }
        sys.stdout.write(json.dumps(out, ensure_ascii=False))
        return
    except Exception as e:
        return fail(str(e))


if __name__ == '__main__':
    main()
