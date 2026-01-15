export function validatePartNumber(value: string): string | null {
  if (!value || !value.trim()) {
    return "Partnumber vazio";
  }
  return null;
}

export function validateUnitPriceCents(cents: number | null): string | null {
  if (cents === null || cents === undefined) {
    return "Preco invalido";
  }
  if (cents <= 0) {
    return "Preco deve ser maior que zero";
  }
  return null;
}
