/**
 * The nearest ancestor that would clip an overflowing child. A panel that
 * scrolls on one axis clips the other one too (CSS resolves `visible` to
 * `auto` when the opposite axis is not visible), which is why a tooltip
 * anchored inside a vertically scrolling list can vanish sideways.
 */
export function clippingAncestor(node: HTMLElement | null): HTMLElement | null {
  for (let element = node?.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (/auto|scroll|hidden|clip/.test(style.overflowX + style.overflowY)) {
      return element;
    }
  }
  return null;
}
