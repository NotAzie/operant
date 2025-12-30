# MASTER PROJECT PROMPT

## Build the Complete Operational Intelligence & Execution Platform

You are not being asked to create a simple AI chatbot, dashboard, ERP clone, CRM, automation tool, or collection of disconnected applications.

You are being asked to design and build the foundation of a **general-purpose operational intelligence and execution platform**.

The long-term vision is a system capable of maintaining a trustworthy, continuously evolving model of the operational reality of a person or organization, understanding what is happening, reasoning about what matters, coordinating processes, and safely taking authorized actions.

The system must be designed as a serious, extensible product rather than a prototype held together by isolated features.

---

# 1. CORE PRODUCT IDEA

The central concept is:

> **A continuously updated operational model of reality, combined with intelligence and controlled execution.**

The platform should not attempt to literally represent everything that exists in the real world.

Instead, it should maintain a **scoped, versioned, temporal, evidence-backed model of the information that is operationally relevant to the user or organization.**

The system should be capable of representing and reasoning about:

* entities
* relationships
* events
* current and historical state
* obligations
* responsibilities
* resources
* ownership
* authority
* evidence
* observations
* derived information
* inferences
* predictions
* objectives
* policies
* actions
* action outcomes
* dependencies
* uncertainty
* time

The platform should eventually be applicable to areas such as:

* personal operations
* personal finance
* business operations
* financial operations
* inventory
* logistics
* customer management
* workforce management
* assets
* projects
* documents
* organizational processes
* other operational domains

However, these should **not** become independent applications with unrelated architectures.

They should be different interpretations and configurations of the same underlying operational model.

The goal is not:

> “Build every application.”

The goal is:

> **Build the underlying intelligence and execution layer that allows many operational domains to exist on top of the same model.**

---

# 2. THE MOST IMPORTANT PRINCIPLE

Do not build the system around the assumption that it knows reality perfectly.

The platform must understand the distinction between:

> Reality

and

> The system's current model of what it knows about reality.

The system may be wrong.

Information may be incomplete.

Sources may disagree.

Information may become stale.

External systems may fail.

Users may provide incorrect information.

AI-generated conclusions may be wrong.

Actions may fail.

External actions may produce unknown outcomes.

Therefore, the architecture and behavior of the entire product must be designed around **uncertainty, evidence, verification, correction, and recovery.**

The system should never manufacture certainty simply because certainty would make the interface easier.

---

# 3. THE WORLD MODEL

The platform should maintain a structured operational model consisting conceptually of:

**Entities + Relationships + Events + State + Obligations + Authority + Evidence**

This is the conceptual foundation of the entire product.

An entity is not defined philosophically.

An entity is something the system needs to independently identify, reference, relate, authorize, observe, or maintain state about.

Examples may include:

* people
* organizations
* accounts
* assets
* locations
* products
* services
* resources
* devices
* vehicles
* documents
* invoices
* projects
* contracts
* tasks
* other operationally relevant objects

Do not turn every conceivable concept into an entity merely because it exists.

The model should represent what is **operationally relevant**.

Relationships must also be treated as meaningful first-class information.

Examples:

* owns
* employs
* manages
* belongs to
* supplies
* assigned to
* located at
* depends on
* responsible for
* contracted with

Relationships can change over time and therefore must not be assumed to be permanent.

The system should be capable of representing relationship lifecycle and validity.

---

# 4. IDENTITY MUST BE CAREFUL

The platform will receive information from multiple sources.

Different systems may identify the same real-world entity differently.

For example, one system may use an account ID, another an email address, and another a customer number.

The system must not blindly merge identities simply because attributes appear similar.

Identity resolution should be treated as an evidence-supported determination.

The system must be capable of representing:

* source-specific identities
* candidate matches
* supporting evidence
* confidence
* conflicting attributes
* source authority
* unresolved identity
* human confirmation where necessary

An uncertain identity must remain uncertain rather than being silently converted into a permanent incorrect merge.

---

# 5. SCOPED KNOWLEDGE, NOT ONE GLOBAL WORLD

Do not design the product around the idea that there is one universal database containing everything about everyone.

The platform should have a **common representation model** while maintaining appropriate knowledge and authority boundaries.

Different contexts may exist for:

* an individual
* a household
* a company
* a department
* an external organization
* a partner
* another authorized domain

Information may be shared between contexts where appropriate.

Information must remain isolated where authority does not permit sharing.

The platform should therefore have:

> **A common language for representing operational reality, not universal ownership of reality.**

Privacy, ownership, authority, visibility, and organizational boundaries must be treated as fundamental product concepts.

---

# 6. TIME IS FUNDAMENTAL

The system must not treat time as merely a timestamp attached to records.

The same information can have multiple temporal meanings.

The platform should distinguish concepts such as:

* when something happened
* when something was observed
* when the system learned about it
* when the information was recorded
* when the information became valid
* when it stopped being valid
* when something is expected to happen
* when something was scheduled
* when something actually happened

States and relationships may therefore have temporal validity.

Events may be:

* planned
* scheduled
* started
* delayed
* partially completed
* completed
* cancelled
* recurring
* expired
* disputed
* backdated

The platform must be capable of understanding that:

> “When something happened”

and

> “When we discovered that it happened”

are not necessarily the same thing.

Historical state must remain reconstructable.

---

# 7. EVIDENCE AND PROVENANCE

Every important piece of knowledge should have an understandable origin.

The system should be capable of answering:

* Where did this information come from?
* When was it observed?
* How fresh is it?
* Has it been transformed?
* Was it calculated?
* Was it inferred?
* What assumptions were involved?
* What other information does it depend on?
* What source authority does it have?
* Is there conflicting information?

The platform should maintain an evidence/provenance structure rather than simply storing final values.

Information should never lose its origin simply because it passes through multiple processing stages.

---

# 8. KNOWLEDGE STATES

The system must explicitly distinguish between different epistemic states.

At minimum, conceptually distinguish:

### Observed

Information directly received from a source.

### Derived

Information calculated or deterministically obtained from existing information.

### Inferred

Information the intelligence layer believes is likely to be true.

### Predicted

Information describing what the system expects may happen.

### Proposed

An action or conclusion the system recommends but has not executed.

### Executed

An action the system actually attempted.

### Confirmed

An action or event for which there is sufficient evidence that it actually occurred.

These categories must never silently collapse into one another.

An inference must not become an observation merely because it has been used repeatedly.

A prediction must not become a fact merely because it was stored.

A proposed action must not be treated as an executed action.

An executed action must not automatically be treated as successful.

---

# 9. UNCERTAINTY

Uncertainty is a legitimate state of the system.

The platform should be able to represent:

* unknown
* uncertain
* conflicting
* stale
* incomplete
* unavailable
* unresolved
* low-confidence
* high-confidence

Do not force every situation into true/false.

When the system does not know something, it should be able to explicitly represent:

> “Unknown.”

This is especially important for consequential operations.

The system should never invent certainty to make an answer look intelligent.

---

# 10. FRESHNESS

Information has a changing reliability over time.

A location observation may become stale within seconds.

A financial observation may remain useful for hours.

A company registration may remain useful for much longer.

Some information may remain valid until an explicit change occurs.

Therefore freshness must be considered as part of operational knowledge.

The system should be capable of reasoning about:

* source reliability
* observation age
* expected update frequency
* validity period
* freshness
* contextual relevance

A stale piece of information should not automatically be treated as equivalent to a fresh observation.

---

# 11. CONFLICTING INFORMATION

Multiple legitimate sources may disagree.

The platform must not simply overwrite one value with another.

It should be capable of representing:

* competing observations
* source authority
* timestamps
* freshness
* provenance
* confidence
* contextual validity
* unresolved conflicts

The intelligence layer may determine a preferred interpretation when sufficient evidence exists.

But the underlying evidence and disagreement must remain recoverable.

The system must be capable of saying:

> “These sources disagree.”

rather than silently hiding the disagreement.

---

# 12. INTELLIGENCE IS NOT ONE GIANT AI

Do not build the entire platform around a single giant autonomous model.

Different kinds of problems require different kinds of processing.

The platform should conceptually distinguish between:

* deterministic processing
* event processing
* explicit rules
* policy evaluation
* mathematical computation
* machine learning
* prediction
* anomaly detection
* contextual reasoning
* planning
* agent orchestration
* human intervention

The agent is not the entire platform.

The agent is an orchestration capability that can coordinate the appropriate parts of the system toward an objective.

Use the simplest reliable mechanism for each task.

Do not invoke expensive reasoning where deterministic processing is sufficient.

Do not use AI to replace basic guarantees that should be deterministic.

---

# 13. EVENT-DRIVEN OPERATION

“Continuous awareness” must not mean continuously running expensive intelligence over everything.

The platform should operate around meaningful changes and events.

External sources may produce events.

The system evaluates those events.

State may change.

Policies may become relevant.

Patterns may emerge.

Some situations may require reasoning.

Some may require no intelligence at all.

Some may require immediate attention.

Some may only become meaningful when combined with future events.

Therefore the platform should conceptually support different classes of event relevance, including:

* immediate
* routine
* aggregated
* latent
* historical

An event that is insignificant today may become important later.

Historical information must therefore not simply disappear because it was previously considered unimportant.

---

# 14. OBJECTIVES AND CONFLICTING GOALS

The system must not invent the user's priorities.

Real-world objectives can conflict.

For example:

* minimize cost
* maximize speed
* maximize reliability
* preserve cash
* satisfy customers
* reduce risk

These objectives may point toward different actions.

The platform should therefore understand distinctions between:

* hard constraints
* required objectives
* preferences
* trade-offs
* approval requirements

When the system cannot determine the correct priority, it should recognize the conflict rather than arbitrarily choosing one.

The intelligence layer operates within objectives and policies defined by the appropriate authority.

---

# 15. AUTHORITY

Authority is more than authentication.

The platform must understand concepts such as:

* who can see something
* who owns something
* who is responsible for something
* who can modify something
* who can approve something
* who can execute something
* what resources are affected
* what limits apply
* what organizational scope applies
* what geographical scope applies
* what temporal scope applies
* what approval is required
* when escalation is necessary

Conceptually:

> Who → can perform what → on which resource → under what conditions → within what limits → requiring whose approval.

The system should distinguish between:

> ability to know

and

> authority to act.

---

# 16. CONTROLLED AUTONOMY

Autonomy must be delegated.

The system should never assume unlimited authority.

Users and organizations define:

* goals
* responsibilities
* permissions
* constraints
* limits
* policies
* approval requirements
* escalation rules
* operating boundaries

The system operates within those boundaries.

Autonomy should be contextual rather than globally high or low.

Conceptually, autonomy depends on factors such as:

> confidence × consequence × authority × reversibility

Low-risk, high-confidence, authorized and reversible operations may require little intervention.

High-consequence, uncertain, irreversible, or unclear-authority operations should involve stronger verification or human involvement.

---

# 17. ACTIONS ARE STATEFUL

Never model real-world actions as simply:

> execute → success

Real-world operations can fail, timeout, partially complete, be rejected, or produce an unknown outcome.

An action should conceptually be able to move through states such as:

* proposed
* authorized
* submitted
* accepted
* executing
* confirmed
* failed
* rejected
* expired
* unknown

The **unknown** state is especially important.

If an external operation times out, the system must not automatically assume failure.

It must recognize that the real-world outcome is unresolved.

---

# 18. VERIFICATION

The system must distinguish:

> “I attempted the action.”

from

> “The action actually happened.”

Where possible, outcomes should be independently verified.

Verification should feed back into the world model.

The platform should also be capable of recognizing when verification is impossible or incomplete.

Never fabricate confirmation.

---

# 19. ERROR CONTAINMENT

The system must be designed around the assumption that it will sometimes be wrong.

The objective is not:

> “Never make a mistake.”

The objective is:

> **Prevent mistakes from becoming uncontrolled real-world consequences.**

The platform should therefore support principles such as:

* confidence awareness
* constraints
* authorization
* verification
* reversibility
* escalation
* recovery
* auditability
* damage containment

The more uncertain a conclusion is and the more consequential an action is, the stronger the safeguards should become.

---

# 20. EXTERNAL INTEGRATIONS

External systems are not perfectly reliable.

Connections can:

* disappear
* expire
* change permissions
* change schemas
* change APIs
* return errors
* return partial information
* become unavailable
* provide stale information

The platform must treat connectivity as part of operational state.

It should understand:

* whether a source is connected
* when it last synchronized
* what the last known information was
* how fresh that information is
* whether permissions remain valid
* whether the source has changed
* whether synchronization failed
* whether the system currently has a blind spot

An unavailable source must not be silently interpreted as “nothing changed.”

---

# 21. HUMAN CORRECTIONS

Humans will correct the system.

A correction to one instance should not automatically rewrite the entire underlying model.

Repeated corrections may indicate:

* a bad rule
* incorrect identity resolution
* incorrect interpretation
* incorrect assumptions
* changing user behavior
* domain-specific exceptions

The system should distinguish:

> correcting an individual observation

from

> changing the model or reasoning behavior.

Human feedback should become meaningful evidence without automatically becoming absolute truth.

---

# 22. DEPENDENCY AND CIRCULAR REASONING

Knowledge can depend on other knowledge.

The system should preserve relationships such as:

> This conclusion depends on these observations and these assumptions.

If an important underlying assumption changes, dependent conclusions may need to be reconsidered.

An inference must never silently become an observation.

The platform should be able to trace important conclusions back toward their supporting evidence.

This is essential for avoiding self-reinforcing incorrect beliefs.

---

# 23. DECISION PROVENANCE

Every consequential decision should have a structured provenance trail.

The system should be capable of reconstructing:

* what it knew
* which evidence it used
* how fresh that evidence was
* which policies applied
* which objectives applied
* which constraints applied
* which relevant model versions existed
* what conclusion was reached
* what authorization existed
* what action was selected
* what action was attempted
* what happened afterward

The objective is not to expose an internal chain-of-thought transcript.

The objective is a structured causal record such as:

> Inputs → Evidence → Rules → Models → Decision → Authorization → Action → Outcome

This should make auditing, debugging, accountability, and correction possible.

---

# 24. VERSIONING

The system must preserve enough history to reconstruct important past decisions.

If the system's state, policy, model, or interpretation changes, the platform should be able to determine what was believed at a particular point in time.

For example, it should eventually be possible to understand:

> At a particular moment, the system believed X based on sources A, B, and C, under policy version Y and relevant model version Z.

Historical reconstruction is a fundamental requirement for a serious operational system.

---

# 25. MEASURABLE INTELLIGENCE

Do not use vague claims such as:

> “The AI is smarter.”

The platform should eventually have measurable dimensions.

Examples include:

### World-model quality

* state accuracy
* identity resolution accuracy
* consistency
* freshness

### Reasoning quality

* correct conclusions
* unsupported conclusions
* uncertainty calibration

### Prediction quality

* prediction accuracy
* false positives
* false negatives
* calibration

### Agent quality

* action success
* unnecessary actions
* failed actions
* recovery behavior

### Safety

* unauthorized actions
* policy violations
* escalation accuracy

### Human interaction

* unnecessary notifications
* useful notifications
* correction frequency

The system should be capable of being evaluated objectively.

---

# 26. THE CORE CLOSED LOOP

The central operational loop is:

> **Observe → Verify → Model → Understand → Reason → Plan → Authorize → Act → Confirm → Update**

This is not necessarily a rigid linear pipeline.

Real operation may involve feedback, uncertainty, investigation, retries, conflicting evidence, human intervention, and repeated observation.

The architecture should therefore support iterative feedback loops rather than assuming reality behaves like a clean sequence.

The fundamental principle is:

> **Action changes reality, reality produces new observations, observations update the model, and the updated model influences future reasoning and action.**

---

# 27. THE PLATFORM MUST NOT BECOME A COLLECTION OF MODULES

Do not create the product as:

* finance app
* CRM app
* inventory app
* HR app
* logistics app
* personal assistant
* analytics dashboard

all glued together.

Those domains may exist, but they should emerge from the underlying model.

The fundamental building blocks are operational concepts rather than application categories.

Think:

> entity + relationship + event + state + evidence + authority + obligation + objective + action

rather than:

> finance module + CRM module + HR module.

---

# 28. LONG-TERM DOMAIN EXTENSIBILITY

The architecture should allow new operational domains to be introduced without redesigning the entire platform.

A new domain should primarily introduce:

* domain-specific entities
* domain-specific relationships
* domain-specific events
* domain-specific rules
* domain-specific objectives
* domain-specific workflows
* domain-specific integrations

while continuing to use the shared underlying operational model.

The word “universal” should therefore mean:

> **The underlying abstraction is general enough to represent new domains without rebuilding the platform from scratch.**

It does not mean:

> “Every possible feature must exist from day one.”

---

# 29. PRODUCT EXPERIENCE

The user should not be forced to understand the underlying architecture.

The product should feel like a coherent intelligent system.

The interface should allow users to:

* understand what the system currently knows
* see important changes
* ask questions about their operational reality
* inspect relevant evidence
* understand uncertainty
* see relationships
* understand obligations
* review proposed actions
* approve or reject actions
* inspect completed actions
* correct incorrect information
* change authority
* define objectives
* set constraints
* investigate problems
* understand why the system is asking for attention
* regain control whenever necessary

The product should feel proactive without becoming intrusive.

It should be intelligent without pretending to be omniscient.

It should automate without becoming uncontrollable.

---

# 30. TRUST IS A PRODUCT FEATURE

Trust must not depend purely on the AI sounding confident.

Trust should come from:

* visibility
* provenance
* uncertainty
* control
* authority boundaries
* verification
* auditability
* reversibility
* recoverability
* predictable behavior

The system should be able to communicate uncertainty naturally.

For example:

> “I found conflicting information.”

> “This information may be outdated.”

> “I can recommend an action, but I don't have authority to execute it.”

> “The action was submitted, but its external result is currently unknown.”

This behavior is a fundamental part of the product.

---

# 31. THE PRODUCT MUST BE PRACTICAL

Do not build an elaborate theoretical architecture that cannot produce useful functionality.

Every layer and abstraction must justify its existence through real capability.

Avoid unnecessary complexity.

Avoid adding infrastructure simply because it sounds sophisticated.

Avoid creating technologies or abstractions that do not solve an actual problem.

The final system should be sophisticated where sophistication is necessary and simple where simplicity is sufficient.

---

# 32. TECHNOLOGY DIRECTION

You are responsible for selecting the actual implementation technologies.

Do NOT blindly follow a predetermined stack.

Use the **best modern, mature, maintainable technologies available for each responsibility**.

The implementation should prioritize:

* reliability
* maintainability
* extensibility
* performance
* security
* developer productivity
* strong ecosystem support
* interoperability
* observability
* testability
* reasonable operating cost
* future scalability

Use **Python for backend development where it is the strongest practical choice**, especially for intelligence, data processing, orchestration, and AI-related responsibilities.

However, do not force Python into areas where another technology is clearly more appropriate.

For the frontend, application infrastructure, storage, messaging, deployment, observability, authentication, AI/ML components, and other areas, independently determine the most appropriate modern technologies.

Do not choose technologies merely because they are fashionable.

Do not choose technologies merely because they are familiar.

Choose based on what best supports this product.

---

# 33. DO NOT PRESCRIBE THE ARCHITECTURE BEFORE UNDERSTANDING THE PROBLEM

Before implementation, reason about the requirements and determine the architecture that best satisfies them.

Do not blindly implement the conceptual layers as arbitrary microservices.

Do not create unnecessary distributed complexity.

Do not assume that every conceptual component needs to become a separate deployment.

The conceptual architecture describes responsibilities, not necessarily physical services.

The implementation should use the simplest architecture that can support the required behavior while leaving a credible path toward future scale.

---

# 34. SECURITY IS FUNDAMENTAL

This system may eventually handle extremely sensitive operational information.

Security must therefore be designed into the product rather than added later.

Consider:

* authentication
* authorization
* isolation
* secrets
* sensitive data
* audit trails
* action authorization
* external integrations
* session security
* data protection
* least privilege
* secure defaults
* abuse prevention
* safe failure behavior

Never assume that an AI layer can safely bypass normal security boundaries.

The intelligence layer must operate within the same authority model as every other component.

---

# 35. NO FAKE INTELLIGENCE

Do not create superficial demonstrations that merely look intelligent.

Do not hardcode fake reasoning and present it as real intelligence.

Do not fabricate successful external actions.

Do not invent integrations that do not actually exist.

Do not claim verification that has not occurred.

Do not generate fake data and present it as live operational information.

If something is not implemented, represent that honestly.

If a capability requires an external dependency, make that dependency explicit.

---

# 36. REAL IMPLEMENTATION OVER DOCUMENTATION

The expected output is **the actual project**, not an essay describing how someone could build it.

The final result should be a functioning, coherent product implementation.

Do not stop after creating:

* architecture diagrams
* database schemas
* TODO lists
* mockups
* pseudocode
* placeholder APIs
* fake AI responses
* disconnected proof-of-concepts

Those may be created as supporting artifacts, but they are not the final product.

The objective is to produce the real working system.

---

# 37. DEVELOPMENT APPROACH

Build the system in a way that allows the core concept to be validated progressively.

The initial implementation should prove the fundamental loop:

> **Connect information → establish evidence → construct operational state → understand events → reason → plan → authorize → act → verify → update**

Do not attempt to implement every future domain immediately.

The first implementation should establish the underlying platform capabilities strongly enough that future domains can be added rather than requiring an architectural rewrite.

---

# 38. INITIAL PRODUCT BOUNDARY

The initial product should focus on a practical operational/financial environment for individuals and small-to-medium organizations.

The purpose of this initial scope is not to abandon the larger vision.

It is to provide a realistic environment in which the underlying architecture can be proven.

The first implementation should demonstrate that the platform can:

* receive information
* preserve evidence
* understand entities
* resolve relationships
* maintain current state
* preserve history
* handle uncertainty
* detect meaningful changes
* reason over context
* respect authority
* propose actions
* execute authorized actions
* verify outcomes
* recover from failures
* explain decisions through structured provenance

Once this foundation is credible, additional domains can be added as extensions.

---

# 39. WHAT SUCCESS LOOKS LIKE

The finished system should feel fundamentally different from a normal collection of business software.

A user should not have to constantly think:

> “Which module contains this information?”

Instead, they should be able to think in terms of their actual operational reality.

For example:

> “What changed today?”

> “What needs my attention?”

> “Why is this important?”

> “What am I committed to this week?”

> “What financial obligations are approaching?”

> “What is causing this problem?”

> “What happens if I delay this?”

> “What can you handle for me?”

> “What information are you basing that on?”

> “What are you uncertain about?”

> “What actions are you authorized to take?”

The system should reason across relevant information rather than forcing the user to manually connect separate applications.

---

# 40. THE FINAL PRODUCT PRINCIPLE

Do not optimize for the appearance of intelligence.

Optimize for:

> **correct understanding, explicit uncertainty, appropriate reasoning, controlled authority, reliable execution, verification, and useful outcomes.**

The platform should become more useful as it accumulates legitimate operational context, but it should never become less trustworthy simply because it has more information.

---

# 41. MASTER OBJECTIVE

Build a complete, serious, extensible operational intelligence and execution platform whose central capability is:

> **maintaining a trustworthy, scoped, temporal, evidence-backed model of operational reality; reasoning over that model under uncertainty and explicit objectives; and safely taking authorized actions against the real world.**

The platform should be capable of growing from a focused initial product into a broad operational intelligence layer without requiring its fundamental model to be redesigned for every new domain.

The final architecture should support:

**Reality → Evidence → Operational Model → Knowledge → Reasoning → Objectives & Policy → Orchestration → Action → Verification → Updated Reality**

The platform must remain:

* grounded
* explainable
* auditable
* secure
* permission-aware
* uncertainty-aware
* event-driven
* extensible
* measurable
* recoverable
* practical

Do not interpret this prompt as a request to produce a conceptual demo.

Interpret it as a request to **build the actual product represented by this vision.**

Make appropriate architectural and technological decisions independently.

When implementation choices are ambiguous, choose the option that best preserves the core principles of the system and its ability to evolve.

Do not sacrifice the fundamental model merely to make the first version easier.

Do not over-engineer merely to make the architecture look impressive.

The goal is not to build the most complicated system.

The goal is to build the **smallest genuinely complete foundation capable of growing into this system.**

## Final definition

> **This is not software that does everything.**
>
> **It is a continuously updated operational model of reality, combined with intelligence and controlled execution.**

Everything else is built on top of that.
