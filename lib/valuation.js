function estimateFairValueFromEPS(eps, assumedPE) {
  if (eps === null || eps === undefined || eps === "") return null;
  const epsNum = Number(eps);
  const peNum = Number(assumedPE);
  if (!Number.isFinite(epsNum) || !Number.isFinite(peNum) || peNum <= 0) return null;
  return Number((epsNum * peNum).toFixed(2));
}

function estimateFairValueFromDCF(params = {}) {
  const { cashFlow, growthRate, discountRate, years = 5, terminalMultiple } = params;

  if (
    !Number.isFinite(Number(cashFlow)) ||
    !Number.isFinite(Number(growthRate)) ||
    !Number.isFinite(Number(discountRate)) ||
    !Number.isFinite(Number(terminalMultiple))
  ) {
    return null;
  }

  const cf = Number(cashFlow);
  const g = Number(growthRate);
  const d = Number(discountRate);
  const t = Number(terminalMultiple);

  if (d <= g || d <= 0 || years <= 0) return null;

  let pv = 0;
  for (let year = 1; year <= years; year += 1) {
    const projected = cf * (1 + g) ** year;
    pv += projected / (1 + d) ** year;
  }

  const terminalValue = (cf * (1 + g) ** years * t) / (1 + d) ** years;
  return Number((pv + terminalValue).toFixed(2));
}

module.exports = { estimateFairValueFromEPS, estimateFairValueFromDCF };
