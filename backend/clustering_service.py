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
    else:
        result[prefix] = obj
    return result


def find_record_arrays(obj: Any, path: str = "") -> List[Tuple[str, List]]:
    found = []
    if isinstance(obj, list) and obj and isinstance(obj[0], dict):
        found.append((path or "root", obj))
    elif isinstance(obj, dict):
        for k, v in obj.items():
            sub = f"{path}.{k}" if path else k
            found.extend(find_record_arrays(v, sub))
    return found


def auto_detect_records(data: Any) -> Tuple[str, List[Dict]]:
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
        return 0.1

    med = float(nums.median())
    iqr = float(nums.quantile(0.75) - nums.quantile(0.25))

    if total_range <= 1.01 and float(nums.min()) >= -0.01:
        return round(min(1.5, 0.5 + iqr), 1)

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
# Grouped clustering helper
# ---------------------------------------------------------------------------

def _grouped_clustering(
    X_scaled: np.ndarray,
    group_col: pd.Series,
    request: ClusterRequest,
) -> Tuple[List[int], Dict[str, Any], float]:
    """Run a separate clustering per unique value of group_col.
    Returns (global_labels, group_cluster_map, total_inertia).
    global_labels: each record gets a unique integer that identifies (group, local_cluster).
    group_cluster_map: str(global_id) → {"group": str, "local": int}
    """
    n = len(X_scaled)
    labels: List[int] = [-1] * n
    global_id = 0
    group_cluster_map: Dict[str, Any] = {}
    total_inertia = 0.0

    for group_val in sorted(group_col.unique()):
        mask = (group_col == group_val).values
        indices = np.where(mask)[0]

        if len(indices) < 2:
            gid = global_id
            group_cluster_map[str(gid)] = {"group": group_val, "local": 0}
            for idx in indices:
                labels[int(idx)] = gid
            global_id += 1
            continue

        X_group = X_scaled[indices]
        k = max(2, min(request.n_clusters, len(indices) - 1))

        if request.algorithm == "kmeans":
            model = KMeans(n_clusters=k, random_state=42, n_init="auto")
            grp_labels = model.fit_predict(X_group)
            total_inertia += float(model.inertia_)
        else:
            model = DBSCAN(eps=request.eps, min_samples=request.min_samples)
            grp_labels = model.fit_predict(X_group)

        local_to_global: Dict[int, int] = {}
        for local_lbl in sorted(set(int(l) for l in grp_labels)):
            gid = global_id
            group_cluster_map[str(gid)] = {"group": group_val, "local": local_lbl}
            local_to_global[local_lbl] = gid
            global_id += 1

        for i, idx in enumerate(indices):
            labels[int(idx)] = local_to_global[int(grp_labels[i])]

    return labels, group_cluster_map, total_inertia


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

def run_clustering(request: ClusterRequest) -> ClusterResponse:
    _, records = auto_detect_records(request.data)
    flat = [flatten_record(r) for r in records]
    df = pd.DataFrame(flat)

    missing = [c for c in request.columns if c not in df.columns]
    if missing:
        raise ValueError(f"Columns not found in data: {missing}")

    selected = df[request.columns].copy()
    for col in selected.columns:
        selected[col] = pd.to_numeric(selected[col], errors="coerce")

    imputer = SimpleImputer(strategy="median")
    X_num = imputer.fit_transform(selected)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_num)

    if request.weights:
        for i, c in enumerate(request.columns):
            X_scaled[:, i] *= max(0.01, request.weights.get(c, 1.0))

    # --- Clusterin (grouped or flat) ---
    group_cluster_map: Optional[Dict[str, Any]] = None
    group_by_field: Optional[str] = None
    inertia: Optional[float] = None

    if request.group_by:
        if request.group_by not in df.columns:
            raise ValueError(f"Group-by column '{request.group_by}' not found in data")
        group_by_field = request.group_by
        group_col = df[request.group_by].fillna("__missing__").astype(str)
        labels_list, group_cluster_map, total_inertia = _grouped_clustering(
            X_scaled, group_col, request
        )
        labels = labels_list
        if request.algorithm == "kmeans":
            inertia = total_inertia
    else:
        if request.algorithm == "kmeans":
            k = min(request.n_clusters, len(X_scaled) - 1)
            model = KMeans(n_clusters=k, random_state=42, n_init="auto")
            labels = model.fit_predict(X_scaled).tolist()
            inertia = float(model.inertia_)
        else:
            model = DBSCAN(eps=request.eps, min_samples=request.min_samples)
            labels = model.fit_predict(X_scaled).tolist()

    # --- PCA for visualization (always on the full dataset) ---
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
        if group_cluster_map:
            info = group_cluster_map.get(str(labels[i]), {})
            point["_cluster_group"] = info.get("group", "")
            point["_cluster_local"] = info.get("local", labels[i])
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
        group_cluster_map=group_cluster_map,
        group_by_field=group_by_field,
    )
