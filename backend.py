from fastapi import FastAPI, File, UploadFile
from pathlib import Path
from tempfile import NamedTemporaryFile
import shutil
from pid_parser import extract

app = FastAPI()


@app.post("/parse")
async def parse_file(file: UploadFile = File(...)):
    """Parse an uploaded P&ID file and return extracted tags."""
    suffix = Path(file.filename).suffix
    with NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        temp_path = Path(tmp.name)
    try:
        rows = extract(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)
    return {"items": rows}
