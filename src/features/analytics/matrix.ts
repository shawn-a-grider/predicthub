export function transpose(matrix: number[][]) {
  if (!matrix.length) {
    return []
  }

  return matrix[0].map((_, columnIndex) => matrix.map((row) => row[columnIndex]))
}

export function dot(a: number[], b: number[]) {
  return a.reduce((total, value, index) => total + value * b[index], 0)
}

export function multiplyMatrix(a: number[][], b: number[][]) {
  const bT = transpose(b)

  return a.map((row) => bT.map((column) => dot(row, column)))
}

export function multiplyMatrixVector(matrix: number[][], vector: number[]) {
  return matrix.map((row) => dot(row, vector))
}

export function identity(size: number) {
  return Array.from({ length: size }, (_, rowIndex) =>
    Array.from({ length: size }, (_, columnIndex) => (rowIndex === columnIndex ? 1 : 0)),
  )
}

export function invertMatrix(matrix: number[][]) {
  const size = matrix.length
  const augmented = matrix.map((row, rowIndex) => [...row, ...identity(size)[rowIndex]])

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row
      }
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-10) {
      throw new Error('Regression matrix is singular; choose more varied markets or a wider window.')
    }

    ;[augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]]

    const pivot = augmented[column][column]

    for (let col = 0; col < size * 2; col += 1) {
      augmented[column][col] /= pivot
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue
      }

      const factor = augmented[row][column]

      for (let col = 0; col < size * 2; col += 1) {
        augmented[row][col] -= factor * augmented[column][col]
      }
    }
  }

  return augmented.map((row) => row.slice(size))
}

export function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length
}

export function variance(values: number[]) {
  if (values.length < 2) {
    return 0
  }

  const average = mean(values)
  const sumSquares = values.reduce((total, value) => total + (value - average) ** 2, 0)

  return sumSquares / (values.length - 1)
}

export function standardDeviation(values: number[]) {
  return Math.sqrt(Math.max(variance(values), 0))
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
