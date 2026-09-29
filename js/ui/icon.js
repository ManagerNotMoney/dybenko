// ui/icon.js
export function isImagePath(icon) {
  return typeof icon === "string" && /\.(png|jpe?g|webp|svg)$/i.test(icon);
}

export function renderIcon(icon) {
  return isImagePath(icon)
    ? `<img src="${icon}" class="icon-img" alt="">`
    : icon;
}
export function renderItemIcon(item, kind) {
  const iconHTML = renderIcon(item.icon);
  if (kind !== "equipment" || !item.materialColor) return iconHTML;
  return `<span class="item-glow" style="--glow-color:${item.materialColor}">${iconHTML}</span>`;
}