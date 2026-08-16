"""Tests for the direct .env configuration (no pydantic-settings)."""


def test_settings_loaded_from_env():
    from app.core.config import settings

    assert settings.DATABASE_URL.endswith("proctor_test")
    assert settings.JWT_SECRET == "pytest-secret-key"
    assert settings.JWT_ALGORITHM == "HS256"
    assert settings.DEBUG is True
    assert settings.JWT_ACCESS_EXPIRE_MINUTES == 30
    assert settings.MODEL_PATH == "best.pt"


def test_settings_are_frozen_dataclass_not_pydantic():
    from app.core.config import settings
    from dataclasses import is_dataclass

    assert is_dataclass(settings)
    # Immutable settings must not be assignable.
    try:
        settings.DATABASE_URL = "nope"
        raised = False
    except (AttributeError, Exception):
        raised = True
    assert raised