import { expect, test, type Locator, type Page } from "@playwright/test";

const SVG_VIEW_BOX = { width: 900, height: 600 };
const SVG_WORLD_VIEWPORT = { minX: 54, minY: 36, width: 792, height: 528 };

async function dragToWorld(
  page: Page,
  locator: Locator,
  world: { x: number; y: number },
): Promise<void> {
  const canvas = page.getByTestId("scene-canvas");
  const canvasBox = await canvas.boundingBox();
  const targetBox = await locator.boundingBox();
  if (!canvasBox || !targetBox) throw new Error("Editor target is not visible");

  const scale = Math.min(
    canvasBox.width / SVG_VIEW_BOX.width,
    canvasBox.height / SVG_VIEW_BOX.height,
  );
  const contentOffsetX = (canvasBox.width - SVG_VIEW_BOX.width * scale) / 2;
  const contentOffsetY = (canvasBox.height - SVG_VIEW_BOX.height * scale) / 2;
  const svgX = SVG_WORLD_VIEWPORT.minX + (world.x / 12) * SVG_WORLD_VIEWPORT.width;
  const svgY =
    SVG_WORLD_VIEWPORT.minY + (1 - world.y / 8) * SVG_WORLD_VIEWPORT.height;

  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + contentOffsetX + svgX * scale,
    canvasBox.y + contentOffsetY + svgY * scale,
    { steps: 4 },
  );
  await page.mouse.up();
}

test.describe("editor workbench", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("loads presets deterministically and exposes mode controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Concrete Partition" })).toBeVisible();
    await page.getByLabel("Scene preset").selectOption("hard-room");
    await expect(page.getByRole("heading", { name: "Hard Room" })).toBeVisible();
    await expect(page.getByTestId("wall-hard_north")).toHaveAttribute("data-material", "concrete_hard");

    await page.getByRole("button", { name: "Simulated" }).click();
    await expect(page.getByRole("button", { name: "Simulated" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Raw" }).click();
    await expect(page.getByRole("button", { name: "Raw" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Start Audio" }).click();
    await expect(page.getByRole("button", { name: "Stop Audio" })).toBeVisible();
    await expect(page.getByText(/Browser HRTF running/i)).toBeVisible();
  });

  test("drags a source and listener in world coordinates", async ({ page }) => {
    const source = page.getByTestId("source-radio");
    const listener = page.getByTestId("listener");
    const sourceBefore = await source.getAttribute("data-position");
    const listenerBefore = await listener.getAttribute("data-position");

    await source.dragTo(page.getByTestId("scene-canvas"), {
      targetPosition: { x: 600, y: 220 },
    });
    await listener.dragTo(page.getByTestId("scene-canvas"), {
      targetPosition: { x: 280, y: 380 },
    });

    await expect(source).not.toHaveAttribute("data-position", sourceBefore!);
    await expect(listener).not.toHaveAttribute("data-position", listenerBefore!);
  });

  test("adds and deletes a wall, changes material, and toggles a portal", async ({ page }) => {
    await page.getByRole("button", { name: "Add wall" }).click();
    const newWall = page.getByTestId(/^wall-user_wall_/);
    await expect(newWall).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Wall settings" })).toBeVisible();

    await page.getByLabel("Wall material").selectOption("wood_medium");
    await expect(newWall).toHaveAttribute("data-material", "wood_medium");
    await page.getByRole("button", { name: "Delete selected wall" }).click();
    await expect(newWall).toHaveCount(0);

    await page.getByTestId("portal-partition_door").click();
    await expect(page.getByRole("heading", { name: "Portal settings" })).toBeVisible();
    await page.getByRole("switch", { name: "Portal open" }).click();
    await expect(page.getByRole("switch", { name: "Portal open" })).toHaveAttribute("aria-checked", "false");
  });

  test("moves a hosted portal with the default partition endpoint and cascade-deletes it", async ({ page }) => {
    const partition = page.getByTestId("wall-partition_center");
    await partition.focus();
    await partition.press("Enter");
    const endpoint = page.getByTestId("endpoint-partition_center-a");
    await dragToWorld(page, endpoint, { x: 4, y: 0.5 });

    await expect(page.getByTestId("portal-partition_door")).toHaveAttribute(
      "data-position",
      "5.000,4.250",
    );
    await partition.focus();
    await partition.press("Enter");
    await page.getByRole("button", { name: "Delete selected wall" }).click();
    await expect(page.getByTestId("portal-partition_door")).toHaveCount(0);
  });

  test("lands narrow-screen pointer drags at the intended world coordinate", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const source = page.getByTestId("source-radio");

    await dragToWorld(page, source, { x: 8.5, y: 2.25 });

    await expect(source).toHaveAttribute("data-position", "8.500,2.250");
  });

  test("exposes SVG controls with visible focus and keyboard movement", async ({ page }) => {
    const canvas = page.getByRole("group", { name: /editable floor plan in meters/i });
    const listener = page.getByRole("button", { name: "Move listener" });
    const partition = page.getByRole("button", { name: "Select wall partition_center" });

    await expect(canvas).toBeVisible();
    await listener.focus();
    await expect(listener).toBeFocused();
    await expect(listener.locator(".listener-core")).toHaveCSS("stroke-width", "4px");
    await listener.press("ArrowRight");
    await listener.press("ArrowUp");
    await expect(listener).toHaveAttribute("data-position", "3.100,4.100");

    await partition.focus();
    await partition.press("Enter");
    await expect(page.getByRole("heading", { name: "Wall settings" })).toBeVisible();
    const endpoint = page.getByRole("button", {
      name: "Move a endpoint of partition_center",
    });
    await endpoint.focus();
    await endpoint.press("ArrowRight");
    await expect(endpoint).toHaveAttribute("data-position", "6.100,0.000");

    const portal = page.getByRole("button", { name: "Select portal partition_door" });
    await portal.focus();
    await portal.press(" ");
    await expect(page.getByRole("heading", { name: "Portal settings" })).toBeVisible();
  });
});
