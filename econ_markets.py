import requests
import pandas as pd
import numpy as np
from datetime import datetime, timezone
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import OLSInfluence


def get_data_for_tickers(tickers, start_ts, end_ts, period_interval=1440, url = "https://external-api.kalshi.com/trade-api/v2/markets/candlesticks") -> pd.DataFrame:
    response = requests.get(
        url,
        params = {
            "market_tickers": ",".join(tickers),
            "start_ts": start_ts,
            "end_ts": end_ts,
            "period_interval": period_interval,
        },
        timeout = 15
    )
    response.raise_for_status()
    data = response.json()
    rows = []
    for market in data["markets"]:
        ticker = market["market_ticker"]
        for candle in market["candlesticks"]:
            price_data = candle.get("price", {})
            close_price = price_data.get("close_dollars", price_data.get("close"))
            rows.append({
                "timestamp": pd.to_datetime(
                    candle["end_period_ts"],
                    unit = 's',
                    utc = True
                ),
                "ticker": ticker,
                "price": float(close_price) * 100 if close_price is not None else None,
            })
    long_df = pd.DataFrame(rows)
    price_df = long_df.pivot(
        index = "timestamp",
        columns = "ticker",
        values = "price"
    ).sort_index()
    return price_df


def principal_component_analysis(markets: pd.DataFrame) -> pd.DataFrame:
    cov_matrix = markets.cov().to_numpy()

    eigenvalues, eigenvectors = np.linalg.eigh(cov_matrix)
    sorted_indices = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[sorted_indices]
    eigenvectors = eigenvectors[:, sorted_indices]

    df_centered = markets - markets.mean()
    data_centered = df_centered.to_numpy()

    pca_transformed = np.dot(data_centered, eigenvectors)

    explained_variance_ratio = eigenvalues / np.sum(eigenvalues)


    pca_frame = pd.DataFrame({
        "component": ["PC1","PC2", "PC3"],
        "explained_variance": explained_variance_ratio[:3] * 100
    })

    return pca_frame

    
