# AI and marketing tells

Patterns that make web copy sound generated or promotional. They hide the facts a reader came for, so they work against front-loading and objective language. Use this list to check your own drafts and to review other people's copy.

Adapted for web copy from the Humanizer skill (github.com/blader/humanizer, MIT licence, copyright 2025 Siqi Chen), which draws on Wikipedia's "Signs of AI writing" (WikiProject AI Cleanup). The licence is reproduced in [sources.md](sources.md).

## How to use it

- Treat each pattern as a prompt to look again, not an automatic deletion. Edit when the phrase adds no information for the reader. Patterns marked _weak alone_ need other tells nearby before you act.
- Keep the fact underneath; remove only the dressing. If no fact is left, cut the sentence. If the reader needs a fact you don't have, put [to confirm] rather than writing one.
- Leave a phrase alone inside a quotation, a proper name, a product or programme title, or a passage that discusses the phrase.
- Don't use these patterns to guess whether a person or an AI wrote the text. The question is only whether the words help the reader.

## 1. Sales language and inflated significance

**Watch for:** world-class, revolutionary, innovative, cutting-edge, groundbreaking, renowned, leading, unparalleled, best-in-class, state-of-the-art, seamless(ly), empower, transform, unlock, elevate, journey, nestled, in the heart of, breathtaking, stunning, rich (figurative), diverse array, commitment to, reach your full potential; a pivotal moment, plays a key role, stands as a testament, sets the stage for, evolving landscape, the future looks bright, exciting times ahead.

**Why it fails on the web:** readers skip it to find the facts, and NN/g found promotional language lowers usability. It also makes claims nobody can check.

**Fix:** replace the adjective with a fact the reader can check, or cut it. If you don't have the fact, ask for it or put a placeholder in [square brackets].

> Before: Our world-class, revolutionary plumbing service empowers homeowners to transform their homes.
> After: Plumbing repairs and installations for homes. [Area covered, call-out hours and prices to confirm.]

The "after" keeps only what the "before" says. The facts a reader needs but the original lacks go in a placeholder, not in invented words.

## 2. Stock AI words

**Watch for:** delve, deep dive, robust (figurative), crucial, pivotal, key (as an adjective), landscape (abstract), tapestry, testament, showcase, highlight / underscore (as verbs), intricate, meticulous, vibrant, enhance, leverage, foster, garner, bolster, align with, additionally, valuable.

**Fix:** use the plain word, or say the specific thing. "Key features" → name the features. "Leverages cutting-edge technology" → say what the customer actually gets, taken from the source ("[what the service includes — to confirm]"). Never fill the gap with a plausible detail.

## 3. Run-ups and closers that delay or repeat the point

**Watch for:** Welcome to…, We are delighted to…, Let's dive in, Here's what you need to know, Without further ado, The thing is; and one-line closers that restate the paragraph: That's the real difference. Simple as that. Let that sink in.

**Why it fails on the web:** it pushes the answer below the first 15–20 words, where scanners decide whether to stay.

**Fix:** delete the run-up and start with the point. Delete a closer unless it adds a new fact or consequence.

## 4. "Not X, but Y" contrasts

**Watch for:** It's not just X, it's Y; not only X but Y; more than just a…; This isn't about X. It's about Y.

**Fix:** when the "not X" half adds nothing, state Y directly. Keep a contrast when both halves carry information: scope, an exclusion, a safety point, a real difference, or a likely misunderstanding ("This test detects infection, not immunity."; "You don't need to apply again. Your place carries over.").

## 5. "Serves as" instead of "is"

**Watch for:** serves as, stands as, functions as, represents, boasts, features, offers (when "has" or "is" would do).

> Before: The portal serves as a hub and boasts over 200 resources.
> After: The portal has more than 200 resources.

## 6. Forced threes

**Watch for:** lists of three that sound complete but repeat one idea ("innovation, inspiration and insights"; "flexible, accessible and convenient").

**Fix:** keep the items that add distinct information. Keep three when there are really three. _Weak alone._

## 7. Decorative formatting

**Watch for:** bold on every list item's label when the label repeats the item; bold scattered through body text; Title Case Headings; emojis or arrows in headings and labels; a heading followed by a sentence that repeats it.

**Fix:** use sentence-case headings. Use bold only for the one thing a scanner must not miss. Remove the sentence that repeats the heading.

**Don't overcorrect:** lists help people scan web pages. Keep a list when the items are parallel and separate. Remove only the decoration, not the structure.

## 8. Vague links between things

**Watch for:** associated with, in connection with, linked to, tied to.

**Fix:** name the relationship ("accredited by", "taught by", "required for"). If the source doesn't say, keep the vague wording rather than inventing one.

## 9. Borrowed authority

**Watch for:** experts agree, studies show, industry leaders, trusted by thousands, as featured in [list of outlets].

**Fix:** name the source and what it found, or cut the claim. Unsupported claims in health, finance and education copy can also break regulations or advertising standards, so flag them to the user.

## 10. Stacked hedges

**Watch for:** could potentially, may possibly, it might be argued that.

**Fix:** keep one qualifier when the meaning needs it. Keep real scope, legal and safety statements. _Weak alone._

## 11. Text about the text

**Watch for:** "The table below shows…", "This page will explain…", "In this section we will…", "This content was updated to…".

**Fix:** cut it and let the heading and the content speak. Keep a statement about the page only when it changes what the reader does ("Prices include VAT.").

## 12. Chatbot leftovers

**Watch for:** Certainly!, Great question!, I hope this helps, Let me know if…, Here is a…, As an AI…, as of my last update, while specific details are limited.

**Why it matters:** these must never reach copy that someone will paste into a page, email or interface. Check the final text for them every time.

## Final check after any rewrite

Compare the rewrite with the original, line by line:

1. Did you **add** any fact, number, date, name, price, claim or quote that is not in the source or the user's message? Remove it, or mark it [to confirm].
2. Did you **drop** any fact the reader needs (a deadline, fee, requirement or condition)? Put it back. Cutting promotional wording is correct; losing information is an error.
3. Search the rewrite again for the tells that most often survive: sales adjectives, run-ups, "not X but Y", and chatbot leftovers.
