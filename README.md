# P&ID Tag Extractor

This repository contains a simple script for extracting equipment, valve, and piping tags from P&ID PDF or DXF (CAD) files.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
python pid_parser.py path/to/file.pdf
# or for DXF
python pid_parser.py path/to/file.dxf --output tags.csv
```

The script prints a table of tags, their inferred category, and description (text on the same line). When the `--output` option
is used, results are written to a CSV file.

## Backend API

Start a web server that accepts file uploads and returns extracted tags as JSON:

```bash
uvicorn backend:app --reload
```

Then upload a file with any HTTP client:

```bash
curl -F "file=@path/to/file.pdf" http://localhost:8000/parse
```
