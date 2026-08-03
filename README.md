# Katalog

Internal browser for the datasets on our cluster: what exists, how big, how fresh, and a peek inside.

Layout:

```
cluster                          server                   github
+-----------------------+        +---------------+        +-------------+
| datasets --> scan --> | =====> | API --------> | =====> | frontend    |
| (build index)         |        | (read-only)   |        | (static)    |
+-----------------------+        +---------------+        +-------------+
```

- The datasets stay where they are (no `mv`, no locking mechanism, no symlinks), indexing needs no cooperation from their owners
- A scan job walks a curated set of locations and records, per dataset metadata (size, last-modified time, layout kind, columnar tables, sharded archives, media folders, ...)
- Each dataset is tagged `volatile` (changed recently), `stable`, `missing`, or `invalid`
- The result is a small catalog behind a read-only API

## API

```
GET /api/datasets              list, one summary row per dataset
GET /api/datasets.csv          same, as CSV
GET /api/datasets/{id}         dataset details
GET /api/datasets/{id}/rows    preview rows, ?page=N (10 per page)
GET /previews/...              preview images
```

## Frontend

Plain static HTML/CSS/JS.

```
index.html   list view
detail.html  single dataset view
style.css    global styles
js/          page logic
vendor/      rendering, sanitization
```
