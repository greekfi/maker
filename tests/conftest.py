import os
import sys
from pathlib import Path

# factories.json normally resolves to ../market-maker/factories.json; pin it
# explicitly so tests don't depend on the repo layout.
_FIXTURE = Path(__file__).parent / "fixtures" / "factories.json"
os.environ.setdefault("FACTORIES_JSON", str(_FIXTURE))

sys.path.insert(0, str(Path(__file__).parent))
