export const hueOf = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};
export const initialOf = (name: string) => (name.trim()[0] ?? "").toUpperCase();
