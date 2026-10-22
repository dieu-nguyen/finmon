import { expect, type Page } from "@playwright/test";

type Point = { x: number; y: number };

export async function waitForChart(page: Page) {
  await expect(page.locator(".chart-stack canvas")).toBeVisible();
  await expect.poll(async () => page.locator("[_echarts_instance_]").count()).toBeGreaterThan(0);
}

export async function candlePoint(page: Page, index: number): Promise<Point> {
  return page.evaluate((dataIndex) => {
    const el = document.querySelector(".echarts-for-react");
    if (!el) throw new Error("chart root missing");
    const key = Object.keys(el).find((name) => name.startsWith("__reactFiber") || name.startsWith("__reactInternalInstance"));
    if (!key) throw new Error("react fiber missing");
    let fiber = (el as unknown as Record<string, { stateNode?: { getEchartsInstance?: () => EchartsLike }; return?: unknown }>)[key] as
      | { stateNode?: { getEchartsInstance?: () => EchartsLike }; return?: unknown }
      | undefined;
    let chart: EchartsLike | undefined;
    for (let i = 0; i < 12 && fiber; i += 1) {
      const inst = fiber.stateNode?.getEchartsInstance?.();
      if (inst) {
        chart = inst;
        break;
      }
      fiber = fiber.return as typeof fiber;
    }
    if (!chart) throw new Error("echarts instance missing");
    const option = chart.getOption() as { xAxis?: { data?: string[] }[]; series?: { data?: number[][] }[] };
    const dates = option.xAxis?.[0]?.data ?? [];
    const bars = option.series?.[0]?.data ?? [];
    const i = Math.max(0, Math.min(dataIndex, dates.length - 1));
    const close = bars[i]?.[1];
    if (dates[i] == null || close == null) throw new Error("candle missing");
    const pixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [dates[i], close]);
    if (!pixel) throw new Error("pixel missing");
    return { x: pixel[0], y: pixel[1] };
  }, index);
}

export async function clickCandle(page: Page, index: number) {
  const point = await candlePoint(page, index);
  await page.locator(".echarts-for-react").click({ position: point });
}

export async function drawingsFor(page: Page, ticker: string) {
  const res = await page.request.get(`/api/symbols/${ticker}/drawings`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { tool: string; points: { date: string; price: number }[] }[];
}

type EchartsLike = {
  getOption: () => unknown;
  convertToPixel: (finder: { xAxisIndex: number; yAxisIndex: number }, value: [string, number]) => number[] | undefined;
};
