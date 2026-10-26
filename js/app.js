// Tabs, hash routing, keyboard steps and the footer build stamp. The two
// Why tabs are views of WhyTab, the third is SurfTab; all share Model.

(function () {
  const TABS = { sparse: WhyTab.tab("genes"), corr: WhyTab.tab("pair"),
    surface: SurfTab };
  const HASH = { sparse: "#sparse", corr: "#correlated", surface: "#surface" };
  let mode = "sparse";

  function setMode(m) {
    TABS[mode].stop();
    mode = m;
    history.replaceState(null, "", HASH[m]);
    for (const t of document.querySelectorAll(".tab")) {
      t.setAttribute("aria-selected", t.dataset.mode === m);
    }
    for (const el of document.querySelectorAll("[data-show]")) {
      el.hidden = !el.dataset.show.split(" ").includes(m);
    }
    TABS[m].render();
  }

  for (const t of document.querySelectorAll(".tab")) {
    t.onclick = () => { if (t.dataset.mode !== mode) setMode(t.dataset.mode); };
  }

  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
    if (e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      TABS[mode].step();
    }
  });

  // Footer build stamp: the deployed commit (linked) and build time.
  const el = document.getElementById("build");
  const repo = "https://github.com/matthigger/regularized_regression";
  if (!BUILD) {
    el.textContent = "local copy";
  } else {
    const when = new Date(BUILD.time).toLocaleString("en-US", {
      dateStyle: "medium", timeStyle: "short" });
    el.innerHTML = `build <a href="${repo}/commit/${BUILD.sha}">${
      BUILD.sha.slice(0, 7)}</a>, ${when}`;
  }

  const fromHash = Object.keys(HASH).find(m => HASH[m] === location.hash);
  setMode(fromHash || "sparse");
})();
