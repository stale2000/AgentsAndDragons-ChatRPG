# Agents & Dragons — Design Doc and Feature List

## Overview
Agents & Dragons is an intelligent Agent-NPC for tabletop RPGs (e.g., D&D). It acts as a virtual player or companion NPC that speaks, listens, reasons over campaign context, and collaborates with human players and the DM in real time. The experience should feel like roleplaying with a consistent, in-character companion that remembers the world, follows table rules, and helps move the story forward.

## Goals
- Deliver an in-character, voice-first AI companion/NPC that is fun, cooperative, and rules-aware
- Maintain long-lived memory of party, world facts, and ongoing plots
- Support DM tools for control, safety, and pacing
- Provide reliable, low-latency interactions suitable for live sessions

## Non-Goals (initially)
- Full automation of an AI PC
- Photorealistic avatars or full VTT replacement
- Rules lawyering or strict sourcebook compliance beyond light rules heuristics

## Personas
- Player: wants an in-character ally who can strategize, banter, and help with tasks

## Core User Flows
- Session start: DM selects campaign context, character persona, and safety settings
- In-character conversation: player talks → STT → LLM agent → TTS response (streamed)
- Lore/notes retrieval: agent cites facts from campaign docs; can ask clarifying questions
- Combat helper: roll checks, track initiative, suggest tactics while deferring to DM
- Memory update: new world facts and relationships are captured for future sessions
- DM override: DM can pause, steer, approve, or redact agent outputs

## Feature List

### MVP (v0.1)
- Voice I/O: push-to-talk, streaming STT, low-latency TTS
- In-character dialogue: persona, tone, goals, and table etiquette
- Context grounding: RAG over uploaded campaign notes and session summaries
- Short- and long-term memory: party details, quests, NPC relationships
- Basic tools: dice rolling, initiative helper, rules lookups (heuristic)
- DM Console: approve/override, temperature/verbosity controls, safety filters
- Transcript + citations: store chat, audio, and source snippets

### V1 (v0.2)
- Multi-turn planning: propose plans, ask confirmations, reflect on outcomes
- Knowledge curation: automatic session summaries and memory consolidation
- Character sheet integration: stats, skills, inventory references
- Interruptions/Barge-in: handle interjections naturally during TTS
- Multi-device session: DM and players can view the same transcript/context

### Future (v0.3+)
- Multi-agent party members with distinct personas
- Scene framing and soundboard cues (music/ambience triggers)
- Visuals: image generation for locations/items (optional)
- Realtime presence via WebRTC and spatial audio (optional)

## System Design (mapped to this repo)
- Frontend (Next.js / Vercel AI SDK)
  - Pages under `app/` for chat, agents, retrieval, and structured output
  - Streaming UI with partial tokens and intermediate steps
  - Push-to-talk widget and TTS audio playback (extend existing chat components)
- Backend API Routes (Edge/serverless)
  - `app/api/chat/*` examples as references for chat, agents, and RAG
  - Extend with endpoints for STT/TTS, memory write/read, dice, and initiative
- Agent Orchestration
  - `langgraph` for tool-using agent workflows and state
  - Tools: web search, vector store retrieval, dice roller, initiative tracker
- Retrieval & Memory
  - Vector store (e.g., Supabase pgvector) for lore/notes; session memory store
  - Periodic summarization and consolidation jobs
- Speech
  - STT: Whisper / OpenAI Realtime STT
  - TTS: ElevenLabs / OpenAI TTS with streaming

## Tech Stack
- Next.js, TypeScript, Vercel AI SDK (streaming UI)
- LangChain.js + LangGraph.js (agent workflows)
- OpenAI (LLM, optional STT/TTS) and/or compatible providers
- Supabase (auth optional), Postgres + pgvector for RAG/memory
- Storage for transcripts/audio (e.g., Supabase storage or S3)

## Data Model (high-level)
- Session: id, campaignId, participants, settings
- Character: name, persona, voice, goals, secrets
- Memory: entity graph (NPCs, locations), facts, session summaries
- Transcript: turns, citations, tool calls, audio refs
- Documents: source text chunks with metadata for RAG

## Prompting & Policy
- System prompt establishes table etiquette, persona, constraints, and deference to DM
- Tool-use guardrails; require confirmations for impactful actions
- Safety filters for disallowed content; configurable tone boundaries

## Observability
- Structured logs for tool calls, latencies, and token usage
- Per-session analytics: interruptions, response time, DM overrides
- Redaction of PII and table-private notes

## Milestones
- v0.1 (MVP): voice I/O, in-character chat, basic RAG, dice/initiative, DM console
- v0.2: memory consolidation, character sheet refs, interruptions, multi-device view
- v0.3+: multi-agent support, ambience cues, visual aids, realtime presence

## Risks & Mitigations
- Latency: prefer streaming everywhere; cache persona/context; local TTS option
- Hallucinations: require citations; DM approval; retrieval-first prompting
- Safety: content filters; DM redaction tools; session-level policies
- Reliability: fallbacks for provider outages; degrade to text-only

## Open Questions
- How strict should rules compliance be vs. fun/improv?  VERY STRICT
- What UI patterns best support DM oversight without friction?


DOCS
This uses foundry api, to get and update the DND state.  The documentation is in the dndapidocs folder. 


curl -X GET https://foundryvtt-rest-api-relay.fly.dev/clients \
  -H "x-api-key: YOUR_API_KEY"


  Sceneid: "NUEDEFAULTSCENE0"