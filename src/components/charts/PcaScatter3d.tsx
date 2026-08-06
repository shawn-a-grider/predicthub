import ReactECharts from 'echarts-for-react'
import 'echarts-gl'

import type { MarketDataset } from '@/features/analytics/marketDataset'
import type { PcaResult } from '@/features/analytics/pca'

type PcaScatter3dProps = {
  dataset: MarketDataset
  pca: PcaResult
}

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`
}

export function PcaScatter3d({ dataset, pca }: PcaScatter3dProps) {
  const data = pca.scores.map((score, index) => [
    Number(score[0]?.toFixed(5) ?? 0),
    Number(score[1]?.toFixed(5) ?? 0),
    Number(score[2]?.toFixed(5) ?? 0),
    index,
    dataset.observations[index]?.label ?? '',
  ])
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: '#07100c',
      borderColor: '#214638',
      borderWidth: 1,
      textStyle: { color: '#e4f7ee', fontFamily: 'IBM Plex Mono, monospace' },
      formatter: (params: { value: Array<number | string> }) => {
        const value = params.value

        return [
          `<strong>${value[4]}</strong>`,
          `PC1 ${Number(value[0]).toFixed(3)}`,
          `PC2 ${Number(value[1]).toFixed(3)}`,
          `PC3 ${Number(value[2]).toFixed(3)}`,
        ].join('<br/>')
      },
    },
    visualMap: {
      min: 0,
      max: Math.max(data.length - 1, 1),
      dimension: 3,
      show: false,
      inRange: {
        color: ['#39ff88', '#25d0ff', '#f4d35e', '#ff5c7c'],
      },
    },
    xAxis3D: {
      type: 'value',
      name: `PC1 ${percent(pca.explainedVariance[0] ?? 0)}`,
      nameTextStyle: { color: '#9ad8b9' },
      axisLine: { lineStyle: { color: '#2c5947' } },
      axisLabel: { color: '#85a394' },
      splitLine: { lineStyle: { color: '#173327' } },
    },
    yAxis3D: {
      type: 'value',
      name: `PC2 ${percent(pca.explainedVariance[1] ?? 0)}`,
      nameTextStyle: { color: '#9ad8b9' },
      axisLine: { lineStyle: { color: '#2c5947' } },
      axisLabel: { color: '#85a394' },
      splitLine: { lineStyle: { color: '#173327' } },
    },
    zAxis3D: {
      type: 'value',
      name: `PC3 ${percent(pca.explainedVariance[2] ?? 0)}`,
      nameTextStyle: { color: '#9ad8b9' },
      axisLine: { lineStyle: { color: '#2c5947' } },
      axisLabel: { color: '#85a394' },
      splitLine: { lineStyle: { color: '#173327' } },
    },
    grid3D: {
      boxWidth: 130,
      boxDepth: 96,
      boxHeight: 74,
      environment: '#050807',
      axisPointer: {
        lineStyle: { color: '#39ff88' },
      },
      viewControl: {
        autoRotate: false,
        projection: 'perspective',
        distance: 190,
        alpha: 24,
        beta: 42,
      },
      light: {
        main: { intensity: 1.1, shadow: true },
        ambient: { intensity: 0.42 },
      },
    },
    series: [
      {
        type: 'scatter3D',
        name: 'PCA score',
        data,
        symbolSize: 7,
        itemStyle: {
          opacity: 0.9,
          borderColor: '#e4f7ee',
          borderWidth: 0.35,
        },
        emphasis: {
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 1.5,
          },
        },
      },
    ],
  }

  return (
    <ReactECharts
      className="chart-panel h-[430px] min-h-[360px] w-full"
      option={option}
      style={{ height: '430px', width: '100%' }}
      notMerge
    />
  )
}
