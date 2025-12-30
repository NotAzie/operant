# Design direction and visual assets

This page owns the design workflow and `ideas.md`: read it before designing a new project
or changing an existing design direction. Keep an accepted direction and reuse existing
design/Blueprint material instead of creating a competing plan. A small edit within an existing
direction does not require inventing another design exercise.

When implementation begins after any required plan approval, before application code, write a design brief to `ideas.md` in
the project root (it is committed with your checkpoints and survives rollbacks). Write it in the
same language as the user's request.

1. Determine the design direction — exactly one of these sources, in priority order:
   - **The user chose a direction.** After init the platform may show the user a set of design
     directions (a blueprint card, or a plan the user approves); the confirmed choice arrives in
     the conversation. Treat it as final: do NOT brainstorm alternatives and do NOT second-guess
     it. "Inspire Me" (formerly "Choose for me") is not a chosen direction; continue with the
     sources below rather than selecting from the Blueprint candidates.
   - **The user gave explicit style guidance** (colors, themes, aesthetics, a visual direction):
     that guidance is the direction; record it faithfully.
   - **Neither happened**: brainstorm **three distinct** stylistic directions in `ideas.md`. For
     each, record only: Theme Name, a very brief intro, and a numeric probability under 0.10 —
     sample from the tails of the distribution, not the safe middle. Then commit to ONE.
2. Expand the chosen direction fully in `ideas.md` across the design dimensions — design
   movement, core principles, color philosophy, layout paradigm, signature elements,
   interaction philosophy, animation, typography system, brand essence, brand voice,
   wordmark/logo, signature brand color. (No downstream parser reads this structure — it
   exists to keep your own later edits consistent.)
3. For clone/replica requests, record the reference as the ground-truth spec in `ideas.md` and
   match it; if the platform still shows a direction card, answer it consistently with the
   reference instead of inventing a new direction.

## Web branding delivery requirement

For every newly initialized Web project, create a distinct project-specific logo before the
first checkpoint containing application work, even when branding was not requested separately.
This includes dashboards, internal tools, and other sites that need no custom imagery below.
Reuse a supplied brand identity when available. Do not require a particular image provider/tool
or spend paid resources solely to satisfy this requirement. Use the same identity in the site's
branding and favicon; a platform Logo URL does not install a favicon in the website.

Register the logo using [project-logo metadata](#project-logo-metadata) below. Preserve existing
branding on attached projects unless the user's request changes it. Mobile and Game retain their
own branding requirements in [Mobile](mobile.md) and [Game sharing](game-sharing.md).

### Web logo artwork

For a new logo, use one product-specific visual metaphor, two or three broad filled shapes,
a strong silhouette, and intentional negative space. Default to flat solid brand colors and
minimal geometry; follow supplied brand/style guidance. Avoid tiny details, text, gradients,
textures, glow, shadows, bevels, 3D effects, and mockups unless explicitly requested.

For the project icon, request **an opaque, unmasked 1:1 square PNG with a full-bleed background
reaching all four edges and corners**. Do not bake in rounded canvas corners, a circular crop,
or a surrounding circle/rounded-square badge or inset tile. The display surface applies its
own corner mask. Curves within the symbol are fine; the restriction is on the outer container.
Center the symbol with comfortable clearance; that clearance must retain the background color,
not transparent or contrasting outer padding. A standalone foreground mark for the header may
use transparency; keep it separate from the full-square project icon.

For asynchronous generation, use the reserved URLs and keep building as described below.
After the completion result arrives, inspect the logo at full size and at 24–48 px before the
first checkpoint containing it: the silhouette and negative space must remain clear, and all
four canvas corners must contain the background. If a completed image has a baked-in mask,
unintended text, or artifacts, correct or regenerate that image, inspect the replacement, and
update affected header, favicon, and `logoUrl` references before checkpointing.

## Project-logo metadata

Web and Mobile use the same optional platform branding synchronization for Dashboard, Preview,
and checkpoint cards. This does not replace a website favicon or an icon embedded in a native build.

Upload the logo with `manus-upload-file <logo-file>` without `--webdev` unless its asset workflow
already supplied a durable HTTPS URL. Before checkpointing, set that URL as a quoted `logoUrl`
literal in project-root `app.config.ts`. Preserve an existing file; if absent, create a minimal
`export default { logoUrl: "<actual uploaded HTTPS URL>" }` with the real returned URL. This file
is a branding metadata input, not an Expo or framework requirement; do not import it into the
application just for synchronization. Never invent a URL or leave the example placeholder.

The checkpoint hook reads this literal from the accepted Git commit, not the working copy, and
does not evaluate TypeScript or computed expressions. The URL must be HTTPS, without URL
username/password or surrounding whitespace, and at most 2056 characters; the config file must
not exceed 1 MiB. Neither a relative `/manus-storage/...` path nor a temporary signed download
URL is a durable project Logo URL. See [storage](storage.md) for the upload lifecycle.

Logo metadata synchronization is best-effort and does not reject an otherwise valid checkpoint;
that does not waive the Agent's branding delivery requirement. Missing or invalid metadata leaves
the existing platform logo unchanged.

## Generate the core visual assets up front

For a newly initialized project (not an attached existing project), first decide whether custom
imagery is materially part of the requested experience. Marketing, editorial, and consumer-facing
surfaces often qualify even when the user did not explicitly request image files. Functional
acceptance or test harnesses, internal/admin/diagnostic utilities, and data/control dashboards do
not qualify unless the user explicitly asks for visual assets. Do not generate images merely
because the project is new; when it does not qualify, skip additional image search and image
generation beyond the required project branding above.

When the project qualifies, immediately after finishing `ideas.md` and before writing application
code, discover and call the registered built-in `generate_image` tool. Generate only images that
already have a concrete planned placement. If the user requested an exact count, generate exactly
that count; otherwise use the smallest useful set—one hero image is often enough. Batch several
images only when the plan has several distinct placements. Unused generation wastes time and
credits. This is the Agent's build-time media tool; do not call the application's runtime
ImageService API to create these assets.

- Use generated images for the visually prominent, design-specific parts of the product: the
  hero, banner, key editorial illustration, and other signature moments. Include a bold brand
  symbol or icon when the project needs one; for Web branding, follow
  [Web logo artwork](#web-logo-artwork) and reuse the identity for the header and favicon.
- Tailor every prompt to the chosen direction in `ideas.md`: describe the subject, composition,
  palette, lighting, texture, camera or illustration treatment, and intended placement. Do not
  generate generic stock-looking imagery.
- Use image search only for factual or real-world subjects whose identity must be accurate, such as
  people, places, products, or events, or when the user explicitly requests a visual reference. Do
  not search for generic style references before generation—`ideas.md` is the design reference. Do
  not use a searched image as a shortcut for a custom hero, brand visual, or signature
  illustration.
- If generation returns reserved URLs while work continues in the background, reference those URLs
  exactly as returned and keep building; do not poll or regenerate while generation is pending. Otherwise follow the
  returned tool contract. Never claim that a background image is ready before its completion
  result arrives.
- Do not reuse one image across unrelated sections, and do not leave placeholder imagery in the
  delivered project.

The [main skill](../SKILL.md#workflow) decides when visual checks are appropriate.
The `webdev.take_screenshot` tool description owns capture behavior and image inspection.
