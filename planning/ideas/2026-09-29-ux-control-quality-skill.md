# Idea: a UX skill for interactive-control quality

- **Status:** parked, 2026-09-29. Too niche to earn its place today. Kept as a candidate for a future, separately released UX skill.
- **Not a kiss-ssg skill.** The kiss skills hand visual direction off on purpose: `kiss-site-new` and `kiss-site-review` defer it to Anthropic's `frontend-design` skill, and kiss keeps the structure. Button craft is a second responsibility, and it would ship to every consuming site. If this is built, it lives in its own plugin.

## Why it was parked

- **Triggering:** "design a primary button" is rarely the task. Buttons get made in passing while building a page, so a button-only skill would seldom load when it matters.
- **Low marginal value:** most of the draft (verb-plus-object labels, not relying on colour alone, "use the design system's tokens") is what a model already does unprompted. A skill should spend its words on what the model gets wrong.

## Shape if it is revived

1. **Broaden the scope** to interactive controls: buttons, links, form fields, toggles. Keep one lean `SKILL.md`, with a reference file per control (`references/buttons.md` holds the draft below) that loads only when needed.
2. **Start with the checkable rules:**
   - A hit target of at least 44px.
   - Text contrast of 4.5:1, component contrast of 3:1.
   - Every state defined: default, hover, focus, pressed, disabled, loading.
   - Tokens only, no arbitrary pixel values.
3. **Cover the failures the draft leaves out,** which are the ones that actually recur in generated UI:
   - No `:focus-visible` style, or the outline removed without a replacement.
   - A `<div>` or `<a>` used as a button, or a `<button>` used for navigation. On a static site, most "primary buttons" are links styled as buttons, and that difference matters.
   - Hover-only feedback that does nothing on touch devices.
   - No `prefers-reduced-motion` handling for transitions.
   - No guard against double submission, and no loading state on real forms.
4. **Treat the looser numbers as defaults, not rules:** the 48px height, the 16–17px label size, the lighting model.
5. **Ship something runnable,** the way the `dataviz` skill ships a palette validator: a script that checks contrast ratios and target sizes against a site's actual CSS tokens, so "is contrast sufficient?" becomes a measured answer.

A smaller, kiss-local follow-up, independent of the above: add two or three checkable criteria (a visible focus style, 44px targets, CTAs as `<a>` and actions as `<button>`) to the consistency line in `plugins/kiss-ssg/skills/kiss-site-review/SKILL.md`.

## The original draft (as proposed)

> **Skill: Design a High-Quality Primary Button**
>
> **Purpose.** Use this skill whenever designing, reviewing, generating, or refining a primary action button. The goal is not merely to make the button visually attractive. The button must feel deliberate, clear, accessible, responsive, and consistent with the wider design system.
>
> A primary button should be judged across six dimensions: size, label, contrast, depth and affordance, detail and geometry, motion and state feedback. Do not optimise colour in isolation. A visually weak button is usually caused by poor proportion, typography, contrast, spacing, state design, or interaction feedback rather than the specific brand colour.
>
> **1. Size.** Default to a 48px visual height for standard primary actions; a minimum 44px interactive target; 20–24px horizontal padding; content centred vertically and horizontally. Do not make important actions visually undersized. If the visible button is smaller than 44px high, preserve an interactive hit target of at least 44px. Adapt dimensions only when the surrounding design system clearly requires a different density.
>
> **2. Label.** Default to 16–17px text, semibold weight, sentence case, short explicit action wording, preferring a verb plus an object. Good: Create account, Save changes, Continue checkout, Send message. Avoid vague labels where the outcome is unclear: Submit, Okay, Next, Go. The user should be able to predict the result of pressing the button from the label alone.
>
> **3. Contrast.** Ensure the button remains legible and identifiable in all supported states. Text contrast should normally meet WCAG 4.5:1. Component boundaries and meaningful visual states should provide sufficient non-text contrast, normally around 3:1 where applicable. Do not rely solely on subtle grey-on-grey differentiation. Disabled buttons must remain recognisable without appearing actionable. Focus states must be clearly visible. Never sacrifice accessibility in order to achieve a quieter aesthetic.
>
> **4. Depth and affordance.** The button must look interactive. Depth may be communicated using tonal contrast, border treatment, surface hierarchy, shadow, highlight, pressed-state movement, or background change. A physical lighting model can be used when appropriate: light appears to come from above, upper edges may receive subtle illumination, shadows fall downward, pressed states reduce or invert perceived depth. However, do not add bevels, highlights, shadows, or gradients merely for decoration. Flat buttons are acceptable when hierarchy and interaction remain obvious. Depth is a tool for communicating affordance, not a mandatory visual style.
>
> **5. Detail and geometry.** Use systematic rather than arbitrary geometry. Use the design system's established radius; a radius equal to half the button height creates a pill button, to be used only when appropriate to the visual language. Use no more than one leading or trailing icon unless the component specifically requires otherwise. Maintain approximately 8–12px between icon and label. Align icons optically, not merely mathematically. Use consistent internal padding across button variants. Do not introduce isolated values such as 9px, 11px, or 13px unless they are justified by the existing token system. Prefer existing spacing, radius, typography, and colour tokens.
>
> **6. Motion and feedback.** Every interaction must receive immediate feedback. The user should normally perceive acknowledgement within approximately 100ms. State transitions should generally complete within approximately 150–300ms. Design explicit states for default, hover, focus, pressed, disabled, loading, success, and error where relevant. For asynchronous actions: acknowledge the press immediately; show loading if the operation is not effectively instantaneous; prevent accidental duplicate submission where appropriate; communicate completion clearly; do not unnecessarily delay the underlying action to allow an animation to finish. Motion should explain state change, not merely add spectacle.
>
> **Design-system behaviour.** Before creating a new button style, inspect the existing product for typography, spacing, radius, colour tokens, elevation rules, icon style, existing button variants, and interaction conventions. Prefer extending the existing system over introducing a visually isolated component. If the existing design system conflicts with accessibility or usability requirements, preserve the system where possible but correct the usability problem.
>
> **Review checklist.** Is the action visually prominent enough? Is the hit target large enough? Does the label describe the outcome? Is text contrast sufficient? Is the control clearly interactive? Are radius, spacing and typography derived from the design system? Is icon use restrained and correctly spaced? Are hover, focus, pressed, disabled and loading states defined? Does the button acknowledge interaction immediately? Does it look intentional at both mobile and desktop sizes?
>
> **Quality principle.** Do not judge a primary button by colour alone. Professional component design comes from the coherent combination of proportion + typography + contrast + affordance + geometry + interaction. A component should feel designed rather than decorated. When reviewing an existing button, diagnose which of these six areas is weakest before changing visual styling.
