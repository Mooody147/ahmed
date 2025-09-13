import argparse
import csv
import re
from pathlib import Path
from typing import Iterable, List, Dict

import pdfplumber
import ezdxf

TAG_PATTERN = re.compile(r"(?P<tag>[A-Z]{1,5}[- ]?\d+[A-Z]*)")


def extract_from_pdf(path: Path) -> List[Dict[str, str]]:
    """Extract tag information from a PDF file."""
    results = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for line in text.splitlines():
                match = TAG_PATTERN.search(line)
                if match:
                    tag = match.group("tag").replace(" ", "")
                    description = line.replace(match.group("tag"), "").strip()
                    results.append({"tag": tag, "description": description})
    return results


def extract_from_dxf(path: Path) -> List[Dict[str, str]]:
    """Extract tag information from a DXF (CAD) file."""
    results = []
    doc = ezdxf.readfile(str(path))
    for entity in doc.modelspace():
        if entity.dxftype() in {"TEXT", "MTEXT"}:
            text = entity.plain_text() if entity.dxftype() == "MTEXT" else entity.text
            match = TAG_PATTERN.search(text)
            if match:
                tag = match.group("tag").replace(" ", "")
                description = text.replace(match.group("tag"), "").strip()
                results.append({"tag": tag, "description": description})
    return results


CATEGORY_RULES = {
    "equipment": re.compile(r"^E"),
    "valve": re.compile(r"^V"),
    "piping": re.compile(r"^P"),
}


def categorize(tag: str) -> str:
    for category, pattern in CATEGORY_RULES.items():
        if pattern.match(tag):
            return category
    return "unknown"


def extract(path: Path) -> List[Dict[str, str]]:
    if path.suffix.lower() == ".pdf":
        entries = extract_from_pdf(path)
    elif path.suffix.lower() in {".dxf"}:
        entries = extract_from_dxf(path)
    else:
        raise ValueError(f"Unsupported file type: {path.suffix}")
    for entry in entries:
        entry["category"] = categorize(entry["tag"])
    return entries


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract tags from P&ID files.")
    parser.add_argument("input", type=Path, help="Path to PDF or DXF file")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional CSV output file; prints table if omitted",
    )
    args = parser.parse_args()

    rows = extract(args.input)
    if args.output:
        with args.output.open("w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=["tag", "category", "description"])
            writer.writeheader()
            writer.writerows(rows)
    else:
        for row in rows:
            print(f"{row['tag']}, {row['category']}, {row['description']}")
