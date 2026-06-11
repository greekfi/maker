"""Factory deployments per chain, loaded from factories.json.

The canonical copy lives in greekfi/protocol (market-maker/factories.json,
mirrored from core/abi/chains/*.ts); this repo vendors a snapshot at its
root. Keep it in sync when contracts redeploy, or point FACTORIES_JSON at
a protocol checkout.
"""

import json
import os
from dataclasses import dataclass
from pathlib import Path

_DEFAULT_FACTORIES = Path(__file__).resolve().parents[3] / "factories.json"


@dataclass(frozen=True)
class OptionDeployment:
    factory: str
    deployment_block: int


def _load() -> dict[int, OptionDeployment]:
    path = Path(os.environ.get("FACTORIES_JSON", _DEFAULT_FACTORIES))
    with path.open() as f:
        raw = json.load(f)
    return {
        int(chain_id): OptionDeployment(
            factory=entry["factory"],
            deployment_block=int(entry.get("deploymentBlock", 0)),
        )
        for chain_id, entry in raw.items()
    }


OPTIONS: dict[int, OptionDeployment] = _load()


def get_deployment_block(chain_id: int) -> int:
    deployment = OPTIONS.get(chain_id)
    return deployment.deployment_block if deployment else 0


def get_option_factory(chain_id: int) -> str:
    deployment = OPTIONS.get(chain_id)
    if deployment is None:
        msg = f"No options deployed on chain {chain_id}"
        raise KeyError(msg)
    return deployment.factory
