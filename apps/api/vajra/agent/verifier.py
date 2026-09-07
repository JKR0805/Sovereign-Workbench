"""The verification gate (Section G, "Citations and grounding").

Every factual assertion must carry a ``[C{n}]`` marker referencing a supplied
chunk. The verifier parses those markers and checks two things:

1. the cited chunk id was actually retrieved for this step;
2. the claim's key noun phrases have lexical overlap with the chunk text.

Check 1 is implemented here: it is exact, cheap, and catches the failure mode
that matters most (a model inventing a citation index). Check 2 is
:class:`LexicalOverlapVerifier` and is **not implemented**, because doing it
properly needs the chunk text plumbed through from retrieval, which arrives with
the RAG subsystem.

Failing claims are reported, not dropped. Downgrading an unverifiable claim to an
explicit "unsupported" list is the behaviour the plan asks for.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Protocol

from vajra.agent.models import VerificationResult
from vajra.core.exceptions import NotImplementedYet

#: Matches the citation markers the generation prompt requires.
CITATION_PATTERN = re.compile(r"\[C(\d+)\]")

#: A sentence is treated as a factual claim if it is at least this long. Shorter
#: fragments are headings and connectives and are not assertions.
MIN_CLAIM_CHARS = 25

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def extract_citations(text: str) -> list[int]:
    """Citation indices in order of appearance, deduplicated."""
    seen: list[int] = []
    for match in CITATION_PATTERN.finditer(text):
        index = int(match.group(1))
        if index not in seen:
            seen.append(index)
    return seen


def split_claims(text: str) -> list[str]:
    """Split generated prose into candidate factual claims."""
    return [
        sentence.strip()
        for sentence in SENTENCE_SPLIT.split(text)
        if len(sentence.strip()) >= MIN_CLAIM_CHARS
    ]


class CitationVerifier(Protocol):
    name: str

    def verify(self, output: str, retrieved_chunk_ids: Sequence[str]) -> VerificationResult: ...


class CitationIndexVerifier:
    """Checks that every cited index refers to a chunk actually retrieved.

    Implemented and exact. Citations are 1-based, matching the ``[C1]`` markers
    the prompt asks the model to emit against the supplied chunk list.
    """

    name = "citation_index"

    def verify(self, output: str, retrieved_chunk_ids: Sequence[str]) -> VerificationResult:
        claims = split_claims(output)
        available = len(retrieved_chunk_ids)

        unknown: list[str] = []
        unsupported: list[str] = []
        verified = 0

        for claim in claims:
            citations = extract_citations(claim)
            if not citations:
                unsupported.append(claim)
                continue
            bad = [index for index in citations if index < 1 or index > available]
            if bad:
                unknown.extend(f"C{index}" for index in bad)
                unsupported.append(claim)
                continue
            verified += 1

        passed = not unsupported and not unknown
        detail = (
            "all claims cite a retrieved chunk"
            if passed
            else f"{len(unsupported)} of {len(claims)} claims are unsupported"
        )
        return VerificationResult(
            passed=passed,
            checked_claims=len(claims),
            verified_claims=verified,
            unsupported_claims=unsupported,
            unknown_citations=sorted(set(unknown)),
            detail=detail,
        )


class LexicalOverlapVerifier:
    """Span-level check that a claim's noun phrases appear in the cited chunk.

    Not implemented. It needs the retrieved chunk *text*, which the RAG subsystem
    supplies. Returning "passed" without performing the overlap check would be
    exactly the false assurance the verification gate exists to prevent.
    """

    name = "lexical_overlap"

    def verify(self, output: str, retrieved_chunk_ids: Sequence[str]) -> VerificationResult:
        raise NotImplementedYet(
            "Span-level citation verification is not implemented. It requires chunk text "
            "from the retrieval step; use CitationIndexVerifier until RAG is wired in.",
            retrieved_chunks=len(retrieved_chunk_ids),
        )
