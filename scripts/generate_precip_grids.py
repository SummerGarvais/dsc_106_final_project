import argparse
import json
from calendar import monthrange
from pathlib import Path

import numpy as np
from netCDF4 import Dataset


DECADE_YEARS = range(1850, 2001, 10)
ANNUAL_YEARS = range(1850, 2001)
SOURCE = {
    "project": "CMIP6",
    "activity_id": "CMIP",
    "institution_id": "NCAR",
    "source_id": "CESM2",
    "experiment_id": "historical",
    "variant_label": "r1i1p1f1",
    "table_id": "Amon",
    "variable_id": "pr",
    "grid_label": "gn",
    "version": "v20190401",
    "variable_long_name": "Precipitation",
    "variable_units": "kg m-2 s-1",
    "grid": "native 0.9x1.25 finite volume grid (192x288 latxlon)",
    "source_url": "https://g-52ba3.fd635.8443.data.globus.org/css03_data/CMIP6/CMIP/NCAR/CESM2/historical/r1i1p1f1/Amon/pr/gn/v20190401/pr_Amon_CESM2_historical_r1i1p1f1_gn_185001-201412.nc",
}


def compact_grid(values):
    return np.round(np.asarray(values, dtype=np.float64), 12).tolist()


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))


def month_index(year, month):
    return (year - 1850) * 12 + (month - 1)


def generate(raw_path, monthly_dir, annual_dir):
    with Dataset(raw_path) as ds:
        pr = ds.variables["pr"]
        units = getattr(pr, "units", SOURCE["variable_units"])

        for year in ANNUAL_YEARS:
            weighted = None
            total_days = 0
            for month in range(1, 13):
                days = monthrange(year, month)[1]
                frame = np.asarray(pr[month_index(year, month), :, :], dtype=np.float64)
                weighted = frame * days if weighted is None else weighted + frame * days
                total_days += days

                if year in DECADE_YEARS:
                    write_json(
                        monthly_dir / f"prec_{year}_{month:02d}.json",
                        {
                            "year": year,
                            "month": month,
                            "data": compact_grid(frame),
                            "units": units,
                            "aggregation": "monthly_mean",
                        },
                    )

            write_json(
                annual_dir / f"prec_annual_{year}.json",
                {
                    "year": year,
                    "data": compact_grid(weighted / total_days),
                    "units": units,
                    "aggregation": "day_weighted_annual_mean_of_monthly_means",
                },
            )

    write_json(monthly_dir / "source.json", {**SOURCE, "stored_data": "monthly mean grids for decade years, all months"})
    write_json(annual_dir / "source.json", {**SOURCE, "stored_data": "day-weighted annual mean grids for every year 1850-2000"})


def main():
    parser = argparse.ArgumentParser(description="Generate website precipitation grids from CMIP6 CESM2 pr.")
    parser.add_argument("raw_path", type=Path)
    parser.add_argument("--monthly-dir", type=Path, default=Path("data/prec_data"))
    parser.add_argument("--annual-dir", type=Path, default=Path("data/prec_annual_data"))
    args = parser.parse_args()
    generate(args.raw_path, args.monthly_dir, args.annual_dir)


if __name__ == "__main__":
    main()
