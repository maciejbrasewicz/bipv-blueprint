import { expect, test } from "@playwright/test";

/**
 * UI release gate: stable navigation, useful first action, visible output,
 * mobile access to both inspectors, and no document-level horizontal scroll.
 */
test("premium workbench guides roof selection, design and review at desktop width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("layout-status")).toHaveText(
    "Geometria obliczona",
    {
      timeout: 30_000,
    },
  );
  const journey = page.getByTestId("design-journey");
  await expect(journey).toBeVisible();
  await expect(journey.getByRole("button", { name: /Budynek/ })).toBeVisible();
  await expect(
    journey.getByRole("button", { name: /Rozmieszczenie/ }),
  ).toBeVisible();
  await expect(
    journey.getByRole("button", { name: /Kontrola danych/ }),
  ).toBeVisible();
  await expect(page.locator(".canvas-confidence")).toContainText(
    "Scena demonstracyjna",
  );
  await expect(page.locator(".power-number")).toContainText("kWp");
  await expect(
    page.getByRole("button", { name: "Eksportuj bryłę w formacie GLB" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Ustal lokalizację budynku" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  const labels = await page.locator(".canvas-label").boundingBox();
  const controls = await page.locator(".view-controls").boundingBox();
  expect(labels && controls).toBeTruthy();
  expect(controls!.y).toBeGreaterThan(labels!.y + labels!.height + 3);
  const contrastRatios = await page.evaluate(() => {
    const luminance = (rgb: string) => {
      const channels = (rgb.match(/[0-9.]+/g) ?? []).slice(0, 3).map(Number);
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const pairs = [
      [".left-panel .panel-top", ".left-panel"],
      [".metric-grid > div > span", ".metric-grid > div"],
      [".status-bar", ".status-bar"],
    ];
    return pairs.map(([label, background]) => {
      const color = getComputedStyle(document.querySelector(label)!).color;
      const fill = getComputedStyle(
        document.querySelector(background)!,
      ).backgroundColor;
      const a = luminance(color);
      const b = luminance(fill);
      return {
        label,
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  });
  for (const item of contrastRatios) {
    expect(
      item.contrast,
      `WCAG AA text contrast: ${item.label}`,
    ).toBeGreaterThanOrEqual(4.5);
  }
  await page.screenshot({
    path: "test-results/workbench-v2-desktop.jpg",
    type: "jpeg",
    quality: 84,
  });

  await journey.getByRole("button", { name: /Rozmieszczenie/ }).click();
  await expect(
    page.getByRole("button", { name: "Warianty", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await journey.getByRole("button", { name: /Kontrola danych/ }).click();
  await expect(
    page.getByRole("button", { name: "Kontrola", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("ŚLAD OBLICZENIA")).toBeVisible();
  await journey.getByRole("button", { name: /Budynek/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Lokalizacja budynku" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zamknij lokalizację" }).click();
  await expect(
    page.getByRole("dialog", { name: "Lokalizacja budynku" }),
  ).toBeHidden();
});

test("360px workbench keeps tools reachable, panels dismissible and content inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(page.getByTestId("layout-status")).toHaveText(
    "Geometria obliczona",
    {
      timeout: 30_000,
    },
  );
  await expect(page.getByTestId("design-journey")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Kalkulator produkcji" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  const viewTool = await page
    .locator(".view-controls .icon-button")
    .first()
    .boundingBox();
  expect(viewTool?.width).toBeGreaterThanOrEqual(40);
  expect(viewTool?.height).toBeGreaterThanOrEqual(40);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/workbench-v2-mobile.jpg",
    type: "jpeg",
    quality: 85,
  });

  await page.getByRole("button", { name: "Wyniki projektu" }).click();
  await expect(page.locator(".right-panel.mobile-open")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Eksportuj bryłę w formacie GLB" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zamknij panel boczny" }).click();
  await expect(page.locator(".right-panel.mobile-open")).toHaveCount(0);

  await page.getByRole("button", { name: "Parametry projektu" }).click();
  await expect(page.locator(".left-panel.mobile-open")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ustal lokalizację budynku" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".left-panel.mobile-open")).toHaveCount(0);
});
