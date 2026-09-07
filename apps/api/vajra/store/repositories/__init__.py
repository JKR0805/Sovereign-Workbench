"""Repositories.

Deliberately plain: a repository is a class holding an ``AsyncSession`` with
typed query methods. There is no unit-of-work framework, no generic CRUD
metaclass and no identity map. Section U favours module boundaries over
machinery.
"""

from vajra.store.repositories.events import EventRepository
from vajra.store.repositories.knowledge import KnowledgeRepository
from vajra.store.repositories.policies import RoutingPolicyRepository
from vajra.store.repositories.registry import RegistryRepository
from vajra.store.repositories.runs import RunRepository
from vajra.store.repositories.sovereignty import SovereigntyRepository

__all__ = [
    "EventRepository",
    "KnowledgeRepository",
    "RegistryRepository",
    "RoutingPolicyRepository",
    "RunRepository",
    "SovereigntyRepository",
]
