const compactDateFormatter = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC'
});
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
});

function formatChartDate(value, formatter) {
    const label = String(value ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;

    const date = new Date(`${label}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? label : formatter.format(date);
}

export function createEloChart(ctx, existingChart, chartData, maintainAspectRatio = true, enableZoom = false) {
    // Destroy the existing chart instance if available.
    if (existingChart) {
        existingChart.destroy();
    }
    
    // Also destroy any chart registered internally by Chart.js.
    // This prevents a stale chart from remaining attached to the canvas.
    const canvasChart = Chart.getChart(ctx.canvas);
    if (canvasChart) {
        canvasChart.destroy();
    }

    return new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: maintainAspectRatio,
            scales: {
                x: {
                    afterBuildTicks(axis) {
                        const ticks = axis.ticks;
                        const axisWidth = axis.width || axis.chart.width;
                        const minimumLabelSpacing = 88;
                        const targetCount = Math.max(2, Math.min(7, Math.floor(axisWidth / minimumLabelSpacing)));
                        if (ticks.length <= targetCount) return;

                        const lastTickIndex = ticks.length - 1;
                        const minimumGapInTicks = Math.ceil(minimumLabelSpacing * lastTickIndex / axisWidth);
                        const lastHistoricalIndex = lastTickIndex - minimumGapInTicks;
                        const availableTickCount = Math.floor(lastTickIndex / minimumGapInTicks) + 1;
                        const visibleTickCount = Math.min(targetCount, availableTickCount);
                        const selectedTicks = [];
                        const regularTickCount = visibleTickCount - 1;
                        for (let i = 0; i < regularTickCount; i++) {
                            const tickIndex = regularTickCount === 1
                                ? 0
                                : Math.round(i * lastHistoricalIndex / (regularTickCount - 1));
                            selectedTicks.push(ticks[tickIndex]);
                        }
                        selectedTicks.push(ticks[lastTickIndex]);
                        axis.ticks = selectedTicks;
                    },
                    ticks: {
                        autoSkip: false,
                        minRotation: 0,
                        maxRotation: 0,
                        padding: 6,
                        color: '#6c757d',
                        font: { size: 11 },
                        callback(value) {
                            return formatChartDate(this.getLabelForValue(value), compactDateFormatter);
                        }
                    }
                },
                y: { beginAtZero: false }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                zoom: enableZoom ? {
                    limits: {
                        x: { min: 'original', max: 'original', minRange: 2 }
                    },
                    pan: {
                        enabled: true,
                        mode: 'x'
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x'
                    }
                } : { pan: { enabled: false }, zoom: { wheel: { enabled: false }, pinch: { enabled: false } } },
                tooltip: {
                    itemSort(a, b) {
                        return b.parsed.y - a.parsed.y ||
                            String(a.dataset.label).localeCompare(String(b.dataset.label));
                    },
                    callbacks: {
                        title(items) {
                            return items.length
                                ? formatChartDate(items[0].label, fullDateFormatter)
                                : '';
                        },
                        label(context) {
                            return context.dataset.label + ": " + context.formattedValue;
                        },
                        afterLabel(context) {
                            const change = context.dataset.ratingChanges?.[context.dataIndex];
                            if (change == null) return null;
                            const sign = change > 0 ? '+' : '';
                            return "Change: " + sign + change;
                        }
                    }
                }
            }
        }
    });
}