// Svelte action that moves a node to the end of <body> (or a given target).
//
// Why: our bottom-sheet modals use `position: fixed`, but they are rendered
// deep inside <main class="content">, which is a scroll container with
// `-webkit-overflow-scrolling: touch`. On iOS Safari that promotes .content to
// its own layer and *contains* fixed descendants to its box instead of the
// viewport — so a modal's bottom gets clipped at the nav bar and the buttons
// disappear. Re-parenting the modal to <body> lets `position: fixed` resolve
// against the real viewport, above everything in #app (including the nav bar).
//
// Both this action's destroy() and Svelte's own teardown guard on parentNode,
// so the double-removal that would otherwise happen is harmless.
export function portal(node, target = document.body) {
  target.appendChild(node);
  return {
    destroy() {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    },
  };
}
