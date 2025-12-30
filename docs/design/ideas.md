# Operant Design Brief

> **Project:** Operant
>
> **Version:** Initial Design Direction
>
> **Status:** Approved
>
> **Purpose:** Establish the visual language, interaction philosophy, branding, and overall design system for Operant. This document serves as the single source of truth for all future UI/UX decisions.

---

# Design Direction

## Direction Hypotheses

### 1. Quiet Operations Ledger *(Selected)*
A calm, editorial workspace that makes evidence, obligations, and unknowns legible before presenting recommendations.

**Probability:** 0.08

---

### 2. Nightshift Control Room

A dark, instrument-inspired mission console emphasizing event streams, monitoring, and intervention states.

**Probability:** 0.06

---

### 3. Field Notebook

A tactile, warm workspace inspired by annotated notebooks, durable records, and paper-based operational systems.

**Probability:** 0.07

---

# Selected Direction

## Quiet Operations Ledger

Operant adopts the **Quiet Operations Ledger** design language.

The interface should resemble a trustworthy operational workspace rather than a generic analytics dashboard or an exaggerated "AI" product. Users should feel they are reviewing evidence, making informed decisions, and maintaining operational awareness.

---

# Design Movement

Contemporary institutional software with the restraint of a well-crafted ledger and the clarity of a modern editorial interface.

The product should feel:

- Professional
- Calm
- Evidence-driven
- Trustworthy
- Dense with useful information
- Free of unnecessary visual noise

Avoid interfaces that resemble:

- AI marketing websites
- Cryptocurrency dashboards
- Gaming interfaces
- Highly animated admin templates

---

# Core Design Principles

## Evidence Before Interpretation

Every important claim should visibly expose:

- Source
- Observation time
- Freshness
- Confidence
- Uncertainty

Evidence always precedes conclusions.

---

## One Operational Picture

Entities, obligations, evidence, relationships, events, and actions should appear as parts of one operational model rather than disconnected modules.

---

## Calm, Not Passive

The interface should remain visually restrained while still communicating:

- Status
- Responsibility
- Required actions
- Operational urgency

---

## Visible Control

Users must clearly distinguish between:

- Observation
- Proposal
- Authorization
- Execution
- Confirmation

Nothing should appear automatically completed.

---

## Useful Information Density

Display sufficient context for informed decision-making while preserving:

- White space
- Readability
- Clear hierarchy

Avoid both clutter and excessive emptiness.

---

# Color Philosophy

## Primary Palette

| Purpose | Color |
|----------|--------|
| Background | Warm Paper (#F5F3EC) |
| Secondary Surface | Pale Stone (#E8E6DC) |
| Primary Text | Ink (#202923) |
| Brand | Deep Evergreen (#153C36) |

---

## Status Colors

| Meaning | Color |
|----------|--------|
| Verified / Connected | Sage (#AFC7B7) |
| Pending Review / Attention | Ochre (#B77D3D) |
| Failure / Destructive | Muted Terracotta (#B75F4C) |

---

## Color Guidelines

- Prefer muted institutional colors.
- Never decorate with saturated analytics colors.
- Never rely solely on color to communicate meaning.
- Pair every status color with text and iconography.

---

# Layout Paradigm

The workspace centers around an editorial operating surface.

## Desktop

- Persistent evergreen navigation rail
- Compact utility/header bar
- Large content workspace
- Grid-aligned layouts
- Wide reading column

---

## Overview Page

Primary sections include:

- Attention Queue
- Operational Summary
- Recent Activity Timeline
- Important Operational Metrics

---

## Detail Pages

Prioritize:

1. Current operational state
2. Supporting evidence
3. Historical timeline
4. Related entities
5. Relationships
6. Actions

---

## Mobile

- Navigation collapses into a top bar
- Cards stack vertically
- Highest-priority decisions appear first

---

# Signature UI Elements

## Evidence Line

Every important fact includes:

- Source
- Observation timestamp
- Freshness
- Conflict indicator

Displayed immediately beneath the fact.

---

## Decision Trail

A linear operational path:

Evidence

↓

Rule

↓

Authorization

↓

Outcome

Never display hidden reasoning or AI chain-of-thought.

---

## State Chips

Every operational state is represented using labelled chips.

Supported states include:

- Observed
- Stale
- Uncertain
- Conflicting
- Proposed
- Awaiting Approval
- Unknown
- Confirmed

---

## Operational Symbol

A small linked-node icon representing relationships grounded in evidence.

---

# Interaction Philosophy

Interactions should feel intentional.

## Record Entry

- Immediate validation
- Recoverable errors
- Clear confirmation

---

## Approvals

Approving or rejecting actions should:

- Name the responsible user
- Explain the consequence
- Never imply external execution

---

## Corrections

Corrections never overwrite history.

Instead they:

- Append a new version
- Preserve prior evidence
- Clearly explain what changed

---

## Empty States

Empty workspaces should:

- Explain available manual input methods
- Offer an optional illustrative sample workspace
- Never silently insert demo content

---

# Animation

Animation exists only to support comprehension.

Allowed:

- Short fade transitions
- Small position shifts
- Status updates
- Skeleton loading
- Inline loading indicators

Avoid:

- Decorative motion
- Pulsing AI effects
- Fake live dashboards
- Animated charts without real updates

Respect reduced-motion preferences.

---

# Typography

Primary typography uses the scaffold's bundled sans-serif stack.

Optional:

- Editorial serif for large page titles

Requirements:

- High readability
- Strong hierarchy
- Tabular figures for numeric data
- Avoid tiny uppercase labels

---

# Brand Essence

**Operational clarity with accountable action.**

---

# Brand Voice

The interface should be:

- Calm
- Honest
- Direct
- Specific
- Transparent about uncertainty

Prefer statements such as:

- "No source is connected."
- "This observation is 18 days old."
- "Approval is still required."

Avoid vague claims such as:

- "Everything is handled."
- "AI determined this is safe."

Always distinguish between:

- Propose
- Authorize
- Submit
- Verify
- Confirm

---

# Wordmark

The Operant wordmark uses a sturdy, modern sans-serif typeface emphasizing clarity and stability.

---

# Logo

The Operant logo consists of:

- Three or four broad connected nodes
- Thick connecting paths
- Central evidence/model node
- Flat evergreen background
- Pale sage / ivory geometry
- One restrained ochre accent node

Avoid:

- Text inside the icon
- Gradients
- Glow
- Shadows
- Texture
- Bevels
- 3D styling
- Decorative effects

---

# Signature Brand Colors

| Role | Hex |
|------|------|
| Deep Evergreen | **#153C36** |
| Warm Paper | **#F5F3EC** |
| Pale Stone | **#E8E6DC** |
| Ink | **#202923** |
| Sage | **#AFC7B7** |
| Ochre | **#B77D3D** |
| Muted Terracotta | **#B75F4C** |

---

# Design Goals

The Operant interface should consistently communicate:

- Evidence before opinion
- Operational clarity
- Responsible decision-making
- Transparent uncertainty
- Trustworthy workflows
- Calm professionalism
- Long-term maintainability

Every future design decision should reinforce these principles.