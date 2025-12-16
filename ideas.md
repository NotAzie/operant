# Operant design brief

## Direction hypotheses

- **Quiet operations ledger** — A calm, editorial workspace that makes evidence, obligations, and unknowns legible before it makes recommendations. Probability: **0.08**.
- **Nightshift control room** — A dark, instrument-like mission console that foregrounds event streams and intervention states. Probability: **0.06**.
- **Field notebook** — A tactile, warm workspace inspired by annotated records and durable paper systems. Probability: **0.07**.

## Chosen direction: Quiet operations ledger

### Design movement
Contemporary institutional software with the restraint of a well-made ledger and the clarity of a modern editorial interface. It should feel credible to an operator reviewing evidence, not like a generic analytics dashboard or an AI theater.

### Core principles
1. **Evidence before interpretation:** show source, time, freshness, and uncertainty near the claim they support.
2. **One operational picture:** entities, obligations, events, and actions are connected through the same workspace model.
3. **Calm does not mean vague:** status, approval responsibility, and next steps remain explicit.
4. **Control stays visible:** proposals, permissions, and outcomes are distinguishable from completed facts.
5. **Useful density:** present enough context for judgment while preserving breathing room and readable hierarchy.

### Color philosophy
Use a warm paper-white / pale stone canvas, deep ink typography, and a dark evergreen brand color. Muted sage and teal indicate connected or verified states; ochre highlights attention and pending review; terracotta is reserved for failure or destructive warnings. Avoid saturated chart colors as decoration. Status colors always pair with text and iconography so meaning does not depend on color alone.

### Layout paradigm
A compact evergreen navigation rail anchors the workspace. The main column is a wide editorial work surface with a small utility/header band and clear page title. Overview uses asymmetrical but grid-aligned cards: a primary attention queue, concise operational counts, and a chronological change stream. Detail pages privilege evidence and history alongside the current state. Mobile layouts collapse navigation to a top bar and stack cards in decision order.

### Signature elements
- The **evidence line**: concise source, observed time, and freshness/conflict badge displayed directly beneath important facts.
- The **decision trail**: a simple ordered strip from evidence to rule to authorization to outcome, never a hidden reasoning transcript.
- **State chips** with text labels for observed, stale, uncertain, conflicting, proposed, awaiting approval, unknown, and confirmed.
- A small linked-node mark, representing an operational model as relationships grounded in evidence.

### Interaction philosophy
Mutations are deliberate and clearly labelled. Routine record entry gives immediate feedback with recoverable errors. Approving or rejecting an action is a considered step that names the actor and consequence. Status changes never imply external execution. Corrections append a new version and explain what was superseded. Empty states teach the available real input path and offer a clearly optional illustrative sample; no sample is silently inserted.

### Animation
Minimal and functional: brief opacity/position transitions for panel entry and status changes; no ambient motion, pulsing "AI" indicators, or animated data suggesting live synchronization. Respect reduced-motion preferences. Loading uses compact, quiet skeletons or inline spinners.

### Typography system
Use the scaffold's bundled sans-serif stack for clear interface text, with restrained serif or high-contrast editorial display only for large page headings if the installed font stack supports it cleanly. Numeric values use tabular figures. Labels remain readable and never rely on tiny uppercase text for hierarchy.

### Brand essence and voice
**Essence:** operational clarity with accountable action.

**Voice:** composed, direct, specific, and candid about uncertainty. Say “No source is connected,” “This observation is 18 days old,” or “Approval is still required,” not “Everything is handled” or “AI says this is safe.” Use verbs that distinguish propose, authorize, submit, verify, and confirm.

### Wordmark and logo
The wordmark is **Operant** in a clear, sturdy sans-serif. The symbol is a simple linked-node structure: three to four broad filled nodes joined by a small number of thick connectors around a central evidence/model node. Use a flat evergreen background with pale sage/ivory geometry and one restrained ochre node. No lettering inside the icon, no gradient, glow, texture, shadow, bevel, 3D styling, or baked canvas mask.

### Signature brand color
Deep evergreen **#153C36**. Supporting palette: warm paper **#F5F3EC**, pale stone **#E8E6DC**, ink **#202923**, sage **#AFC7B7**, ochre **#B77D3D**, and muted terracotta **#B75F4C**.
