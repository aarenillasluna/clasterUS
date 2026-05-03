import numpy as np
import pandas as pd
from sklearn.cluster import KMeans, DBSCAN
from sklearn.decomposition import PCA
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from typing import Any, Dict, List, Optional, Tuple

from models import ColumnInfo, ClusterRequest, ClusterResponse, ParseResponse


# ---------------------------------------------------------------------------
# JSON normalization
# ---------------------------------------------------------------------------

def flatten_record(obj: Any, prefix: str = "", sep: str = ".") -> Dict[str, Any]:
    """Recursively flatten nested dicts/lists into dot-notation leaf keys."""
    result: Dict[str, Any] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            new_key = f"{prefix}{sep}{k}" if prefix else k
            result.update(flatten_record(v, new_key, sep))
    elif isinstance(obj, list):
        if not obj:
            pass
        elif all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in obj):
            for i, v in enumerate(obj):
                result[f"{prefix}{sep}{i}" if prefix else str(i)] = v
        elif all(isinstance(x, str) for x in obj):
            result[prefix] = ", ".join(obj)
        # array of objects → skip
    else:
        result[prefix] = obj
    return result


def find_record_arrays(obj: Any, path: str = "") -> List[Tuple[str, List]]:
    """BFS: collect every array-of-objects found anywhere in obj."""
    found = []
    if isinstance(obj, list) and obj and isinstance(obj[0], dict):
        found.append((path or "root", obj))
    elif isinstance(obj, dict):
        for k, v in obj.items():
            sub = f"{path}.{k}" if path else k
            found.extend(find_record_arrays(v, sub))
    return found


def auto_detect_records(data: Any) -> Tuple[str, List[Dict]]:
    """Return (detected_path, records) for the largest array-of-objects in data."""
    candidates = find_record_arrays(data)
    if not candidates:
        raise ValueError(
            "No array of objects found. Expected a JSON array like [{...}, {...}] "
            "or an object containing such an array."
        )
    path, records = max(candidates, key=lambda x: len(x[1]))
    if len(records) < 2:
        raise ValueError("Array must contain at least 2 records")
    if len(records) > 100_000:
        raise ValueError("Array exceeds 100,000 row limit")
    return path, records


# ---------------------------------------------------------------------------
# Weight recommendation
# ---------------------------------------------------------------------------

def _recommend_weight(series: pd.Series, dtype: str) -> float:
    """Suggest a weight based on how much variance/discrimination this feature offers."""
    non_null = series.dropna()
    if len(non_null) < 2:
        return 0.5

    if dtype == "categorical":
        card = non_null.nunique()
        if card <= 1:
            return 0.1
        elif card <= 3:
            return 1.5
        elif card <= 10:
            return 1.0
        elif card <= 30:
            return 0.7
        else:
            return 0.5

    nums = pd.to_numeric(non_null, errors="coerce").dropna().astype(float)
    if len(nums) < 2:
        return 0.5

    total_range = float(nums.max() - nums.min())
    std = float(nums.std())

    if total_range < 1e-9 or std < 1e-9:
        return 0.1  # effectively constant

    med = float(nums.median())
    iqr = float(nums.quantile(0.75) - nums.quantile(0.25))

    # Binary / 0-1 feature
    if total_range <= 1.01 and float(nums.min()) >= -0.01:
        return round(min(1.5, 0.5 + iqr), 1)

    # Robust CV: IQR / |median| when median is large enough
    if abs(med) > 1.0:
        robust_cv = iqr / abs(med)
    else:
        robust_cv = iqr / (std + 1e-9)

    if robust_cv >= 1.5:
        return 3.0
    elif robust_cv >= 0.8:
        return 2.0
    elif robust_cv >= 0.4:
        return 1.5
    elif robust_cv >= 0.1:
        return 1.0
    else:
        return 0.5


# ---------------------------------------------------------------------------
# Parse schema
# ---------------------------------------------------------------------------

def parse_schema(data: Any) -> ParseResponse:
    path, records = auto_detect_records(data)
    flat = [flatten_record(r) for r in records]
    df = pd.DataFrame(flat)

    total = len(df)
    columns = []
    for col in df.columns:
        series = df[col]
        non_null = series.dropna()
        null_count = int(series.isna().sum())
        coverage = round(len(non_null) / total, 4) if total > 0 else 0.0
        numeric_conv = pd.to_numeric(non_null, errors="coerce")
        ratio = numeric_conv.notna().sum() / max(len(non_null), 1)
        dtype = "numeric" if ratio > 0.8 else "categorical"
        sample = non_null.head(3).tolist()

        cardinality = int(non_null.nunique()) if dtype == "categorical" else None
        rec_weight = _recommend_weight(non_null, dtype)

        columns.append(ColumnInfo(
            name=col,
            dtype=dtype,
            null_count=null_count,
            coverage=coverage,
            sample_values=sample,
            cardinality=cardinality,
            recommended_weight=rec_weight,
        ))

    return ParseResponse(row_count=total, columns=columns, detected_path=path)


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

def run_clustering(request: ClusterRequest) -> ClusterResponse:
    _, records = auto_detect_records(request.data)
    flat = [flatten_record(r) for r in records]
    df = pd.DataFrame(flat)

    # --- Numeric features ---
    missing_num = [c for c in request.columns if c not in df.columns]
    if missing_num:
        raise ValueError(f"Columns not found in data: {missing_num}")

    selected = df[request.columns].copy()
    for col in selected.columns:
        selected[col] = pd.to_numeric(selected[col], errors="coerce")

    imputer = SimpleImputer(strategy="median")
    X_num = imputer.fit_transform(selected)

    scaler_num = StandardScaler()
    X_scaled = scaler_num.fit_transform(X_num)

    if request.weights:
        for i, c in enumerate(request.columns):
            X_scaled[:, i] *= max(0.01, request.weights.get(c, 1.0))

    # --- Categorical features (one-hot encoded) ---
    if request.categorical_columns:
        missing_cat = [c for c in request.categorical_columns if c not in df.columns]
        if missing_cat:
            raise ValueError(f"Categorical columns not found: {missing_cat}")

        cat_parts = []
        cat_col_origins = []  # parallel list: which original col each dummy column belongs to

        for orig_col in request.categorical_columns:
            col_series = df[orig_col].fillna("__missing__").astype(str)
            col_dummies = pd.get_dummies(col_series, dtype=float)
            for _ in col_dummies.columns:
                cat_col_origins.append(orig_col)
            cat_parts.append(col_dummies)

        cat_df = pd.concat(cat_parts, axis=1)
        scaler_cat = StandardScaler()
        X_cat = scaler_cat.fit_transform(cat_df)

        for j, orig_col in enumerate(cat_col_origins):
            w = max(0.01, request.weights.get(orig_col, 1.0)) if request.weights else 1.0
            X_cat[:, j] *= w

        X_scaled = np.hstack([X_scaled, X_cat])

    # --- Clustering ---
    inertia = None
    if request.algorithm == "kmeans":
        k = min(request.n_clusters, len(X_scaled) - 1)
        model = KMeans(n_clusters=k, random_state=42, n_init="auto")
        labels = model.fit_predict(X_scaled).tolist()
        inertia = float(model.inertia_)
    else:
        model = DBSCAN(eps=request.eps, min_samples=request.min_samples)
        labels = model.fit_predict(X_scaled).tolist()

    # --- PCA for visualization ---
    n_features = X_scaled.shape[1]
    n_components = min(3, n_features)
    pca_coords: Optional[List[Dict[str, float]]] = None
    pca_variance: Optional[float] = None
    dims = n_components

    if n_features >= 2:
        pca = PCA(n_components=n_components)
        coords = pca.fit_transform(X_scaled)
        pca_variance = float(np.sum(pca.explained_variance_ratio_))
        if n_components >= 3:
            pca_coords = [{"x": float(r[0]), "y": float(r[1]), "z": float(r[2])} for r in coords]
        else:
            pca_coords = [{"x": float(r[0]), "y": float(r[1])} for r in coords]
    elif n_features == 1:
        rng = np.random.default_rng(42)
        col_vals = X_scaled[:, 0]
        jitter = rng.uniform(-0.3, 0.3, size=len(col_vals))
        pca_coords = [{"x": float(col_vals[i]), "y": float(jitter[i])} for i in range(len(col_vals))]
        pca_variance = 1.0
        dims = 2

    # --- Build response ---
    cluster_counts: Dict[str, int] = {}
    for label in sorted(set(labels)):
        cluster_counts[str(label)] = labels.count(label)

    n_found = len(set(l for l in labels if l != -1))

    points = []
    for i, rec in enumerate(flat):
        point = {k: v for k, v in rec.items()}
        point["_cluster"] = int(labels[i])
        points.append(point)

    return ClusterResponse(
        labels=labels,
        cluster_counts=cluster_counts,
        inertia=inertia,
        n_clusters_found=n_found,
        points=points,
        pca_coords=pca_coords,
        pca_variance_explained=pca_variance,
        dims=dims,
    )
