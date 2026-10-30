# Guidance by content type

## Contents

1. Editorial and informational pages
2. Product pages
3. Dashboards and control panels
4. Forms and onboarding
5. Errors, empty states and other system states
6. Notifications, SMS and email
7. Mobile versus desktop

---

## 1. Editorial and informational pages

**Behaviour:** people scan, then read selectively.
**Open with:** the answer or conclusion.
**Highest-risk mistake:** a buried answer, or a promotional introduction ("We are pleased to announce that, following…").

- First paragraph answers "Am I in the right place?" Aim to establish that in the first 15–20 words.
- Write "Applications close on 14 November. You need…", not a warm-up.
- One idea per paragraph; headings per user question; lists for real lists.
- Put background and specialist detail lower down or behind links.
- Use a descriptive `<title>` and H1 in the words readers search with ("Boiler repair in Leeds: prices and call-out times", not "Best amazing affordable plumber near me UK 2026").
- Engineering note: real semantic headings in order; a summary field as a first-class CMS field rather than an ad hoc intro.
- Measure: findability, task success, time to answer, comprehension.

## 2. Product pages

**Behaviour:** qualify, compare, then inspect details.
**Open with:** what it is, price, the main differentiator, availability or configuration, and the next action.
**Highest-risk mistake:** missing decision information, or adjectives where specifications should be.

Evidence: NN/g recommends combining description, specifications, reviews, media, price, availability and a clear buying control. Baymard (30,000+ manually scored UX elements) finds people abandon suitable products when information is missing or poorly structured; 64% of sites have mediocre-or-worse spec-sheet UX and 30% have serious inconsistency in spec terms, structure or units; 60% of respondents in one study looked for returns information on the product page.

A working model (operating guardrails, not research constants):

1. One-line positioning statement, roughly 10–25 words.
2. 3–6 high-value attributes.
3. Detailed description in short sections.
4. Structured specification table.
5. Review summary.
6. Delivery and returns (prominent, not buried).
7. FAQ, manuals and other supporting material.

Writing rules:

- Write benefits as testable facts: "Water-resistant to 50 m; suitable for pool swimming", not "Designed for limitless adventures".
- Specs: "Weight: 1.4 kg", not "Lightweight construction". Same labels, order and units across comparable products.
- Reviews: show the distribution, the count, sorting and filtering, and reviewer context, not only an average.
- Engineering note: model specifications as structured attributes with controlled labels and units, not free rich text. That gives consistent display, filtering, comparison, localisation and machine-readable data.
- Measure: comparison success, purchase confidence, returns caused by misinformation.

## 3. Dashboards and control panels

**Behaviour:** monitor, recognise, act quickly. NN/g defines a dashboard as an at-a-glance view, not a place for open-ended exploration.
**Open with:** the current state or the highest-priority metric.
**Highest-risk mistake:** ambiguous labels and hidden controls.

- Labels 1–4 words in stable domain vocabulary. Commands 2–4 words that say what happens: "Export CSV", "Pause campaign", "Invite user" (NN/g-backed).
- Metric descriptions: one short clause. Help copy: usually 1–2 short sentences (guardrails).
- One primary action per module where possible.
- Progressive disclosure: frequent and safety-critical controls stay visible; advanced ones go behind an explicitly labelled control ("Advanced reporting options", not "More"). More than two levels of disclosure tends to disorient.
- Tooltips only for supplementary information. Never put requirements needed to complete the task in a tooltip: it disappears, adds memory load, and may be undiscoverable or inaccessible.
- Experts benefit from simple syntax too; keep the domain vocabulary but simplify sentences.
- Engineering note: labels, descriptions and helper text belong in the component API, not in hover-only `title` attributes.
- Measure: time to action, command discoverability, action error rate.

## 4. Forms and onboarding

**Behaviour:** answer, decide, progress.
**Open with:** one clear question or task.
**Highest-risk mistake:** placeholder-only instructions and too many fields.

- First remove fields. Ask whether each one is needed before improving its wording.
- One question or decision per page as the starting model (GOV.UK): better focus, mobile use, error recovery and analytics. Exception: internal expert systems where users switch between items and need several visible together.
- Persistent labels outside the field. Never put requirements or examples only in placeholder text.
- Hint text answers a real question: why it's needed, where to find it, what format. Add help where research shows a need, not to every field by default.
- The button names what comes next: "Continue to choose a time", not "Continue".
- Template:
  - Heading: "What is your postcode?"
  - Hint: "We use it to check that we cover your area"
  - Label: "Postcode"
  - Button: "Continue to choose a time"
- Onboarding should be brief, optional and contextual. Forced tutorials get skipped, interrupt the goal and are poorly remembered. Prefer help that appears when the user meets the feature. Use a walkthrough only when the interaction model is unfamiliar and can't be made self-explanatory.
- Measure: completion, abandonment, field-level validation errors, repeated errors.

## 5. Errors, empty states and other system states

**Behaviour:** diagnose and recover, or understand why nothing is shown.
**Highest-risk mistake:** a generic error or an unexplained blank.

**Errors** contain three things: the affected item, the problem, the corrective action. Visible, specific, human-readable, constructive, and near the source.

- "Enter a date after 31 October 2026", not "Invalid date".
- "The file is larger than [limit]. Choose a smaller file.", not "Upload error 413". Match the recovery to the cause: offer "Try again" only for failures that a retry can fix.
- "You do not have permission to edit this page. Ask a site administrator for access.", not "Forbidden".
- Avoid "An error occurred" and "This field is required".
- Keep everything the user entered.
- On submitted forms, show an error summary that links to each field; associate field errors with `aria-describedby`.
- Three or more repeats of an error in one attempt is a signal to investigate (NN/g). The cause may be the wording, the validation rules, the interaction or the system, so check all four before you rewrite or redesign. Instrument error counts, repeats and recovery.

**Empty states** are not errors. Say what would appear here, why it is empty, and give a direct route to fill it.

- "No saved reports yet. Save a report to make it available here." Button: "Browse reports".
- "No posts match "boiler". Try another word, or see all posts.", not "0 results".
- Don't show "No data" while data may still be loading.
- Write different copy for each distinct state: loading, zero results, not set up, no permission, system failure.

**Success:** confirm the outcome briefly ("Changes saved").

Engineering note: copy depends on the state model. Write it from an explicit list of states, not scattered string literals.

## 6. Notifications, SMS and email

**Behaviour:** notice, judge urgency, act or keep.
**Open with:** the outcome or action, in the subject and first sentence.
**Highest-risk mistake:** irrelevant or duplicate alerts.

- Send a message only when it meets a user need. Transactional messages (tied to something the user did) should arrive promptly when that reduces uncertainty.
- One main thing per message. First sentence carries the most important information, then any action, deadline and consequence.
- Channels (NN/g): users expect push and SMS to be shorter and timelier than email. Push shows roughly 50–240 characters depending on platform, so front-load. SMS suits critical information that must be kept or acted on fast; push suits lower-urgency status changes that lead back into the app.
- Consolidate bursts. High volumes lead users to turn notifications off.
- Subjects: "Your application has been approved", not "Important update". "Action needed: pay £120 by 14 November", not "Reminder".
- Push: "Delivery moved to 14:30–15:30. Track your order.", not "We have an important update regarding your recent order…".
- Email template:
  - Subject: "Action needed: upload your ID by 14 November"
  - Opening: "We need one more document before we can review your application."
  - Action: "Upload your ID"
  - Consequence: "If we do not receive it by 14 November, your application will close."
- Link to fuller detail rather than overloading the alert.
- Measure: downstream action rate together with opt-outs and notification disablement.

## 7. Mobile versus desktop

- Mobile needs no separate "short-copy language", but complexity costs more there. NN/g found comparable comprehension of easy text on phone and desktop, but slower reading of difficult passages and worse performance on interactive and comparison tasks on mobile.
- So: prioritise harder, simplify interactions, use disclosure that keeps context. Don't just cut content.
- Forms on mobile: labels above fields, the right keyboard for each input, fewer fields, auto-fill or computed values where safe.
- Product pages on mobile: keep major sections in the main page as consistent vertically collapsed sections (description, reviews, Q&A, shipping, specs), not scattered subpages (Baymard).
- Desktop may be denser when the task truly benefits from seeing things together (for example internal expert users comparing items), not merely because there is more space.
