"""Unit tests for configuration, profile resolution, and validators."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from vajra.core.config import Profile, QdrantSettings, Settings


def test_default_profile_is_development() -> None:
    """Default settings profile is DEVELOPMENT, fail_closed is False."""
    settings = Settings()
    assert settings.profile == Profile.DEVELOPMENT
    assert settings.fail_closed is False


def test_airgap_profile_fails_closed() -> None:
    """AIRGAP profile activates fail_closed mode."""
    settings = Settings(profile=Profile.AIRGAP)
    assert settings.profile == Profile.AIRGAP
    assert settings.fail_closed is True


def test_qdrant_cloud_inference_forbid_validator() -> None:
    """Setting qdrant.cloud_inference to True must raise a ValidationError (silent egress path)."""
    with pytest.raises(ValidationError) as exc_info:
        QdrantSettings(cloud_inference=True)

    errors = exc_info.value.errors()
    assert any("cloud_inference" in str(e.get("loc")) for e in errors)
    assert any("silent egress path" in str(e.get("msg")) for e in errors)


def test_paths_resolution() -> None:
    """Resolved paths automatically populate uploads, artifacts, page_images."""
    settings = Settings()
    resolved = settings.paths.resolved()
    assert resolved.uploads_dir is not None
    assert resolved.artifacts_dir is not None
    assert resolved.page_images_dir is not None
    assert resolved.config_dir is not None
