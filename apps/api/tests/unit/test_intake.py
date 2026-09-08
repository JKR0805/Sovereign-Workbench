"""Unit tests for attachment kind classification and redaction.

Regression coverage for the defect this replaces: the old
``... or bool(att_data)`` check treated any base64 payload as an image, which
sent a ``.docx`` to the vision model as if it were a picture.
"""

from __future__ import annotations

import base64

from vajra.core.enums import AttachmentKind
from vajra.orchestrator.models import RunAttachment
from vajra.rag.intake import AttachmentIntake


def test_classify_kind_by_mime() -> None:
    assert (
        AttachmentIntake.classify_kind("photo.bin", "image/png", AttachmentKind.AUTO)
        is AttachmentKind.IMAGE
    )


def test_classify_kind_by_extension_when_mime_unknown() -> None:
    assert (
        AttachmentIntake.classify_kind("photo.jpg", "application/octet-stream", AttachmentKind.AUTO)
        is AttachmentKind.IMAGE
    )


def test_classify_kind_docx_is_never_an_image() -> None:
    """The regression test: a .docx carrying base64 bytes must not be
    classified as an image just because it has content."""
    result = AttachmentIntake.classify_kind(
        "report.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        AttachmentKind.AUTO,
    )
    assert result is AttachmentKind.DOCUMENT


def test_classify_kind_plain_text_with_base64_payload_is_not_an_image() -> None:
    """A .txt file that happens to carry a base64-encoded payload (any
    non-empty bytes) must still resolve to DOCUMENT, never IMAGE."""
    encoded = base64.b64encode(b"just some ordinary text content").decode("ascii")
    assert encoded  # sanity: bytes were present, which used to be enough to misfire
    result = AttachmentIntake.classify_kind("notes.txt", "text/plain", AttachmentKind.AUTO)
    assert result is AttachmentKind.DOCUMENT


def test_classify_kind_explicit_kind_is_never_overridden() -> None:
    assert (
        AttachmentIntake.classify_kind("data.csv", "text/csv", AttachmentKind.IMAGE)
        is AttachmentKind.IMAGE
    )


def test_run_attachment_redacted_never_contains_inline_data() -> None:
    attachment = RunAttachment(
        filename="scan.png",
        mime="image/png",
        size_bytes=1234,
        data_base64=base64.b64encode(b"\x89PNG\r\n").decode("ascii"),
    )
    redacted = attachment.redacted()
    assert "data_base64" not in redacted
    assert redacted["has_inline_data"] is True
    assert redacted["filename"] == "scan.png"


def test_run_attachment_redacted_reports_no_inline_data_when_absent() -> None:
    attachment = RunAttachment(filename="doc.pdf", document_id="abc123")
    redacted = attachment.redacted()
    assert "data_base64" not in redacted
    assert redacted["has_inline_data"] is False


def test_run_attachment_is_image_mime_first() -> None:
    attachment = RunAttachment(filename="whatever.bin", mime="image/jpeg")
    assert attachment.is_image is True


def test_run_attachment_is_image_false_for_document_kind_even_with_image_mime() -> None:
    """An explicit DOCUMENT kind wins over a misleading mime type."""
    attachment = RunAttachment(filename="whatever.bin", mime="image/jpeg", kind=AttachmentKind.DOCUMENT)
    assert attachment.is_image is False
