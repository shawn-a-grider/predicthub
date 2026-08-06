import {
  clamp,
  dot,
  invertMatrix,
  mean,
  multiplyMatrix,
  multiplyMatrixVector,
  transpose,
} from './matrix'

export type DiagnosticPoint = {
  x: number
  y: number
  label: string
}

export type RegressionResult = {
  coefficients: number[]
  fitted: number[]
  residuals: number[]
  standardizedResiduals: number[]
  leverage: number[]
  cooksDistance: number[]
  residualsVsFitted: DiagnosticPoint[]
  qq: DiagnosticPoint[]
  scaleLocation: DiagnosticPoint[]
  cooks: DiagnosticPoint[]
  rSquared: number
  mse: number
  observationCount: number
  parameterCount: number
}

function inverseStandardNormal(probability: number) {
  const p = clamp(probability, 1e-12, 1 - 1e-12)
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const low = 0.02425
  const high = 1 - low

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p))

    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }

  if (p > high) {
    const q = Math.sqrt(-2 * Math.log(1 - p))

    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }

  const q = p - 0.5
  const r = q * q

  return (
    (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
    q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  )
}

export function runComponentRegression(
  y: number[],
  componentScores: number[][],
  labels: string[],
): RegressionResult {
  const x = componentScores.map((row) => [1, row[0] ?? 0, row[1] ?? 0, row[2] ?? 0])
  const xT = transpose(x)
  const xTx = multiplyMatrix(xT, x)
  let xTxInverse: number[][]

  try {
    xTxInverse = invertMatrix(xTx)
  } catch {
    const ridge = xTx.map((row, rowIndex) =>
      row.map((value, columnIndex) =>
        rowIndex === columnIndex ? value + (rowIndex === 0 ? 1e-8 : 1e-4) : value,
      ),
    )

    xTxInverse = invertMatrix(ridge)
  }
  const beta = multiplyMatrixVector(multiplyMatrix(xTxInverse, xT), y)
  const fitted = x.map((row) => dot(row, beta))
  const residuals = y.map((value, index) => value - fitted[index])
  const parameterCount = beta.length
  const observationCount = y.length
  const degreesOfFreedom = Math.max(observationCount - parameterCount, 1)
  const rss = residuals.reduce((total, value) => total + value ** 2, 0)
  const mse = rss / degreesOfFreedom
  const yMean = mean(y)
  const tss = y.reduce((total, value) => total + (value - yMean) ** 2, 0)
  const leverage = x.map((row) => dot(row, multiplyMatrixVector(xTxInverse, row)))
  const standardizedResiduals = residuals.map((residual, index) => {
    const denominator = Math.sqrt(Math.max(mse * (1 - leverage[index]), 1e-12))

    return residual / denominator
  })
  const cooksDistance = residuals.map((residual, index) => {
    const h = clamp(leverage[index], 0, 0.999999)

    return (residual ** 2 / Math.max(parameterCount * mse, 1e-12)) * (h / (1 - h) ** 2)
  })
  const sortedResiduals = standardizedResiduals
    .map((value, index) => ({ value, label: labels[index] }))
    .sort((a, b) => a.value - b.value)

  return {
    coefficients: beta,
    fitted,
    residuals,
    standardizedResiduals,
    leverage,
    cooksDistance,
    residualsVsFitted: fitted.map((value, index) => ({
      x: value,
      y: residuals[index],
      label: labels[index],
    })),
    qq: sortedResiduals.map((entry, index) => ({
      x: inverseStandardNormal((index + 0.5) / sortedResiduals.length),
      y: entry.value,
      label: entry.label,
    })),
    scaleLocation: fitted.map((value, index) => ({
      x: value,
      y: Math.sqrt(Math.abs(standardizedResiduals[index])),
      label: labels[index],
    })),
    cooks: cooksDistance.map((value, index) => ({
      x: index + 1,
      y: value,
      label: labels[index],
    })),
    rSquared: tss > 0 ? 1 - rss / tss : 0,
    mse,
    observationCount,
    parameterCount,
  }
}
