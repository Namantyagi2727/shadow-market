# Browser-Lab UX-Trap Evaluation

Comparing our 3-persona Chromium browser panel (`persona_01` desktop, `persona_02` mobile, `persona_03` tablet; `gemini-4-hydrogen`) against a single static-screenshot Gemini critique (1440×900 + 390×844 full-page screenshots; `gemini-4-hydrogen`).

| Method | Recall (Overall) | hidden_fee | dead_cta | tiny_targets | price_hidden | forced_signup | FP Rate (Clean) | N (Trap / Clean) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| panel | 72.0% (18/25) | 80.0% (4/5) | 80.0% (4/5) | 0.0% (0/5) | 100.0% (5/5) | 100.0% (5/5) | 0.0% (0/25) | 25 / 5 |
| baseline | 80.0% (20/25) | 80.0% (4/5) | 20.0% (1/5) | 100.0% (5/5) | 100.0% (5/5) | 100.0% (5/5) | 4.0% (1/25) | 25 / 5 |

**Panel conversion rate:** clean pages 53.3% (8/15) vs trap pages 18.7% (14/75) (`hidden_fee` 6.7% (1/15), `dead_cta` 0.0% (0/15), `tiny_targets` 46.7% (7/15), `price_hidden` 40.0% (6/15), `forced_signup` 0.0% (0/15)).

## Honest Reading

The static-screenshot **baseline** outperformed the 3-persona browser **panel** on overall trap recall at **80.0%** (20/25) vs **72.0%** (18/25), a +8.0 percentage-point lead for the baseline, where panel led on `dead_cta` (80% vs 20%); baseline led on `tiny_targets` (100% vs 0%). On the clean control pages, false-positive rates were **0.0%** (0/25 checks) for the panel vs **4.0%** (1/25 checks) for the baseline, showing both methods kept hallucinated trap flags low. In the browser panel, shopper conversion moved from **53.3%** (8/15) on clean pages to **18.7%** (14/75, -34.7pp) on trapped pages, confirming that injected traps measurably drove shoppers to quit.

> **Note:** traps were injected by the team into model-generated pages; grading is automatic (Decisions API, threshold 0.5).

## Example Findings

### Browser Panel (`panel`)

- **`r_066ae675` / `price_hidden`** (found, noul=0.98): "Every single price is replaced with 'Price shown at checkout', even mid-sentence. Hiding the price until checkout is a huge red flag, and I don't have time for this."
- **`r_9828b9cf` / `forced_signup`** (found, noul=0.98): "There's a forced account creation modal blocking the product details and pricing. Immediate quit trigger."
- **`r_066ae675` / `hidden_fee`** (found, noul=0.98): "There's a surprise $14.99 non-refundable handling fee added at checkout, which contradicts the $4 flat shipping and 30-day money-back guarantee mentioned above. I'm not paying hidden fees, so I'm leaving."

### Static-Screenshot Baseline (`baseline`)

- **`r_9828b9cf` / `forced_signup`** (found, noul=0.98): "Forced Account Wall with No Exit: An unclosable "Create an account to see this product" modal sits over the hero section on both desktop and mobile. There is no `X` button, no "Continue as guest" option, and no "Log…"
- **`r_c5da68f4` / `hidden_fee`** (found, noul=0.98): "Surprise $14.99 non-refundable "handling fee": Nowhere on the page is a handling fee mentioned—until tiny gray text under the quantity selector reads `+ $14.99 handling fee (non-refundable)`. That is a 25% surprise…"
- **`r_35bf7899` / `price_hidden`** (found, noul=0.98): "Broken/Hidden Pricing ("Price shown at checkout"): Instead of showing a price, the page literally displays *"Price shown at checkout"* in the top nav button, the hero price box, the hero CTA button, a callout box in…"


## Combined (added after the run)
Panel and screenshot baseline catch **different** traps: the panel finds interaction bugs a screenshot can't show (dead buy buttons: 80% vs 20%), the screenshot finds visual ones the agents click straight past (tiny targets: 100% vs 0%). Counting a trap as found if **either** method finds it: **96% (24/25)**. Takeaway we act on: the lab should run both, not one.
