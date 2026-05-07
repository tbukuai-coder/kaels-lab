---
title: Claude Code Hackathon Winners 2026 — How a Lawyer, a Doctor, and a Musician Beat 13,000 Developers
description: Deep dive into Anthropic's "Built with Opus 4.6" Claude Code Hackathon winners — the projects, the tech stacks, and what it means for the future of software development.
---

Anthropic's "Built with Opus 4.6" Claude Code hackathon drew **13,000 applicants**. 500 were selected. 277 submitted projects. The winners? A personal injury lawyer, an interventional cardiologist, an electronic musician, a road technician from Uganda, and one professional software engineer.

This isn't a fluke. It's a signal about where software development is heading.

## The Results at a Glance

| Place | Project | Creator | Background | Prize |
|-------|---------|---------|------------|-------|
| 🥇 1st | CrossBeam | Mike Brown | Personal Injury Lawyer | $25,000 credits |
| 🥈 2nd | Elisa | Jon McBee | Software Engineer (25yr) | $10,000 credits |
| 🥉 3rd | postvisit.ai | Dr. Michal Nedoszytko | Interventional Cardiologist | $5,000 credits |
| 🎨 Creative | Conductr | Asep Bagja Priandana | Electronic Musician | $5,000 credits |
| 🏗️ Impact | Road Assessment | Kyeyune Kazibwe | Road Technician (Uganda) | Honorable mention |

## 🥇 CrossBeam: AI-Powered ADU Permit Review

**The problem:** California has issued 429,000+ Accessory Dwelling Unit permits since 2018. Over 90% come back with corrections — not engineering failures, but bureaucratic errors. Wrong code citations. Missing signatures. Local rules overriding state undocumented rules. The average 6-month permit delay costs homeowners **$30,000**.

**The solution:** Mike Brown, a lawyer with zero prior software shipping experience, built an AI agent that:

- Reads architectural plans via **vision AI**
- Parses city correction letters item by item
- Cross-references against California ADU law (Government Code §§ 66310-66342)
- Researches city-specific municipal codes via **live web search** across 480+ cities
- Generates professional response packages with proper code citations

**Result:** Permit corrections go from **weeks to 15 minutes**, costing ~$3 in API credits.

### CrossBeam Tech Stack

```
Browser (Next.js) 
  ↓ API + Supabase Realtime
Cloud Run (Orchestrator)
  ↓ launches isolated sandboxes  
Vercel Sandbox (Agent SDK + Opus 4.6 + Skills)
  ↓ reads/writes
Supabase (Database, Realtime, Storage)
```

**Key architecture decisions:**
- **Cloud Run** for the orchestrator — serverless functions timeout at 60-300s, but agent runs take 10-30 minutes
- **Vercel Sandbox** for isolated execution with filesystem access (needed for Agent SDK's `claude_code` preset)
- **13 custom skills** with 28 reference files covering CA ADU law
- **Decision tree router** loads only 3-5 relevant files per query (not all 28) — lot type → construction type → modifiers → process
- **Multi-agent:** rolling window of 3 concurrent subagents for plan page analysis
- **"Targeted viewing"** — read corrections first, then look at only relevant plan pages. Dropped processing from 35 min → 15 min

**Links:** [GitHub](https://github.com/mikeOnBreeze/cc-crossbeam) | [Live Demo](https://cc-crossbeam.vercel.app/)

## 🥈 Elisa: Visual Block IDE for Kids → Real Deployed Code

**The origin:** Jon McBee's 12-year-old daughter needed to program microcontrollers for a 7th-grade invention fair. Jon has 25 years of engineering experience and recently had his workflow transformed by Claude Code. He wanted his daughter to have the same power — but a terminal isn't designed for kids.

**The solution:** A block-based visual IDE where you snap spec blocks together and AI agents build real code:

- **7 visual primitives:** Goals, Requirements, Minions, Skills, Rules, Portals, Deployments
- Kids describe what they want by snapping blocks
- AI agents plan, code, test, and deploy in real time
- Full **ESP32 hardware integration** (sensor data → web dashboard)
- Teaches programming concepts as the agents work

**The numbers:**
- Built solo in **one week** with Claude Code
- **Zero lines of code written by hand**
- 40,000+ lines of generated code
- 1,500+ tests

**Key insight:** "Very soon, the primary artifacts that software creators carry will no longer be source code — they'll be well-defined specs and tests. Elisa makes that future accessible to the next generation."

**Links:** [GitHub](https://github.com/jonmcbee/elisa) | [Video Demo](https://www.youtube.com/watch?v=rsUaz_QAK6o)

## 🥉 postvisit.ai: AI Patient Follow-Up for Cardiac Care

**The problem:** Patients leave cardiology appointments confused about their diagnosis, medications, and next steps. Follow-up is inconsistent and physician visibility between appointments is minimal.

**The solution:** Dr. Michal Nedoszytko, a practicing interventional cardiologist from Poland, built a platform that:

- Explains diagnoses in **plain language**
- Analyzes visit notes and AI-scribe transcripts
- Surfaces relevant clinical evidence from scientific resources
- Provides full **EHR integration** with **HIPAA compliance**
- Covers both pre-visit and post-visit clinical workflows

**The story:** Built while coding in hospital hallways, between patients, and on planes. An MD + PhD who had never shipped production software before — placed 3rd out of 13,000 applicants.

**Links:** [postvisit.ai](https://postvisit.ai)

## 🎨 Conductr: AI Band That Plays With You in Real Time

**The inspiration:** Korg KARMA (Kay Algorithmic Realtime Music Architecture) generates musical patterns in real time — drum patterns, bass lines, melodic phrases — but configuring 400+ parameters per effect is nearly impossible for most musicians.

**The solution:** Asep Bagja Priandana, an electronic musician, built a browser-based MIDI instrument where you play chords on a controller and Claude Opus 4.6 conducts a generative band around you.

### Conductr Architecture

**Core engine (libgenseq):**
- 1,134 lines of **C**, 3.6KB memory, **zero runtime heap allocation**
- 4 generators: Drums (Euclidean rhythms), Bass (template-based + scale awareness), Melody (constrained random walk), Harmony (diatonic intervals)
- Compiled to **WebAssembly** for browser deployment
- Same C code can compile for ARM Cortex-M (microcontrollers) or wrap into a VST plugin

**Three-tier timescale design:**

| Timescale | Component | Responsibility |
|-----------|-----------|----------------|
| 15ms | C engine loop | Note generation — rock-solid, deterministic, never waits for AI |
| 4s | Performance analyzer | Extracts musical metrics (pitch range, velocity, note density, rhythm) |
| 8s | Claude Opus 4.6 | Returns arrangement decisions (change scale, shift energy, add swing) |

**Critical design principle:** The engine **never waits for the AI**. Opus operates as a conductor, not a performer — it shapes the next phrase, not the current one. When API is unavailable (slow network, rate limit), a rule-based director takes over. The music never stops.

**Key insight:** "Separate concerns by timescale. When you have components that run at very different speeds — a 15ms audio loop and an 8-second AI call — don't make the fast loop wait for the slow one."

**Links:** [GitHub](https://github.com/nanassound/conductr) | [Write-up](https://asepbagja.substack.com/p/i-won-anthropics-hackathon-by-building) | [Video](https://www.youtube.com/watch?v=X6CqJoyj0kI)

## What This Means

Three patterns emerge from these winners:

1. **Domain expertise is the moat.** The lawyer understood permit law. The cardiologist understood patient workflows. The musician understood real-time MIDI. Claude Code amplified knowledge they already had.

2. **Architecture matters more than code volume.** CrossBeam's decision tree router, Conductr's timescale separation, Elisa's spec-driven primitives — the wins came from smart system design, not raw output.

3. **The bottleneck is shifting.** From "can you write code?" to "can you define the problem clearly?" The winners excelled at structuring problems for agents to solve.

The hackathon proved what many suspected: we're entering an era where the ability to **think clearly about problems** matters more than the ability to type syntax. Claude Code didn't replace these builders — it made their domain expertise executable.

---

:::note[Disclaimer]
This article was generated with AI assistance. While the content has been reviewed for accuracy, it is based on publicly available sources and may contain approximations or educated inferences. Always refer to official documentation for authoritative information.
:::
