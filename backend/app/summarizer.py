"""Turns a meeting transcript into a structured MeetingSummary.

Two providers:
- "mock":   simple rules, works offline with no API key (good for development and tests)
- "claude": calls the Claude API and asks for JSON that matches our schema
"""

import re

import anthropic
from pydantic import ValidationError

from app.config import settings
from app.schemas import ActionItem, MeetingSummary

CLAUDE_MODEL = "claude-opus-5-5"

SYSTEM_PROMPT = """You summarize meeting transcripts for the people who attended the meeting.

Write for someone who missed the meeting and needs to catch up in under a minute:
- title: a short, specific title for the meeting (not "Meeting Summary").
- summary: 2-4 sentences covering the purpose of the meeting and the main outcome.
- key_points: the most important topics or facts discussed, one short sentence each.
- decisions: things the group actually agreed on. Leave the list empty if nothing was decided.
- action_items: concrete follow-up tasks. Set owner to the person responsible and due to the
  deadline exactly as said in the meeting (e.g. "Friday"); use null when the transcript doesn't say.

Only include information that is in the transcript. Do not invent names, dates, or decisions."""

# JSON Schema the model's answer must follow (structured outputs).
SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "key_points": {"type": "array", "items": {"type": "string"}},
        "decisions": {"type": "array", "items": {"type": "string"}},
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "owner": {"type": ["string", "null"]},
                    "due": {"type": ["string", "null"]},
                },
                "required": ["task", "owner", "due"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "summary", "key_points", "decisions", "action_items"],
    "additionalProperties": False,
}


class SummarizerError(Exception):
    """Raised when a summary could not be produced. The message is safe to show users."""


def summarize(transcript: str) -> MeetingSummary:
    if settings.summarizer_provider == "claude":
        return _summarize_with_claude(transcript)
    return _summarize_with_rules(transcript)


def _summarize_with_claude(transcript: str) -> MeetingSummary:
    # With api_key=None the SDK falls back to the ANTHROPIC_API_KEY environment variable.
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key or None)
    try:
        response = client.beta.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": f"<transcript>\n{transcript}\n</transcript>"}
            ],
            output_config={
                "effort": "medium",
                "format": {"type": "json_schema", "schema": SUMMARY_SCHEMA},
            },
            # If the main model declines a request, the API retries it on a fallback model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        raise SummarizerError("The AI service rejected the API key. Check ANTHROPIC_API_KEY.")
    except anthropic.RateLimitError:
        raise SummarizerError("The AI service is busy right now. Please try again in a minute.")
    except anthropic.APIStatusError as e:
        raise SummarizerError(f"The AI service returned an error ({e.status_code}).")
    except anthropic.APIConnectionError:
        raise SummarizerError("Could not reach the AI service. Check your internet connection.")

    if response.stop_reason == "refusal":
        raise SummarizerError("The AI could not summarize this transcript.")
    if response.stop_reason == "max_tokens":
        raise SummarizerError("The summary was too long and got cut off. Try a shorter transcript.")

    text = next((block.text for block in response.content if block.type == "text"), None)
    if text is None:
        raise SummarizerError("The AI returned an empty response.")
    try:
        return MeetingSummary.model_validate_json(text)
    except ValidationError:
        raise SummarizerError("The AI returned a summary in an unexpected format.")


# ---------- Offline rule-based summarizer ----------

ACTION_WORDS = re.compile(r"\b(will|todo|to-do|action item|follow up|needs to|should)\b", re.I)
DECISION_WORDS = re.compile(r"\b(decided|agreed|approved|final decision|we'll go with)\b", re.I)
SPEAKER = re.compile(r"^\s*([A-Z][\w .'-]{0,40}):\s*(.+)$")


def _summarize_with_rules(transcript: str) -> MeetingSummary:
    lines = [line.strip() for line in transcript.splitlines() if line.strip()]

    # Split "Priya: some text" into (speaker, text).
    parsed = []
    for line in lines:
        match = SPEAKER.match(line)
        parsed.append((match.group(1), match.group(2)) if match else (None, line))

    spoken_text = " ".join(text for _, text in parsed)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", spoken_text) if s.strip()]

    key_points, decisions, action_items = [], [], []
    for speaker, text in parsed:
        if DECISION_WORDS.search(text):
            decisions.append(text)
        elif ACTION_WORDS.search(text):
            action_items.append(ActionItem(task=text, owner=speaker))
        elif len(key_points) < 5 and len(text.split()) >= 6:
            key_points.append(text)

    first_words = " ".join(sentences[0].split()[:8]) if sentences else "Meeting"
    return MeetingSummary(
        title=first_words.rstrip(".,!?"),
        summary=" ".join(sentences[:2]) or transcript[:300],
        key_points=key_points,
        decisions=decisions,
        action_items=action_items,
    )
