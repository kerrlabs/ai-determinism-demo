"""Generate a seeded synthetic sales dataset and load it into SQLite.

The data is fully reproducible: a fixed RNG seed means the CSV and the SQLite
database are byte-for-byte identical every time this script runs. That matters
because the whole demo rests on "same data set" -- so the data itself must be
deterministic.

Run directly:
    python -m app.data
"""
from __future__ import annotations

import sqlite3

import numpy as np
import pandas as pd

from app.config import CSV_PATH, DATA_DIR, DB_PATH

SEED = 42
N_ROWS = 2000

REGIONS = ["West", "East", "North", "South"]
CATEGORIES = {
    "Electronics": ["Laptop", "Phone", "Monitor", "Headphones"],
    "Furniture": ["Desk", "Chair", "Bookshelf"],
    "Office": ["Notebook", "Pen Pack", "Stapler", "Printer"],
}
# Rough per-product unit price ranges (min, max) in dollars.
PRICE_RANGES = {
    "Laptop": (900, 1800),
    "Phone": (500, 1200),
    "Monitor": (150, 450),
    "Headphones": (40, 300),
    "Desk": (180, 600),
    "Chair": (90, 400),
    "Bookshelf": (60, 250),
    "Notebook": (3, 12),
    "Pen Pack": (2, 8),
    "Stapler": (6, 20),
    "Printer": (120, 500),
}


def generate_dataframe() -> pd.DataFrame:
    """Build the synthetic sales dataset deterministically."""
    rng = np.random.default_rng(SEED)

    # Flatten category/product pairs for sampling.
    product_pairs = [
        (category, product)
        for category, products in CATEGORIES.items()
        for product in products
    ]

    # Dates across one calendar year (2024), used to derive quarters.
    date_range = pd.date_range("2024-01-01", "2024-12-31", freq="D")

    rows = []
    for i in range(N_ROWS):
        category, product = product_pairs[rng.integers(0, len(product_pairs))]
        region = REGIONS[rng.integers(0, len(REGIONS))]
        order_date = date_range[rng.integers(0, len(date_range))]
        quantity = int(rng.integers(1, 11))  # 1..10 units
        low, high = PRICE_RANGES[product]
        unit_price = round(float(rng.uniform(low, high)), 2)
        revenue = round(unit_price * quantity, 2)
        rows.append(
            {
                "order_id": 1000 + i,
                "order_date": order_date.strftime("%Y-%m-%d"),
                "quarter": f"Q{((order_date.month - 1) // 3) + 1}",
                "region": region,
                "category": category,
                "product": product,
                "quantity": quantity,
                "unit_price": unit_price,
                "revenue": revenue,
            }
        )

    df = pd.DataFrame(rows)
    # Stable ordering so the CSV is identical across runs.
    df = df.sort_values("order_id").reset_index(drop=True)
    return df


def build() -> pd.DataFrame:
    """Generate the dataset, write the CSV, and load it into SQLite."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = generate_dataframe()

    df.to_csv(CSV_PATH, index=False)

    # (Re)create the SQLite database from scratch.
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(DB_PATH)
    try:
        df.to_sql("sales", conn, index=False)
        conn.execute("CREATE INDEX idx_region ON sales(region)")
        conn.execute("CREATE INDEX idx_quarter ON sales(quarter)")
        conn.execute("CREATE INDEX idx_category ON sales(category)")
        conn.commit()
    finally:
        conn.close()

    return df


if __name__ == "__main__":
    frame = build()
    print(f"Wrote {len(frame)} rows")
    print(f"  CSV:    {CSV_PATH}")
    print(f"  SQLite: {DB_PATH}")
    print()
    print("Preview:")
    print(frame.head(10).to_string(index=False))
