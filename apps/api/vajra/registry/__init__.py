"""Model registry: what models exist, what they claim, and what was measured.

Section E, layer 2. Capabilities are declarative data here; the router reads
them and never reads a model name.
"""

from vajra.registry.capabilities import Capability, VerificationState
from vajra.registry.models import (
    BenchmarkResult,
    ModelRead,
    ModelRegistration,
    ModelUpdate,
    ProbeReport,
    ResidencyReport,
    RuntimeRead,
    RuntimeRegistration,
)
from vajra.registry.profiles import (
    HardwareConfig,
    HardwareProfileConfig,
    ProfileModelConfig,
    SyncResult,
    load_profile,
    sync_model_registry,
)
from vajra.registry.residency import ResidencyService, plan_eviction
from vajra.registry.runtimes import RuntimeManager
from vajra.registry.service import ModelRegistry

__all__ = [
    "BenchmarkResult",
    "Capability",
    "HardwareConfig",
    "HardwareProfileConfig",
    "ModelRead",
    "ModelRegistration",
    "ModelRegistry",
    "ModelUpdate",
    "ProbeReport",
    "ProfileModelConfig",
    "ResidencyReport",
    "ResidencyService",
    "RuntimeManager",
    "RuntimeRead",
    "RuntimeRegistration",
    "SyncResult",
    "VerificationState",
    "load_profile",
    "plan_eviction",
    "sync_model_registry",
]
