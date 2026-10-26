# Regularized regression, visually: spec

Sibling of `gradient_descent` and `logistic_regression`: same page shell
(header + tabs, intro card with formulas and "Try this" with `<details>`
answers, plot cards + controls sidebar, footer build stamp) and
`pages.yml`. Written for lesson 13 (ridge, lasso, elastic net with GD).

## Decisions

- Objective (1/2n)‖Xw − y‖² + λ₁‖w‖₁ + (λ₂/2)‖w‖², gradient
  (1/n)Xᵀ(Xw − y) + λ₁ sign(w) + λ₂w. Chosen over the ridge_by_hand.tex
  form λ‖w‖² (gradient 2λw); the constants live in `js/fit.js` and the
  formulas in `index.html` if this changes.
- Weights are **w**. No intercept: features drawn mean 0, sd 1; y mean 0.
- One Model control shared by both tabs; each tab (and each Why problem)
  keeps its own { l1, l2 } per model. Charts against λ sweep λ₂ (ridge)
  or λ₁ (lasso, elastic net with λ₂ held).
- λ sliders and charts span 10⁻²..10² on a log scale, with λ = 0 (OLS)
  as its own stop past a break. Below 10⁻² the 2,000-gene lasso nearly
  interpolates and takes seconds to solve, and nothing on the page needs
  it.
- Lasso GD is the plain subgradient step only (no soft threshold), so its
  chatter at a zero weight is shown honestly and capped at 3000 steps.
- Every Why problem starts at λ = 0: the problem first, then the fix.

## Tab 1: Why regularize? (`#why`)

Problem picker in the intro, its Problem / Approach boxes right under it;
Try this per problem. Left: the fits (cloud or stems). Middle: curves
against λ. Right: the objective J(w) over the Model control, λ sliders,
the problem's sliders, Resample, readout. A third problem (gene pathways,
elastic net keeping a correlated group) was cut; elastic net stays as a
model option.

- Correlated features: 200 samples (n = 20, ρ = 0.9, true w = (3, 3),
  noise sd 1), fit each; OLS cloud grey behind the model's; the line
  w₁ + w₂ = 6; ◆ mean fit. Curves: bias², variance, error, clipped at 1.5×
  the OLS error. Ridge roughly halves the OLS error here; lasso only
  raises it, which a Try-this item says.
- Many genes, few people: 2,000 genes (true weights 2, −3, 2.5, 3.5 on
  genes 113, 588, 1241, 1834), n = 100 (slider 50..200, refit on
  release), test set of 300. Only nonzero weights are drawn, with a count
  of the zeros. Curves: test-set and training MSE (log), nonzero strip
  (log 1 + count), ▼ at the lowest test-set MSE.

## Tab 2: Loss surface (`#surface`)

Two features, ρ = 0.6, n = 20 (slider 1..60), true w = (2, 0) draggable.
Defaults λ₂ = 0.5 (ridge), λ₁ = 0.6 (lasso), 0.3 / 0.3 (elastic net);
lasso zeros w₂* there, so Run shows the chatter. η starts at 1/L, the
readout shows 1/L for the current J. Contour overlays: w* path (pink, OLS
end marked), MSE level set through w* (teal), penalty level set through
w* (blue), ★ w*, ✕ true w. Right: coefficient path w₁*, w₂* against λ.
