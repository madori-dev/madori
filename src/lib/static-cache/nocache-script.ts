/**
 * Client-side hydration script for NoCache sections.
 *
 * Injected before </body> on cached pages. Queries all placeholder elements
 * marked with [data-nocache-section], fetches their dynamic content from
 * the corresponding endpoint, and replaces the placeholder innerHTML on success.
 * On failure, logs the error and leaves the placeholder unchanged.
 */
export function getNoCacheScript(): string {
  return `
<script>
(function() {
  var sections = document.querySelectorAll('[data-nocache-section]');
  sections.forEach(function(el) {
    var endpoint = el.getAttribute('data-nocache-endpoint');
    fetch(endpoint)
      .then(function(r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function(html) { el.innerHTML = html; })
      .catch(function(err) { console.error('[madori:nocache] Failed to load section:', err); });
  });
})();
</script>`
}
