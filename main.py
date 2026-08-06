from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from analysis import (
    get_data_for_tickers,
    principal_component_analysis,
)


app = FastAPI(
    title="PREDICT HUB",
    version="0.1.0",
)


# Allows your React frontend to call FastAPI during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PCARequest(BaseModel):
    tickers: list[str] = Field(min_length=2, max_length=100)
    start_ts: int
    end_ts: int
    period_interval: int = 1440


@app.get("/")
def root():
    return {
        "message": "Prediction Market Analytics API",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/analysis/pca")
def run_pca(request: PCARequest):
    if request.start_ts >= request.end_ts:
        raise HTTPException(
            status_code=400,
            detail="start_ts must be earlier than end_ts",
        )

    try:
        prices = get_data_for_tickers(
            tickers=request.tickers,
            start_ts=request.start_ts,
            end_ts=request.end_ts,
            period_interval=request.period_interval,
        )

        # PCA requires complete observations across the selected markets.
        clean_prices = prices.dropna()

        if clean_prices.empty:
            raise HTTPException(
                status_code=422,
                detail="No overlapping price observations were found.",
            )

        if len(clean_prices) < 2:
            raise HTTPException(
                status_code=422,
                detail="At least two complete timestamps are required.",
            )

        pca_results = principal_component_analysis(clean_prices)

        return {
            "metadata": {
                "tickers": request.tickers,
                "start_ts": request.start_ts,
                "end_ts": request.end_ts,
                "period_interval": request.period_interval,
                "observations": len(clean_prices),
                "markets": len(clean_prices.columns),
            },
            "explained_variance": pca_results.to_dict(
                orient="records"
            ),
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"PCA analysis failed: {error}",
        ) from error