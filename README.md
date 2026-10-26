# regularized_regression

**Live demo:** <https://matthigger.github.io/regularized_regression/>

Interactive teaching demo of ridge, lasso and elastic net, in the style of
the [gradient descent](https://matthigger.github.io/gradient_descent/) and
[logistic regression](https://matthigger.github.io/logistic_regression/)
demos. One objective throughout, with no intercept (every feature has mean
0 and sd 1, and y has mean 0):

    J(w) = (1/2n) ||Xw - y||^2 + λ₁ ||w||₁ + (λ₂/2) ||w||₂²

Ridge uses only λ₂, lasso only λ₁, elastic net both; λ = 0 is OLS. The
Model control (Ridge / Lasso / Elastic net) is shared by both tabs, and
greys out the dropped term in every formula. Each λ slider is log scale
with its bottom stop at exactly 0.

- **Why regularize?** (`#why`). Two problems, each one a penalty fixes:
  - *Correlated features* (ridge): 200 fresh samples of two correlated
    features (true w = (3, 3)), each fitted; the cloud of ŵ in the
    (w₁, w₂) plane, and bias², variance and error E‖ŵ − w‖² against λ.
  - *Many genes, few people* (lasso): 40 genes, 25 people, 4 genes
    matter. A stem per gene (hollow dot = exactly 0), held-out and
    training MSE against λ, and the nonzero count.
  Correlation, sample size and Resample per problem; click or drag a
  chart to set λ.
- **Loss surface** (`#surface`). J over (w₁, w₂) for two correlated
  features, as a contour map or orbitable 3D mesh, with gradient descent
  (Gradient step / Run / Reset start, log η slider, loss-by-step chart,
  hover the trail). Overlays: the path of w* as λ grows, and the MSE and
  penalty level sets through w*, which touch there. Drag the true w to
  rebuild y from the same noise. Beside it, the coefficient path w*(λ).
  The gradient uses the subgradient sign(w) with sign(0) = 0, so a lasso
  walk toward a w* with a zero weight hops across 0 until the step cap.

w* comes from the ridge closed form (in the dual when n ≤ p, so λ = 0 gives
the smallest-norm fit), an exact sign-pattern solve for two features, or
coordinate descent.

Plain HTML/CSS/JS with SVG: no build step and no dependencies.

## Run locally

Open `index.html` in a browser, or serve it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Publish on GitHub Pages

Pages is built by `.github/workflows/pages.yml` on every push to `main`. It
stamps `js/version.js` with the commit and build time, which the footer
shows ("local copy" when run locally).

## Layout

| file | role |
|------|------|
| `index.html` | page, explanation text, controls |
| `style.css` | layout, palette, plot styles |
| `js/util.js` | SVG helpers, formatting, seeded RNG, eta and lambda sliders, Cholesky solve |
| `js/fit.js` | J, MSE, penalty; exact minimizers and paths over lambda |
| `js/data.js` | seeded draws and the two problems' data |
| `js/penalty.js` | shared Model control; per-tab lambda sliders |
| `js/gd.js` | gradient-descent runner and run loop |
| `js/surface.js` | sampled contour + 3D loss surface with the draggable w |
| `js/chart.js` | loss-by-step chart |
| `js/lamchart.js` | curves against lambda, with the lambda = 0 stop |
| `js/plots.js` | cloud of refits; gene stem plot |
| `js/why.js` | Why regularize? tab |
| `js/surftab.js` | Loss surface tab |
| `js/app.js` | tabs, hash routing, keyboard, footer build stamp |
| `js/version.js` | build stamp, overwritten at deploy |
| `design/spec.md` | the design spec |
| `.github/workflows/pages.yml` | Pages deploy |
