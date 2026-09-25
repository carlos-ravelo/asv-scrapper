export function createEloChart(ctx, existingChart, chartData, maintainAspectRatio = true) {
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
                y: { beginAtZero: false }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                    callbacks: {
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