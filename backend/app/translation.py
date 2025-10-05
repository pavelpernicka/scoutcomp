"""Translation utilities for backend notification messages."""

from typing import Dict, Any, Optional


# Translation dictionary for supported languages
TRANSLATIONS = {
    "cs": {
        "completion_approved": "Tvé splnění '{task_name}' ({count}x) bylo schváleno. +{points} bodů.",
        "completion_rejected": "Tvé splnění '{task_name}' bylo zamítnuto. Důvod: {reason}",
        "admin_completion_approved": "Admin zaznamenal splnění '{task_name}' ({count}x). +{points} bodů.",
        "admin_completion_rejected": "Admin přidal splnění '{task_name}', ale označil ho jako zamítnuté. Důvod: {reason}",
        "no_reason_provided": "Nebyl uveden důvod.",
    },
    "en": {
        "completion_approved": "Your completion of '{task_name}' ({count}x) was approved. +{points} points.",
        "completion_rejected": "Your completion of '{task_name}' was rejected. Reason: {reason}",
        "admin_completion_approved": "An admin recorded a completion of '{task_name}' ({count}x). +{points} points.",
        "admin_completion_rejected": "An admin added a completion of '{task_name}' but marked it rejected. Reason: {reason}",
        "no_reason_provided": "No reason provided.",
    },
}

# Default language fallback
DEFAULT_LANGUAGE = "cs"


def translate_message(key: str, language: Optional[str] = None, **kwargs) -> str:
    """
    Translate a message key to the specified language with interpolation.

    Args:
        key: The translation key to look up
        language: The target language code (cs, en), defaults to DEFAULT_LANGUAGE
        **kwargs: Variables to interpolate into the translated string

    Returns:
        The translated message with interpolated variables
    """
    if language is None:
        language = DEFAULT_LANGUAGE

    # Fallback to default language if requested language not supported
    if language not in TRANSLATIONS:
        language = DEFAULT_LANGUAGE

    # Get the translation, fallback to key if not found
    translation = TRANSLATIONS.get(language, {}).get(key, key)

    # If translation not found in requested language, try default language
    if translation == key and language != DEFAULT_LANGUAGE:
        translation = TRANSLATIONS.get(DEFAULT_LANGUAGE, {}).get(key, key)

    try:
        # Format the translation with provided variables
        return translation.format(**kwargs)
    except (KeyError, ValueError):
        # If formatting fails, return the raw translation
        return translation


def get_completion_approval_message(task_name: str, count: int, points: float, language: Optional[str] = None) -> str:
    """Generate a completion approval notification message."""
    return translate_message(
        "completion_approved",
        language,
        task_name=task_name,
        count=count,
        points=f"{points:g}"
    )


def get_completion_rejection_message(task_name: str, reason: Optional[str], language: Optional[str] = None) -> str:
    """Generate a completion rejection notification message."""
    if not reason:
        reason = translate_message("no_reason_provided", language)

    return translate_message(
        "completion_rejected",
        language,
        task_name=task_name,
        reason=reason
    )


def get_admin_completion_approval_message(task_name: str, count: int, points: float, language: Optional[str] = None) -> str:
    """Generate an admin-created completion approval notification message."""
    return translate_message(
        "admin_completion_approved",
        language,
        task_name=task_name,
        count=count,
        points=f"{points:g}"
    )


def get_admin_completion_rejection_message(task_name: str, reason: Optional[str], language: Optional[str] = None) -> str:
    """Generate an admin-created completion rejection notification message."""
    if not reason:
        reason = translate_message("no_reason_provided", language)

    return translate_message(
        "admin_completion_rejected",
        language,
        task_name=task_name,
        reason=reason
    )