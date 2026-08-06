import { dot, mean, multiplyMatrixVector, standardDeviation } from './matrix'

export type PcaLoading = {
  ticker: string
  pc1: number
  pc2: number
  pc3: number
}

export type PcaResult = {
  scores: number[][]
  loadings: PcaLoading[]
  explainedVariance: number[]
  eigenvalues: number[]
  means: number[]
  standardDeviations: number[]
}

function normalize(vector: number[]) {
  const magnitude = Math.sqrt(dot(vector, vector))

  if (magnitude < 1e-12) {
    return vector.map(() => 0)
  }

  return vector.map((value) => value / magnitude)
}

function covarianceMatrix(matrix: number[][]) {
  const rowCount = matrix.length
  const columnCount = matrix[0]?.length ?? 0
  const covariance = Array.from({ length: columnCount }, () =>
    Array.from({ length: columnCount }, () => 0),
  )

  for (let row = 0; row < rowCount; row += 1) {
    for (let colA = 0; colA < columnCount; colA += 1) {
      for (let colB = colA; colB < columnCount; colB += 1) {
        covariance[colA][colB] += matrix[row][colA] * matrix[row][colB]
      }
    }
  }

  for (let colA = 0; colA < columnCount; colA += 1) {
    for (let colB = colA; colB < columnCount; colB += 1) {
      const value = covariance[colA][colB] / Math.max(rowCount - 1, 1)
      covariance[colA][colB] = value
      covariance[colB][colA] = value
    }
  }

  return covariance
}

function topEigenpairs(matrix: number[][], componentCount: number) {
  const working = matrix.map((row) => [...row])
  const size = matrix.length
  const pairs: Array<{ value: number; vector: number[] }> = []

  for (let component = 0; component < componentCount; component += 1) {
    let vector = normalize(
      Array.from({ length: size }, (_, index) => Math.sin((index + 1) * (component + 1.7))),
    )

    for (let iteration = 0; iteration < 160; iteration += 1) {
      const nextVector = normalize(multiplyMatrixVector(working, vector))

      if (dot(nextVector, nextVector) < 1e-12) {
        break
      }

      vector = nextVector
    }

    const value = Math.max(dot(vector, multiplyMatrixVector(working, vector)), 0)

    pairs.push({ value, vector })

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        working[row][col] -= value * vector[row] * vector[col]
      }
    }
  }

  return pairs
}

export function runPca(matrix: number[][], tickers: string[], componentCount = 3): PcaResult {
  if (matrix.length < 3 || !matrix[0]?.length) {
    throw new Error('PCA needs at least three aligned observations.')
  }

  const columnCount = matrix[0].length
  const means = Array.from({ length: columnCount }, (_, column) =>
    mean(matrix.map((row) => row[column])),
  )
  const standardDeviations = Array.from({ length: columnCount }, (_, column) => {
    const deviation = standardDeviation(matrix.map((row) => row[column]))

    return deviation < 1e-8 ? 1 : deviation
  })
  const standardized = matrix.map((row) =>
    row.map((value, column) => (value - means[column]) / standardDeviations[column]),
  )
  const covariance = covarianceMatrix(standardized)
  const totalVariance = covariance.reduce((total, row, index) => total + row[index], 0)
  const eigenpairs = topEigenpairs(covariance, componentCount)
  const vectors = eigenpairs.map((pair) => pair.vector)
  const scores = standardized.map((row) => vectors.map((vector) => dot(row, vector)))
  const loadings = tickers.map((ticker, marketIndex) => ({
    ticker,
    pc1: vectors[0]?.[marketIndex] ?? 0,
    pc2: vectors[1]?.[marketIndex] ?? 0,
    pc3: vectors[2]?.[marketIndex] ?? 0,
  }))

  return {
    scores,
    loadings,
    explainedVariance: eigenpairs.map((pair) =>
      totalVariance > 0 ? pair.value / totalVariance : 0,
    ),
    eigenvalues: eigenpairs.map((pair) => pair.value),
    means,
    standardDeviations,
  }
}
