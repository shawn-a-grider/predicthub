import ReactECharts from 'echarts-for-react'

import type { DiagnosticPoint, RegressionResult } from '@/features/analytics/regression'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type DiagnosticChartsProps = {
  regression: RegressionResult
}

const axisStyle = {
  axisLine: { lineStyle: { color: '#2c5947' } },
  axisLabel: { color: '#85a394' },
  splitLine: { lineStyle: { color: '#13291f' } },
}

function formatValue(value: number) {
  if (Math.abs(value) < 0.001 && value !== 0) {
    return value.toExponential(2)
  }

  return value.toFixed(4)
}

function tooltip(name: string) {
  return {
    trigger: 'item',
    backgroundColor: '#07100c',
    borderColor: '#214638',
    textStyle: { color: '#e4f7ee', fontFamily: 'IBM Plex Mono, monospace' },
    formatter: (params: { data: [number, number, string] }) => {
      const [x, y, label] = params.data

      return [`<strong>${name}</strong>`, label, `x ${formatValue(x)}`, `y ${formatValue(y)}`].join(
        '<br/>',
      )
    },
  }
}

function scatterOption(title: string, xName: string, yName: string, points: DiagnosticPoint[]) {
  return {
    backgroundColor: 'transparent',
    tooltip: tooltip(title),
    grid: { left: 48, right: 18, top: 20, bottom: 42 },
    xAxis: { type: 'value', name: xName, nameLocation: 'middle', nameGap: 30, ...axisStyle },
    yAxis: { type: 'value', name: yName, nameLocation: 'middle', nameGap: 36, ...axisStyle },
    series: [
      {
        type: 'scatter',
        data: points.map((point) => [point.x, point.y, point.label]),
        symbolSize: 7,
        itemStyle: { color: '#39ff88', opacity: 0.8 },
      },
    ],
  }
}

function qqOption(points: DiagnosticPoint[]) {
  const values = points.flatMap((point) => [point.x, point.y])
  const min = Math.min(...values, -2)
  const max = Math.max(...values, 2)

  return {
    ...scatterOption('Q-Q', 'theoretical', 'standardized residual', points),
    series: [
      {
        type: 'line',
        data: [
          [min, min],
          [max, max],
        ],
        symbol: 'none',
        lineStyle: { color: '#25d0ff', width: 1.5, opacity: 0.7 },
      },
      {
        type: 'scatter',
        data: points.map((point) => [point.x, point.y, point.label]),
        symbolSize: 7,
        itemStyle: { color: '#f4d35e', opacity: 0.86 },
      },
    ],
  }
}

function cooksOption(points: DiagnosticPoint[]) {
  return {
    backgroundColor: 'transparent',
    tooltip: tooltip("Cook's distance"),
    grid: { left: 50, right: 18, top: 20, bottom: 42 },
    xAxis: { type: 'value', name: 'observation', nameLocation: 'middle', nameGap: 30, ...axisStyle },
    yAxis: { type: 'value', name: "Cook's D", nameLocation: 'middle', nameGap: 38, ...axisStyle },
    series: [
      {
        type: 'bar',
        data: points.map((point) => [point.x, point.y, point.label]),
        itemStyle: { color: '#ff5c7c', opacity: 0.72 },
      },
    ],
  }
}

function DiagnosticCard({
  title,
  option,
}: {
  title: string
  option: Record<string, unknown>
}) {
  return (
    <Card>
      <CardHeader className="p-3">
        <CardTitle className="font-mono text-xs">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <ReactECharts option={option} style={{ height: '250px', width: '100%' }} notMerge />
      </CardContent>
    </Card>
  )
}

export function DiagnosticCharts({ regression }: DiagnosticChartsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DiagnosticCard
        title="Residuals vs Fitted"
        option={scatterOption('Residuals vs fitted', 'fitted', 'residual', regression.residualsVsFitted)}
      />
      <DiagnosticCard title="Q-Q Plot" option={qqOption(regression.qq)} />
      <DiagnosticCard
        title="Scale-Location"
        option={scatterOption(
          'Scale-location',
          'fitted',
          'sqrt(|std residual|)',
          regression.scaleLocation,
        )}
      />
      <DiagnosticCard title="Cook's Distance" option={cooksOption(regression.cooks)} />
    </div>
  )
}
