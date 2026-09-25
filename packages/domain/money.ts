export function peso(centavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}
export function toCentavos(text: string) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text))
    throw new Error("Enter a valid peso amount with up to two decimals");
  const [whole, part = ""] = text.split(".");
  return Number(whole) * 100 + Number(part.padEnd(2, "0"));
}
