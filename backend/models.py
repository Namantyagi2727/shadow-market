"""Single source of truth for model IDs. Verified with models.list on 2026-11-21.

Import from here; never type a model name anywhere else.
"""

MODEL_IDS = {
    # Gemini 4 reasoning models (1M context). Use thinking_level, not budgets/temperature.
    "pitch_extract": "gemini-4-hydrogen",     # webcam clip -> Pitch JSON
    "persona_driver": "gemini-4-hydrogen",    # picks browser actions for persona agents
    "quit_analyzer": "gemini-4-hydrogen",     # agentic video review of recordings
    "strategist": "gemini-4-neon",            # boardroom strategist, persona generator
    "skeptic": "gemini-4-argon",              # hostile boardroom skeptic
    "verdict": "gemini-4-carbon",             # final calibrated launch verdict
    # Decisions API (v1beta client)
    "decisions": "gemini-decision-1",
    # Managed agent (v1beta client)
    "builder_agent": "antigravity-preview-09-2026",
    # Media
    "live_voice": "gemini-3.8-live",          # hot-seat interview (bidi WebSocket)
    "tts": "gemini-3.8-flash-tts",
    "hero_image": "gemini-nano-banana-2.1",
    # Live Q&A room
    "room_transcribe": "gemini-3.5-transcribe-live",  # streaming room captions (v1beta, no diarization)
    "room_twin": "gemini-4-hydrogen",          # server-side fallback twin challenge
    "room_founder": "gemini-3.5-flash-lite",   # founder answer card: speed-critical (1.7 s vs 8.2 s on Hydrogen for a 75-word answer)
    "video_ad": "gemini-omni-1.2-flash",
}
